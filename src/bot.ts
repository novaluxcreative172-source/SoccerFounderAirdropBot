import {Telegraf,Markup} from "telegraf";
import {randomBytes} from "node:crypto";
import {prisma} from "./db";
import {config} from "./config";
export const bot=new Telegraf(process.env.BOT_TOKEN!);
const fmt=(k:number)=>"₦"+(k/100).toLocaleString("en-NG",{minimumFractionDigits:0,maximumFractionDigits:2});
async function userFor(ctx:any){
 const f=ctx.from; const found=await prisma.user.findUnique({where:{telegramId:String(f.id)}});
 if(found)return found;
 const payload=ctx.startPayload||"";
 const ref=payload?await prisma.user.findUnique({where:{referralCode:payload}}):null;
 const user=await prisma.user.create({data:{telegramId:String(f.id),username:f.username,firstName:f.first_name,lastName:f.last_name,referralCode:randomBytes(5).toString("hex").toUpperCase(),referredById:ref?.telegramId===String(f.id)?null:ref?.id,wallet:{create:{}}}});
 return user;
}
const TASK_FLOW=[
 {type:"WEBSITE_REGISTRATION",title:"Register on the SoccerFounder Website",description:"1. Visit "+config.WEBSITE_URL+". 2. Register on the website. 3. Download the SoccerFounder app from the website and complete the registration in the app. 4. Take a screenshot showing that your registration is complete, then send the screenshot here. Your evidence for this task must be a screenshot of your completed registration. Do not type your name, email or phone number in the chat.",rewardKobo:10000},
 {type:"SUPER_ONE_REGISTRATION",title:"Super One Registration",description:"Complete your Super One registration. Take a clear screenshot showing your completed registration or Super One ID in the app, then upload that screenshot here. Do not send your password, OTP or other login security details.",rewardKobo:10000},
 {type:"SPONSOR_CONFIRMATION",title:"Confirm Your Sponsor",description:"Your sponsor/team leader must be Shane. Take a screenshot showing Shane as your sponsor/team leader in the relevant account screen, then upload it here. Hide unrelated personal information where possible.",rewardKobo:10000},
 {type:"COACH_BOT_COMPLETION",title:"Complete the Coach Bot Steps",description:"Open @"+config.COACH_BOT_USERNAME+" and complete all six onboarding steps. Take a screenshot showing the completed steps or completion confirmation, then upload it here.",rewardKobo:10000},
 {type:"SUPPORT_GROUP_JOIN",title:"Join the Support Group",description:"Join the SoccerFounder Support Group: "+(config.SUPPORT_GROUP_INVITE_URL||"use the campaign support group invite")+". Take a screenshot showing that you have joined the group, then upload it here.",rewardKobo:10000},
 {type:"FOOTBALL_ENGAGEMENT",title:"30-Day Football Engagement",description:"Complete 30 days of genuine football engagement. When the 30 days are complete, upload screenshots showing your participation across the period. The admin will review the evidence.",rewardKobo:30000}
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
 if(previous?.status==="PENDING")return ctx.reply("📝 TASK "+(next+1)+" OF 6\\n"+item.title+"\\nReward: "+fmt(task.rewardKobo)+"\\n\\n"+item.description+"\\n\\n⏳ STATUS: EVIDENCE RECEIVED — WAITING FOR ADMIN REVIEW.\\n\\nYou have already submitted this task. There is nothing else to submit right now. Once the admin approves it, the bot will unlock and send you the next task. You can check back by tapping My tasks.",Markup.inlineKeyboard([[Markup.button.callback("🔄 Check task status","tasks")]]));
 const note=previous?.status==="REJECTED"?"\n\nYour previous submission was rejected. "+(previous.reviewNote||"Please review the instructions and submit new evidence."):"";
 return ctx.reply("📝 TASK "+(next+1)+" OF 6\n"+item.title+"\nReward: "+fmt(task.rewardKobo)+"\n\n"+item.description+note+"\n\nComplete this task, then press DONE to submit your evidence. The next task unlocks after admin approval.",Markup.inlineKeyboard([[Markup.button.callback("✅ DONE","task_done_"+(next+1))]]));
}
bot.start(async ctx=>{
 await userFor(ctx);
 await ctx.reply("⚽ Welcome! Complete tasks, earn rewards and invite friends.",Markup.inlineKeyboard([
  [Markup.button.callback("📝 My tasks","tasks"),Markup.button.callback("💰 My wallet","wallet")],
  [Markup.button.callback("👥 Invite friends","referral")]
 ]));
});
bot.action("tasks",async ctx=>{await ctx.answerCbQuery();await showCurrentTask(ctx);});
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
  if(currentSubmission?.status==="PENDING")return ctx.reply("Your evidence is already awaiting admin review. Please wait for approval before continuing.");
  taskEvidenceDrafts.set(String(ctx.from.id),n);
  return ctx.reply("📸 Please upload a screenshot proving that you completed Task "+n+". Screenshots are required for review. You may add a short caption, but do not send passwords, OTPs or login details. Send /cancel to stop.");
 });
}
bot.on("photo",async ctx=>{
 const key=String(ctx.from.id),n=taskEvidenceDrafts.get(key);
 if(!n)return ctx.reply("Open My tasks and follow the current task to submit evidence.");
 const item=TASK_FLOW[n-1],u=await prisma.user.findUnique({where:{telegramId:key}});
 if(!u)return ctx.reply("Please use /start first.");
 const task=await prisma.task.findUnique({where:{type:item.type as any}});
 if(!task)return ctx.reply("This task is not configured yet.");
 const photo=ctx.message.photo[ctx.message.photo.length-1],caption=ctx.message.caption||"";
 const submission=await prisma.taskSubmission.upsert({where:{userId_taskId:{userId:u.id,taskId:task.id}},create:{userId:u.id,taskId:task.id,details:{text:caption,photoFileId:photo.file_id}},update:{details:{text:caption,photoFileId:photo.file_id},status:"PENDING",reviewNote:null,reviewedAt:null,rewardCredited:false}});
 taskEvidenceDrafts.delete(key);
 await ctx.reply("✅ Screenshot received for Task "+n+". It is now awaiting admin review. Task "+(n+1)+" will unlock only after approval.");
 const adminIds=(config.ADMIN_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
 for(const adminId of adminIds){try{await bot.telegram.sendPhoto(Number(adminId),photo.file_id,{caption:"📥 NEW TASK EVIDENCE\nParticipant: "+(u.firstName||"")+" "+(u.lastName||"")+" (@"+(u.username||"no username")+")\nTelegram ID: "+u.telegramId+"\nTask "+n+": "+task.title+"\nReward on approval: "+fmt(task.rewardKobo)+"\nSubmission ID: "+submission.id+"\n"+(caption?"Details: "+caption:"No caption provided.")});}catch(e){console.error("Admin task screenshot notification failed for "+adminId,e);}}

});
bot.command("submit",ctx=>ctx.reply("Please use My tasks to complete the campaign one task at a time. Open the current task, press DONE, then send your evidence when prompted."));
bot.action("wallet",async ctx=>{
 await ctx.answerCbQuery(); const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!u)return ctx.reply("Please use /start first.");
 const w=u.wallet; await ctx.reply("YOUR REWARDS WALLET\nAvailable: "+fmt(w?.availableKobo||0)+"\nPending: "+fmt(w?.pendingKobo||0)+"\nTotal earned: "+fmt(w?.totalEarnedKobo||0)+"\nWithdrawn: "+fmt(w?.withdrawnKobo||0)+"\nMinimum withdrawal: ₦"+config.MIN_WITHDRAWAL_NGN.toLocaleString("en-NG")+"\n\nTo withdraw, tap Request withdrawal or send /withdraw. I will ask for your details one question at a time.");
});
type WithdrawalDraft = { step: "amount" | "name" | "bank" | "account" | "confirm"; amountKobo?: number; accountName?: string; bankName?: string; accountNumber?: string };
const withdrawalDrafts = new Map<string, WithdrawalDraft>();

