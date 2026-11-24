import {Telegraf,Markup} from "telegraf";
import {randomBytes} from "node:crypto";
import {prisma} from "./db";
import {config} from "./config";
import {notifyAdminReview,notifyAdminWithdrawal,notifyAdminText,registerAdminReviewHandler,registerAdminWithdrawalHandler} from "./notificationBot";
import {reviewSubmission} from "./services/review";
export const bot=new Telegraf(process.env.BOT_TOKEN!);
const fmt=(k:number)=>"₦"+(k/100).toLocaleString("en-NG",{minimumFractionDigits:0,maximumFractionDigits:2});
async function userFor(ctx:any){
 const from=ctx.from;
 if(!from?.id)throw new Error("Telegram sender information is missing.");
 const telegramId=String(from.id);
 const payload=String(ctx.startPayload||"").trim();
 const ref=payload?await prisma.user.findUnique({where:{referralCode:payload}}):null;
 const user=await prisma.user.upsert({
  where:{telegramId},
  create:{
   telegramId,username:from.username,firstName:from.first_name,lastName:from.last_name,
   referralCode:randomBytes(8).toString("hex").toUpperCase(),
   referredById:ref?.telegramId===telegramId?null:ref?.id
  },
  update:{username:from.username,firstName:from.first_name,lastName:from.last_name}
 });
 await prisma.wallet.upsert({where:{userId:user.id},create:{userId:user.id},update:{}});
 return user;
}
const TASK_FLOW=[
 {type:"WEBSITE_REGISTRATION",title:"Website & App Registration",description:"1. Visit "+config.WEBSITE_URL+".\n2. Register on the website.\n3. Download the SoccerFounder app.\n4. Complete registration in the app.\n5. Upload a screenshot of your completed registration.\n\n⚠️ Screenshot evidence only. Do not type your name, email or phone number here.",rewardKobo:30000},
 {type:"SUPER_ONE_REGISTRATION",title:"SuperOne Registration",description:"1. Complete your SuperOne registration.\n2. Take a screenshot showing successful registration or your SuperOne ID.\n3. Upload the screenshot here.\n\n⚠️ Never share your password or OTP.",rewardKobo:20000},
 {type:"SPONSOR_CONFIRMATION",title:"Confirm Your Sponsor",description:"1. Confirm that your sponsor/team leader is Shane.\n2. Take a screenshot showing Shane as your sponsor.\n3. Upload the screenshot here.\n\nProtect unrelated personal information.",rewardKobo:10000},
 {type:"COACH_BOT_COMPLETION",title:"Complete the Coach Bot Steps",description:"1. Open @"+config.COACH_BOT_USERNAME+".\n2. Complete all six steps.\n3. Take a screenshot of the completion confirmation.\n4. Upload it here.",rewardKobo:10000},
 {type:"SUPPORT_GROUP_JOIN",title:"Join the Support Group",description:"1. Join the SoccerFounder Support Group: "+(config.SUPPORT_GROUP_INVITE_URL||"use the campaign support group invite")+".\n2. Take a screenshot showing you have joined.\n3. Upload the screenshot here.",rewardKobo:10000},
 {type:"FOOTBALL_ENGAGEMENT",title:"30-Day Football Engagement",description:"1. Participate in genuine football discussions for 30 days.\n2. Keep screenshots showing your participation.\n3. Upload your evidence after the 30 days are complete.",rewardKobo:30000}
] as const;
const taskEvidenceDrafts=new Map<string,number>();
async function showCurrentTask(ctx:any){
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}});
 if(!u)return ctx.reply("Please use /start first.");
 const [tasks,submissions]=await Promise.all([
  prisma.task.findMany({where:{active:true}}),
  prisma.taskSubmission.findMany({where:{userId:u.id}})
 ]);
 const next=TASK_FLOW.findIndex(item=>{
  const task=tasks.find(t=>t.type===item.type);
  const sub=task?submissions.find(s=>s.taskId===task.id):null;
  return !task||!sub||sub.status!=="APPROVED";
 });
 if(next===-1)return ctx.reply("🎉 All six tasks have been approved! Your approved task rewards are available in My wallet.");
 const item=TASK_FLOW[next],task=tasks.find(t=>t.type===item.type);
 if(!task)return ctx.reply("This campaign task is not configured yet. Please contact support.");
 const previous=submissions.find(s=>s.taskId===task.id);
 const previousDetails=previous?.details as {photoFileId?:string}|null;
 if(previous?.status==="PENDING"&&previousDetails?.photoFileId)return ctx.reply("📝 TASK "+(next+1)+" OF 6\n\n"+item.title+"\n💰 Reward: "+fmt(task.rewardKobo)+"\n\n📌 HOW TO COMPLETE\n"+item.description+"\n\n⏳ STATUS: UNDER REVIEW\nYour screenshot is awaiting admin approval.\n\nPlease wait for the decision.",Markup.inlineKeyboard([[Markup.button.callback("🔄 Check status","task_status")]]));
 const note=previous?.status==="REJECTED"?"\n\nYour previous submission was rejected. "+(previous.reviewNote||"Please review the instructions and submit new evidence."):"";
 return ctx.reply("📝 TASK "+(next+1)+" OF 6\n\n"+item.title+"\n💰 Reward: "+fmt(task.rewardKobo)+"\n\n📌 HOW TO COMPLETE\n"+item.description+note+"\n\n📸 When finished, tap DONE and upload your screenshot.\n🔒 The next task unlocks after admin approval.",Markup.inlineKeyboard([[Markup.button.callback("✅ DONE","task_done_"+(next+1))]]));
}
bot.start(async ctx=>{
 const telegramId=String(ctx.from?.id||"unknown");
 console.log("[START] /start received from Telegram user:",telegramId,"payload:",String(ctx.startPayload||"none"));
 try{
  await userFor(ctx);
  await ctx.reply("⚽ WELCOME TO SOCCERFOUNDER!\n\n📋 Complete 6 tasks and submit screenshot evidence.\n💰 Earn up to ₦1,100 in approved task rewards.\n👥 Earn ₦100 for each eligible referral who completes all 6 tasks.\n\n📌 Sponsor/team leader must be Shane. All rewards require admin verification.",Markup.inlineKeyboard([
   [Markup.button.callback("📝 My tasks","tasks"),Markup.button.callback("💰 My wallet","wallet")],
   [Markup.button.callback("👥 Invite friends","referral")],
   [Markup.button.callback("📊 Check status","task_status"),Markup.button.callback("ℹ️ Help / Support","start_help")]
  ]));
  console.log("[START] Welcome menu delivered to Telegram user:",telegramId);
 }catch(error:any){
  console.error("[START] Failed for Telegram user:",telegramId,"error:",error?.stack||error?.message||String(error));
  try{await ctx.reply("⚠️ SoccerFounder could not open your account right now. Your existing progress has not been deleted. Please try /start again in a moment. If this continues, contact support.");}
  catch(replyError){console.error("[START] Could not send failure reply to Telegram user:",telegramId,replyError);}
 }
});
bot.action("start_help",async ctx=>{
 await ctx.answerCbQuery();
 return ctx.reply("ℹ️ SOCCERFOUNDER HELP\n\nUse My tasks to complete the six campaign tasks in order. Upload screenshot evidence after pressing DONE. Admin approval unlocks the next task. My wallet shows approved rewards; Invite friends shows referral progress. For support, use the official SoccerFounder Support Group invite provided in the campaign. Never share passwords, OTPs or wallet recovery phrases.");
});
bot.action("tasks",async ctx=>{await ctx.answerCbQuery();await showCurrentTask(ctx);});
bot.action("task_status",async ctx=>{
 await ctx.answerCbQuery();
 const user=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!user)return ctx.reply("Please use /start first.");
 const [submissions,referrals,withdrawals,referralTransactions]=await Promise.all([
  prisma.taskSubmission.findMany({where:{userId:user.id},include:{task:true}}),
  prisma.user.findMany({where:{referredById:user.id},select:{id:true,submissions:{where:{status:"APPROVED"},select:{task:{select:{type:true}}}}}}),
  prisma.withdrawal.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},take:5}),
  prisma.walletTransaction.findMany({where:{userId:user.id,type:"REFERRAL_REWARD"},select:{amountKobo:true}})
 ]);
 const taskLines=TASK_FLOW.map((item,index)=>{
  const submission=submissions.find(row=>row.task.type===item.type);
  const evidence=submission?.details as {photoFileId?:string}|null;
  if(!submission||!evidence?.photoFileId)return (index+1)+". "+item.title+" — NOT SUBMITTED";
  if(submission.status==="PENDING")return (index+1)+". "+item.title+" — UNDER REVIEW (screenshot received). Pending reward: "+fmt(submission.task.rewardKobo);
  if(submission.status==="REJECTED")return (index+1)+". "+item.title+" — REJECTED. "+(submission.reviewNote||"Please submit new screenshot evidence.");
  if(submission.status==="APPROVED"&&submission.rewardCredited)return (index+1)+". "+item.title+" — COMPLETED. Earned: "+fmt(submission.task.rewardKobo);
  if(submission.status==="APPROVED")return (index+1)+". "+item.title+" — APPROVED. Reward credit is being checked; contact support if it does not appear in your wallet.";
  return (index+1)+". "+item.title+" — NOT SUBMITTED";
 });
 const completed=taskLines.filter(line=>line.includes(" — COMPLETED.")).length;
 const pending=taskLines.filter(line=>line.includes(" — UNDER REVIEW")).length;
 const pendingTaskValue=submissions.filter(row=>row.status==="PENDING"&&Boolean((row.details as {photoFileId?:string}|null)?.photoFileId)).reduce((sum,row)=>sum+row.task.rewardKobo,0);
 const approvedTaskValue=submissions.filter(row=>row.status==="APPROVED"&&row.rewardCredited).reduce((sum,row)=>sum+row.task.rewardKobo,0);
 const fullyCompletedReferrals=referrals.filter(ref=>{
  const types=new Set(ref.submissions.map(s=>s.task.type));
  return TASK_FLOW.every(task=>types.has(task.type));
 }).length;
 const referralEarned=referralTransactions.reduce((sum,row)=>sum+row.amountKobo,0);
 const withdrawalLines=withdrawals.length?withdrawals.map(w=>"• "+fmt(w.amountKobo)+" — "+w.status+(w.adminNote?" ("+w.adminNote+")":"")).join("\n"):"No withdrawal requests yet.";
 const wallet=user.wallet;
 const report="📊 YOUR SOCCERFOUNDER DASHBOARD\n\n📋 TASK PROGRESS\n• Completed: "+completed+"/6\n• Under review: "+pending+"\n• Not submitted: "+(6-completed-pending-taskLines.filter(line=>line.includes(" — REJECTED")).length)+"\n\n📝 YOUR TASKS\n"+taskLines.join("\n")+"\n\n💰 TASK REWARDS\n• Approved: "+fmt(approvedTaskValue)+"\n• Awaiting review: "+fmt(pendingTaskValue)+"\n\n👥 REFERRALS\n• People invited: "+referrals.length+"\n• Fully completed: "+fullyCompletedReferrals+"\n• Reward per completed referral: ₦100\n• Rewards credited: "+fmt(referralEarned)+"\n\n👛 WALLET\n• Available: "+fmt(wallet?.availableKobo||0)+"\n• Pending withdrawal: "+fmt(wallet?.pendingKobo||0)+"\n• Total earned: "+fmt(wallet?.totalEarnedKobo||0)+"\n• Withdrawn: "+fmt(wallet?.withdrawnKobo||0)+"\n• Minimum withdrawal: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\n\n💳 WITHDRAWAL HISTORY\n"+withdrawalLines+"\n\nℹ️ Figures reflect your saved account records.";
 return ctx.reply(report,Markup.inlineKeyboard([[Markup.button.callback("🔄 Refresh status","task_status")],[Markup.button.callback("📝 Open my tasks","tasks")],[Markup.button.callback("💰 My wallet","wallet")]]));
});
for(let n=1;n<=6;n++){
 bot.action("task_done_"+n,async ctx=>{
  await ctx.answerCbQuery();
  const user=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}});
  if(!user)return ctx.reply("Please use /start first.");
  const [tasks,subs]=await Promise.all([prisma.task.findMany({where:{active:true}}),prisma.taskSubmission.findMany({where:{userId:user.id}})]);
  const current=TASK_FLOW.findIndex(item=>{const t=tasks.find(x=>x.type===item.type);const s=t?subs.find(x=>x.taskId===t.id):null;return !t||!s||s.status!=="APPROVED";});
  if(current!==n-1)return showCurrentTask(ctx);
  const currentTask=tasks.find(x=>x.type===TASK_FLOW[n-1].type);
  const currentSubmission=currentTask?subs.find(x=>x.taskId===currentTask.id):null;
  if(currentSubmission?.status==="PENDING"&&Boolean((currentSubmission.details as {photoFileId?:string}|null)?.photoFileId))return ctx.reply("Your screenshot is already awaiting admin review. Please wait for approval before continuing.");
  taskEvidenceDrafts.set(String(ctx.from.id),n);
  return ctx.reply("📸 SUBMIT TASK "+n+"\n\nPlease upload a screenshot showing that you completed this task.\n\n⚠️ Screenshot required. Never send passwords, OTPs or login details.\n\nSend /cancel to stop.");
 });
}
bot.on("photo",async ctx=>{
 console.log("[SCREENSHOT] Incoming photo update received. Telegram user:",ctx.from.id,"Photo sizes:",ctx.message.photo.length);
 const key=String(ctx.from.id),u=await prisma.user.findUnique({where:{telegramId:key}});
 if(!u)return ctx.reply("Please use /start first.");
 let n=taskEvidenceDrafts.get(key);
 if(!n){
  const [tasks,subs]=await Promise.all([prisma.task.findMany({where:{active:true}}),prisma.taskSubmission.findMany({where:{userId:u.id}})]);
  const current=TASK_FLOW.findIndex(item=>{const task=tasks.find(t=>t.type===item.type);const sub=task?subs.find(s=>s.taskId===task.id):null;return !task||!sub||sub.status!=="APPROVED";});
  if(current<0)return ctx.reply("🎉 All six tasks have already been approved. Your rewards are in My wallet.");
  const currentTask=tasks.find(t=>t.type===TASK_FLOW[current].type);
  const currentSubmission=currentTask?subs.find(s=>s.taskId===currentTask.id):null;
  if(currentSubmission?.status==="PENDING"&&Boolean((currentSubmission.details as {photoFileId?:string}|null)?.photoFileId)){
   console.log("[SCREENSHOT] Pending evidence found; retrying notification. Submission:",currentSubmission.id,"Task:",current+1);
   try{
    const delivered=await notifyAdminReview("📩 RETRY — TASK SUBMISSION\n\n👤 Participant: "+(u.firstName||"")+" "+(u.lastName||"")+" (@"+(u.username||"no username")+")\n🆔 Telegram ID: "+u.telegramId+"\n📝 Task: "+(current+1)+"/6 — "+currentTask!.title+"\n📎 Proof file: RECEIVED (image stored)\n💰 Reward: "+fmt(currentTask!.rewardKobo)+"\n🔖 Submission: "+currentSubmission.id+"\n\nThis is a retry of the saved screenshot.",currentSubmission.id);
    if(delivered)return ctx.reply("✅ Your submission has been received and is awaiting review. Please wait for the decision.");
    // The participant was already informed when the original submission was saved.
    // Do not send another failure message on every photo/retry attempt.
    console.warn("[SCREENSHOT] Retry still not delivered; keeping saved evidence and suppressing duplicate participant alert. Submission:", currentSubmission.id);
    return;
   }catch(error){console.error("Retry of pending task screenshot failed:",error);return ctx.reply("⚠️ Your screenshot is saved, but the admin notification could not be delivered. Please contact support.");}
  }
  n=current+1;
 }
 const item=TASK_FLOW[n-1];
 if(!u)return ctx.reply("Please use /start first.");
 const task=await prisma.task.findUnique({where:{type:item.type as any}});
 if(!task)return ctx.reply("This task is not configured yet.");
 console.log("[SCREENSHOT] Saving new task evidence. Task:",n,"User:",u.telegramId);
 const photo=ctx.message.photo[ctx.message.photo.length-1],caption=ctx.message.caption||"";
 const submission=await prisma.taskSubmission.upsert({where:{userId_taskId:{userId:u.id,taskId:task.id}},create:{userId:u.id,taskId:task.id,details:{text:caption,photoFileId:photo.file_id}},update:{details:{text:caption,photoFileId:photo.file_id},status:"PENDING",reviewNote:null,reviewedAt:null,rewardCredited:false}});
 taskEvidenceDrafts.delete(key);
 const delivered=await notifyAdminReview("📩 NEW TASK SUBMISSION\n\n👤 Participant: "+(u.firstName||"")+" "+(u.lastName||"")+" (@"+(u.username||"no username")+")\n🆔 Telegram ID: "+u.telegramId+"\n📝 Task: "+n+"/6 — "+task.title+"\n📎 Proof file: RECEIVED (image stored)\n💰 Reward: "+fmt(task.rewardKobo)+"\n🔖 Submission: "+submission.id+"\n\n"+(caption?"Caption: "+caption:"No caption."),submission.id);
 if(delivered){
  await ctx.reply("📸 SUBMISSION RECEIVED\n\n• Task: "+n+"/6 — "+task.title+"\n• Reward: "+fmt(task.rewardKobo)+"\n• Status: ⏳ Under review\n\nYour submission has been received and is awaiting review. Please wait for approval.");
 }else{
  await ctx.reply("⚠️ SUBMISSION SAVED — REVIEW ALERT FAILED\n\n• Task: "+n+"/6 — "+task.title+"\n• Status: Not yet under review\n\nYour proof is saved, but the review alert could not be sent. Please contact support. Do not submit it again.");
 }

});
bot.command("submit",ctx=>ctx.reply("Please use My tasks to complete the campaign one task at a time. Open the current task, press DONE, then send your evidence when prompted."));
bot.action("wallet",async ctx=>{
 await ctx.answerCbQuery(); const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!u)return ctx.reply("Please use /start first.");
 const w=u.wallet; await ctx.reply("👛 YOUR WALLET\n\n• Available: "+fmt(w?.availableKobo||0)+"\n• Pending withdrawal: "+fmt(w?.pendingKobo||0)+"\n• Total earned: "+fmt(w?.totalEarnedKobo||0)+"\n• Total withdrawn: "+fmt(w?.withdrawnKobo||0)+"\n• Minimum withdrawal: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\n\nTap Request withdrawal or send /withdraw to begin.");
});
type WithdrawalDraft = { step: "amount" | "name" | "bank" | "account" | "confirm"; amountKobo?: number; accountName?: string; bankName?: string; accountNumber?: string };
const withdrawalDrafts = new Map<string, WithdrawalDraft>();

async function askWithdrawalAmount(ctx:any) {
 const user=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!user)return ctx.reply("Please use /start first.");
 if(!user.wallet)return ctx.reply("Your wallet is not ready yet. Please try again later.");
 withdrawalDrafts.set(String(ctx.from.id),{step:"amount"});
 return ctx.reply("🏦 WITHDRAWAL REQUEST\n\n• Minimum: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\n• Available: "+fmt(user.wallet.availableKobo)+"\n\nEnter the amount in naira (example: 2500).\nSend /cancel to stop.");
}
bot.action("withdraw_help",async ctx=>{await ctx.answerCbQuery();await askWithdrawalAmount(ctx);});
bot.command("withdraw",async ctx=>askWithdrawalAmount(ctx));
bot.command("cancel",async ctx=>{
 const hadTask=taskEvidenceDrafts.delete(String(ctx.from.id));
 const hadDraft=withdrawalDrafts.delete(String(ctx.from.id));
 await ctx.reply((hadDraft||hadTask)?"Your current process has been cancelled. No money was deducted.":"There is no active process to cancel.");
});
bot.action("withdraw_cancel",async ctx=>{
 await ctx.answerCbQuery();withdrawalDrafts.delete(String(ctx.from.id));
 await ctx.reply("Your withdrawal request has been cancelled. No money was deducted.");
});
bot.action(/^withdraw_user_cancel_([A-Za-z0-9_-]+)$/,async ctx=>{
 await ctx.answerCbQuery();
 const withdrawalId=ctx.match[1],telegramId=String(ctx.from.id);
 try{
  const result=await prisma.$transaction(async tx=>{
   const user=await tx.user.findUnique({where:{telegramId}});
   if(!user)throw new Error("USER_NOT_FOUND");
   const request=await tx.withdrawal.findUnique({where:{id:withdrawalId}});
   if(!request||request.userId!==user.id)throw new Error("WITHDRAWAL_NOT_FOUND");
   if(request.status==="PAID")throw new Error("ALREADY_PAID");
   if(request.status==="CANCELLED"||request.status==="REJECTED")throw new Error("ALREADY_RETURNED");
   const changed=await tx.withdrawal.updateMany({where:{id:withdrawalId,userId:user.id,status:{in:["PENDING","APPROVED"]}},data:{status:"CANCELLED",adminNote:"Cancelled by participant before payment confirmation"}});
   if(changed.count!==1)throw new Error("STATUS_CHANGED");
   await tx.wallet.update({where:{userId:user.id},data:{pendingKobo:{decrement:request.amountKobo},availableKobo:{increment:request.amountKobo}}});
   await tx.walletTransaction.create({data:{userId:user.id,type:"WITHDRAWAL_REFUND",amountKobo:request.amountKobo,reference:"withdrawal:"+withdrawalId+":participant-cancel-refund",description:"Withdrawal cancelled by participant; reserved funds returned to available balance"}});
   return request;
  });
  await ctx.editMessageText("↩️ WITHDRAWAL CANCELLED — FUNDS RETURNED\n\n• Amount returned: "+fmt(result.amountKobo)+"\n• Status: CANCELLED / RETURNED\n\nThe full amount is back in your available wallet balance. You can start a new withdrawal request whenever you are ready.");
  await notifyAdminText("↩️ WITHDRAWAL CANCELLED BY PARTICIPANT\n\nWithdrawal ID: "+withdrawalId+"\nTelegram ID: "+telegramId+"\nAmount returned: "+fmt(result.amountKobo)+"\nStatus: CANCELLED / RETURNED\n\nDo not make this payment. The participant has received the funds back in their available wallet.");
 }catch(error:any){
  const msg=String(error?.message||"");
  const response=msg==="ALREADY_PAID"?"This withdrawal has already been paid and cannot be reversed here.":msg==="ALREADY_RETURNED"?"This withdrawal has already been cancelled or returned.":msg==="WITHDRAWAL_NOT_FOUND"?"This withdrawal request was not found in your account.":"This request can no longer be cancelled. Please refresh your wallet or contact support.";
  await ctx.reply(response);
 }
});
bot.action("withdraw_confirm",async ctx=>{
 await ctx.answerCbQuery();
 const key=String(ctx.from.id),draft=withdrawalDrafts.get(key);
 if(!draft||draft.step!=="confirm"||!draft.amountKobo||!draft.accountName||!draft.bankName||!draft.accountNumber)return ctx.reply("Your withdrawal details have expired. Please start again with /withdraw.");
 const user=await prisma.user.findUnique({where:{telegramId:key},include:{wallet:true}});
 if(!user){withdrawalDrafts.delete(key);return ctx.reply("Please use /start first.");}
 const availableBefore=user.wallet?.availableKobo||0;
 if(draft.amountKobo<config.MIN_WITHDRAWAL_NGN*100){
  withdrawalDrafts.delete(key);
  return ctx.reply("❌ Withdrawal not submitted. The minimum withdrawal is "+fmt(config.MIN_WITHDRAWAL_NGN*100)+". Your requested amount is "+fmt(draft.amountKobo)+". No funds were deducted.");
 }
 if(availableBefore<draft.amountKobo){
  withdrawalDrafts.delete(key);
  const shortfall=draft.amountKobo-availableBefore;
  return ctx.reply("❌ INSUFFICIENT BALANCE\n\n• Requested: "+fmt(draft.amountKobo)+"\n• Available: "+fmt(availableBefore)+"\n• Still needed: "+fmt(shortfall)+"\n\nNo withdrawal was created and no funds were deducted.");
 }
 try{
  const withdrawal=await prisma.$transaction(async tx=>{
   const changed=await tx.wallet.updateMany({where:{userId:user.id,availableKobo:{gte:draft.amountKobo!}},data:{availableKobo:{decrement:draft.amountKobo!},pendingKobo:{increment:draft.amountKobo!}}});
   if(changed.count!==1)throw new Error("INSUFFICIENT_BALANCE");
   const request=await tx.withdrawal.create({data:{userId:user.id,amountKobo:draft.amountKobo!,accountHolderName:draft.accountName!,bankName:draft.bankName!,accountNumber:draft.accountNumber!}});
   await tx.walletTransaction.create({data:{userId:user.id,type:"WITHDRAWAL_RESERVE",amountKobo:draft.amountKobo!,reference:"withdrawal:"+request.id+":reserve",description:"Withdrawal request reserved - "+draft.bankName}});
   return request;
  });
  withdrawalDrafts.delete(key);
  await ctx.reply("✅ WITHDRAWAL REQUEST SUBMITTED\n\n• Amount: "+fmt(draft.amountKobo)+"\n• Account name: "+draft.accountName+"\n• Bank: "+draft.bankName+"\n• Account number: "+draft.accountNumber+"\n• Status: ⏳ Pending review\n\nYour funds are reserved, not paid. Until an admin confirms payment, you can cancel this request and the full amount will return to your available wallet balance.\n🔖 Reference: "+withdrawal.id,Markup.inlineKeyboard([[Markup.button.callback("↩️ Cancel withdrawal & return funds","withdraw_user_cancel_"+withdrawal.id)]]));
  await notifyAdminWithdrawal("💸 NEW WITHDRAWAL REQUEST\nParticipant: "+(user.firstName||"")+" "+(user.lastName||"")+" (@"+(user.username||"no username")+")\nTelegram ID: "+user.telegramId+"\nAmount: "+fmt(draft.amountKobo)+"\nAccount name: "+draft.accountName+"\nBank: "+draft.bankName+"\nAccount number: "+draft.accountNumber+"\nStatus: PENDING REVIEW\nWithdrawal ID: "+withdrawal.id+"\n\nAfter you manually transfer the money, press the Confirm Paid button below. The participant will receive a payment confirmation in the Airdrop Bot.",withdrawal.id);
 }catch(e:any){if(e.message==="INSUFFICIENT_BALANCE")return ctx.reply("Your available balance is no longer sufficient. No withdrawal was created.");console.error("Withdrawal submission failed",e);return ctx.reply("Sorry, we could not submit your withdrawal. Please try again later.");}
});
bot.on("text",async(ctx:any,next:any)=>{
 const key=String(ctx.from.id);
 if(!taskEvidenceDrafts.has(key))return next();
 const answer=ctx.message.text.trim();
 if(answer.startsWith("/"))return next();
 return ctx.reply("📸 A screenshot is required for this task. Please upload a screenshot using the photo attachment button. You may add a short caption, but text alone cannot be submitted as proof.");
});
bot.on("text",async(ctx:any,next:any)=>{
 const key=String(ctx.from.id),draft=withdrawalDrafts.get(key);
 if(!draft)return next();
 const answer=ctx.message.text.trim();
 if(answer.startsWith("/"))return next();
 if(draft.step==="amount"){
  // Validate the requested amount and available wallet balance BEFORE asking for any bank details.
  const normalized=answer.replace(/[₦,\\s]/g,"");
  if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))return ctx.reply("❌ INVALID AMOUNT\n\nEnter a valid naira amount, for example 2500. No withdrawal has been created.");
  const amount=Number(normalized);
  if(!Number.isFinite(amount)||amount<=0)return ctx.reply("❌ The withdrawal amount must be greater than zero. Please enter a valid amount.");
  const amountKobo=Math.round(amount*100);
  draft.amountKobo=amountKobo;draft.step="name";
  return ctx.reply("✅ AMOUNT RECORDED\n\n• Withdrawal amount: "+fmt(amountKobo)+"\n\nNext, enter the bank account holder's full name.");
 }
 if(draft.step==="name"){
  if(answer.length<3||answer.length>100)return ctx.reply("Please enter a valid account holder name (3–100 characters).");
  draft.accountName=answer;draft.step="bank";return ctx.reply("🏦 Enter the name of the bank that should receive your payment.");
 }
 if(draft.step==="bank"){
  if(answer.length<2||answer.length>80)return ctx.reply("Please enter a valid bank name.");
  draft.bankName=answer;draft.step="account";return ctx.reply("🔢 Enter your 10-digit bank account number.");
 }
 if(draft.step==="account"){
  if(!/^\d{10}$/.test(answer))return ctx.reply("Your account number must contain exactly 10 digits. Please try again.");
  draft.accountNumber=answer;draft.step="confirm";
  return ctx.reply("🔎 CONFIRM WITHDRAWAL\n\n• Amount: "+fmt(draft.amountKobo||0)+"\n• Account name: "+draft.accountName+"\n• Bank: "+draft.bankName+"\n• Account number: "+draft.accountNumber+"\n\nCheck that all details are correct before confirming.",Markup.inlineKeyboard([[Markup.button.callback("✅ Confirm withdrawal","withdraw_confirm")],[Markup.button.callback("Cancel","withdraw_cancel")]]));
 }
 return next();
});
bot.action("referral",async ctx=>{
 await ctx.answerCbQuery();
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}});
 if(!u)return ctx.reply("Please use /start first.");
 const [referrals,rewardTransactions]=await Promise.all([
  prisma.user.findMany({where:{referredById:u.id},include:{submissions:{include:{task:true}}},orderBy:{createdAt:"asc"}}),
  prisma.walletTransaction.findMany({where:{userId:u.id,type:"REFERRAL_REWARD"},select:{amountKobo:true}})
 ]);
 const taskProgress=referrals.map(ref=>{
  const approved=new Set(ref.submissions.filter(sub=>sub.status==="APPROVED").map(sub=>sub.task.type));
  const pending=ref.submissions.filter(sub=>sub.status==="PENDING"&&Boolean((sub.details as {photoFileId?:string}|null)?.photoFileId)).length;
  return {ref,approved:approved.size,pending,complete:TASK_FLOW.every(task=>approved.has(task.type))};
 });
 const completed=taskProgress.filter(row=>row.complete).length;
 const active=taskProgress.filter(row=>row.ref.submissions.length>0&&!row.complete).length;
 const pendingReviews=taskProgress.reduce((sum,row)=>sum+row.pending,0);
 const rewardEarned=rewardTransactions.reduce((sum,row)=>sum+row.amountKobo,0);
 const lines=taskProgress.slice(0,15).map((row,index)=>{
  const name=[row.ref.firstName,row.ref.lastName].filter(Boolean).join(" ")||"Participant";
  const username=row.ref.username?" @"+row.ref.username:"";
  const state=row.complete?(row.ref.referralRewardCredited?"✅ COMPLETED — ₦100 reward credited":"🎉 COMPLETED — reward processing"):(row.approved>0?"🔄 IN PROGRESS":"🆕 JUST JOINED");
  return (index+1)+". "+name+username+"\n   Tasks approved: "+row.approved+"/6"+(row.pending?" | Under review: "+row.pending:"")+"\n   "+state;
 });
 const link="https://t.me/"+config.BOT_USERNAME+"?start="+u.referralCode;
 const report="👥 REFERRAL DASHBOARD\n\n🔗 YOUR INVITE LINK\n"+link+"\n\n📊 SUMMARY\n• Invited: "+referrals.length+"\n• In progress: "+active+"\n• Awaiting task review: "+pendingReviews+"\n• Completed all 6 tasks: "+completed+"\n• Rewards credited: "+fmt(rewardEarned)+"\n• Reward per eligible referral: ₦100\n\n📋 RECENT REFERRALS\n"+(lines.length?lines.join("\n\n"):"No referrals yet. Share your link to invite participants.")+(referrals.length>15?"\n\nShowing 15 recent referrals. Totals include everyone.":"")+"\n\n🎁 ₦100 is credited once when a referral gets all 6 tasks approved. Pending or rejected tasks do not count.";
 return ctx.reply(report,Markup.inlineKeyboard([
  [Markup.button.url("🔗 Share invite link",link)],
  [Markup.button.callback("🔄 Refresh referral dashboard","referral")],
  [Markup.button.callback("💰 My wallet","wallet")]
 ]));
});
bot.command("tasks",ctx=>ctx.reply("Tap My tasks from /start."));
bot.command("wallet",async ctx=>{
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!u)return ctx.reply("Please use /start first.");
 const w=u.wallet;return ctx.reply("👛 YOUR WALLET\n\n• Available: "+fmt(w?.availableKobo||0)+"\n• Pending withdrawal: "+fmt(w?.pendingKobo||0)+"\n• Total earned: "+fmt(w?.totalEarnedKobo||0)+"\n• Withdrawn: "+fmt(w?.withdrawnKobo||0)+"\n• Minimum withdrawal: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\n\nSend /withdraw to request a payout.");
});
bot.command("help",ctx=>ctx.reply("Commands: /start, /tasks, /submit 1 details, /wallet, /withdraw. Contact the SoccerFounder Support Group using the invite link provided in the campaign."));
registerAdminWithdrawalHandler(async (withdrawalId, adminId) => {
 const result=await prisma.$transaction(async tx=>{
  const withdrawal=await tx.withdrawal.findUnique({where:{id:withdrawalId},include:{user:true}});
  if(!withdrawal)throw new Error("Withdrawal not found");
  if(withdrawal.status==="PAID")throw new Error("already paid");
  if(withdrawal.status==="REJECTED"||withdrawal.status==="CANCELLED")throw new Error("Withdrawal is no longer payable");
  const changed=await tx.withdrawal.updateMany({where:{id:withdrawalId,status:{in:["PENDING","APPROVED"]}},data:{status:"PAID",adminNote:"Payment manually confirmed from admin notification bot"}});
  if(!changed.count)throw new Error("Withdrawal status changed; refresh the admin dashboard");
  await tx.wallet.update({where:{userId:withdrawal.userId},data:{pendingKobo:{decrement:withdrawal.amountKobo},withdrawnKobo:{increment:withdrawal.amountKobo}}});
  await tx.adminActionLog.create({data:{adminId,action:"WITHDRAWAL_MARKED_PAID",targetId:withdrawalId,metadata:{source:"admin_notification_bot"}}});
  return withdrawal;
 });
 const amount=fmt(result.amountKobo);
 try {
  await bot.telegram.sendMessage(Number(result.user.telegramId),"✅ PAYMENT SUCCESSFUL — SOCCERFOUNDER\n\nYour withdrawal has been marked as PAID.\n\n• Amount: "+amount+"\n• Bank: "+result.bankName+"\n• Account name: "+result.accountHolderName+"\n• Status: PAID\n\nThank you for participating in SoccerFounder.");
 } catch(error) { console.error("Participant withdrawal paid notification failed:",error); }
 return "Withdrawal "+withdrawalId+" marked PAID. Participant "+result.user.telegramId+" has been notified.";
});
registerAdminReviewHandler(async (submissionId, approved, adminId) => {
 const existing=await prisma.taskSubmission.findUnique({where:{id:submissionId},include:{user:true,task:true}});
 if(!existing)throw new Error("Submission not found");
 await reviewSubmission(submissionId,approved,approved?"Approved from admin notification bot":"Please review the task instructions and submit new screenshot evidence.",adminId);
 const message=approved
  ? "✅ TASK APPROVED\n\n• Task: "+existing.task.title+"\n• Reward credited: "+fmt(existing.task.rewardKobo)+"\n\nYour next task is now unlocked. Tap My tasks to continue."
  : "❌ TASK NOT APPROVED\n\n• Task: "+existing.task.title+"\n\nPlease review the instructions and submit a new screenshot.";
 try { await bot.telegram.sendMessage(Number(existing.user.telegramId),message); } catch (error) { console.error("Participant task review notification failed:",error); }
 if(approved&&existing.user.referredById){
  try{
   const [referrer,referred]=await Promise.all([
    prisma.user.findUnique({where:{id:existing.user.referredById},select:{telegramId:true}}),
    prisma.user.findUnique({where:{id:existing.user.id},include:{submissions:{where:{status:"APPROVED"},include:{task:{select:{type:true}}}}}})
   ]);
   if(referrer&&referred){
    const approvedTypes=new Set(referred.submissions.map(row=>row.task.type));
    const progress=TASK_FLOW.filter(task=>approvedTypes.has(task.type)).length;
    const completedReferral=TASK_FLOW.every(task=>approvedTypes.has(task.type));
    const bonusCredited=referred.referralRewardCredited;
    const referralMessage="🎉 REFERRAL UPDATE\n\n• Participant: "+(existing.user.firstName||"A participant you invited")+"\n• Approved task: "+existing.task.title+"\n• Progress: "+progress+"/6 tasks\n\n"+(completedReferral?"🏆 All 6 tasks approved! "+(bonusCredited?"Your ₦100 reward has been credited.":"Your ₦100 reward is being processed."):"You earn ₦100 when all 6 tasks are approved.\n\nOpen Invite friends to view progress.");
    await bot.telegram.sendMessage(Number(referrer.telegramId),referralMessage);
   }
  }catch(error){console.error("Referrer task progress notification failed:",error);}
 }
 return approved ? "Reward credited: "+fmt(existing.task.rewardKobo) : "Participant can resubmit.";
});
bot.catch((err)=>console.error("Bot error",err));