async function askWithdrawalAmount(ctx:any) {
 const user=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!user)return ctx.reply("Please use /start first.");
 if(!user.wallet)return ctx.reply("Your wallet is not ready yet. Please try again later.");
 withdrawalDrafts.set(String(ctx.from.id),{step:"amount"});
 return ctx.reply("🏦 WITHDRAWAL REQUEST\n\nHow much would you like to withdraw in naira?\nMinimum withdrawal: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\nAvailable balance: "+fmt(user.wallet.availableKobo)+"\n\nEnter the amount, for example: 2500\nSend /cancel to stop.");
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
  return ctx.reply("❌ INSUFFICIENT BALANCE — WITHDRAWAL NOT SUBMITTED\n\nRequested: "+fmt(draft.amountKobo)+"\nAvailable wallet balance: "+fmt(availableBefore)+"\nStill needed: "+fmt(shortfall)+"\n\nYou need "+fmt(shortfall)+" more in approved wallet earnings to make this withdrawal. No withdrawal request was created and no funds were deducted.");
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
  await ctx.reply("✅ WITHDRAWAL REQUEST SUBMITTED\n\nAmount: "+fmt(draft.amountKobo)+"\nAccount name: "+draft.accountName+"\nBank: "+draft.bankName+"\nAccount number: "+draft.accountNumber+"\nStatus: PENDING REVIEW\n\nYour funds have been reserved. The admin will review and process your payment. You will receive a Telegram notification when it is marked PAID.\nReference: "+withdrawal.id);
  const adminIds=(config.ADMIN_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  for(const adminId of adminIds){try{await bot.telegram.sendMessage(Number(adminId),"💸 NEW WITHDRAWAL REQUEST\nParticipant: "+(user.firstName||"")+" "+(user.lastName||"")+" (@"+(user.username||"no username")+")\nTelegram ID: "+user.telegramId+"\nAmount: "+fmt(draft.amountKobo)+"\nAccount name: "+draft.accountName+"\nBank: "+draft.bankName+"\nAccount number: "+draft.accountNumber+"\nStatus: PENDING REVIEW\nWithdrawal ID: "+withdrawal.id+"\n\nReview in the admin dashboard. After manually transferring the funds, click Confirm Paid to notify the participant.");}catch(e){console.error("Admin withdrawal notification failed for "+adminId,e);}}
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
  if(!/^\d+(?:\.\d{1,2})?$/.test(normalized))return ctx.reply("❌ Invalid amount. Enter a valid naira amount, for example 2500. No withdrawal has been started.");
  const amount=Number(normalized);
  if(!Number.isFinite(amount)||amount<=0)return ctx.reply("❌ The withdrawal amount must be greater than zero. Please enter a valid amount.");
  const amountKobo=Math.round(amount*100);
  draft.amountKobo=amountKobo;draft.step="name";
  return ctx.reply("Amount recorded: "+fmt(amountKobo)+".\n\nPlease enter the full name of the bank account holder. We will validate the minimum and your available wallet balance after collecting all bank details.");
 }
 if(draft.step==="name"){
  if(answer.length<3||answer.length>100)return ctx.reply("Please enter a valid account holder name (3–100 characters).");
  draft.accountName=answer;draft.step="bank";return ctx.reply("Which bank should receive your payment? Enter the bank name.");
 }
 if(draft.step==="bank"){
  if(answer.length<2||answer.length>80)return ctx.reply("Please enter a valid bank name.");
  draft.bankName=answer;draft.step="account";return ctx.reply("Please enter your 10-digit bank account number.");
 }
 if(draft.step==="account"){
  if(!/^\d{10}$/.test(answer))return ctx.reply("Your account number must contain exactly 10 digits. Please try again.");
  draft.accountNumber=answer;draft.step="confirm";
  return ctx.reply("PLEASE CONFIRM YOUR WITHDRAWAL DETAILS\n\nAmount: "+fmt(draft.amountKobo||0)+"\nAccount name: "+draft.accountName+"\nBank: "+draft.bankName+"\nAccount number: "+draft.accountNumber+"\n\nConfirm only if these details are correct.",Markup.inlineKeyboard([[Markup.button.callback("✅ Confirm withdrawal","withdraw_confirm")],[Markup.button.callback("Cancel","withdraw_cancel")]]));
 }
 return next();
});
bot.action("referral",async ctx=>{
 await ctx.answerCbQuery(); const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}});
 if(!u)return ctx.reply("Please use /start first.");
 await ctx.reply("Your personal referral link:\nhttps://t.me/"+config.BOT_USERNAME+"?start="+u.referralCode+"\n\nEarn ₦100 for each person you refer after they complete and receive approval for all six campaign tasks. One-level referrals only. Self-referrals and duplicate referrals do not qualify.");
});
bot.command("tasks",ctx=>ctx.reply("Tap My tasks from /start."));
bot.command("wallet",async ctx=>{
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!u)return ctx.reply("Please use /start first.");
 const w=u.wallet;return ctx.reply("Available: "+fmt(w?.availableKobo||0)+"\nPending: "+fmt(w?.pendingKobo||0)+"\nTotal earned: "+fmt(w?.totalEarnedKobo||0)+"\nWithdrawn: "+fmt(w?.withdrawnKobo||0)+"\nMinimum: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\nSend /withdraw to start a guided withdrawal, one question at a time.");
});
bot.command("help",ctx=>ctx.reply("Commands: /start, /tasks, /submit 1 details, /wallet, /withdraw. Contact the SoccerFounder Support Group using the invite link provided in the campaign."));
bot.catch((err)=>console.error("Bot error",err));
