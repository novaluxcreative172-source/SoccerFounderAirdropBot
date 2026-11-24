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
bot.start(async ctx=>{
 await userFor(ctx);
 await ctx.reply("⚽ Welcome to SoccerFounder Airdrop & Rewards!\n\nComplete all six campaign tasks and submit evidence for admin review. Earn up to ₦800 in task rewards. Earn an additional ₦100 referral reward for each referred participant who completes and gets approval for all six tasks. Sponsor/team leader must be Shane. Rewards are subject to verification; no income is guaranteed.",Markup.inlineKeyboard([
 [Markup.button.callback("📝 My tasks","tasks"),Markup.button.callback("💰 My wallet","wallet")],
 [Markup.button.callback("👥 Invite friends","referral")],
 [Markup.button.callback("🏦 Request withdrawal","withdraw_help")],
 [Markup.button.url("SoccerFounder website",config.WEBSITE_URL)],
 [Markup.button.url("Coach Bot","https://t.me/"+config.COACH_BOT_USERNAME)]
 ]));
});
bot.action("tasks",async ctx=>{
 await ctx.answerCbQuery();
 const rows=await prisma.task.findMany({where:{active:true},orderBy:{createdAt:"asc"}});
 const descriptions=[
  "Register on SoccerFounder and submit your name, email and phone.",
  "Register on Super One and submit your username and Super One ID.",
  "Confirm that your sponsor/team leader is Shane.",
  "Complete all six steps in the SoccerFounder Coach Bot.",
  "Join the SoccerFounder Support Group and submit a screenshot for manual review.",
  "Complete 30 days of genuine football engagement and submit evidence for manual review."
 ];
 const body=rows.map((task,i)=>(i+1)+". "+task.title+" — "+fmt(task.rewardKobo)+"\n"+(descriptions[i]||task.description));
 await ctx.reply("YOUR SIX CAMPAIGN TASKS\n\n"+body.join("\n\n")+"\n\nTOTAL TASK REWARDS: ₦800\n\nSubmit evidence with /submit TASK_NUMBER your details. Every task is subject to admin approval. Your ₦100 referral reward is paid only after the person you referred has all six tasks approved.");
});
bot.on("photo",async ctx=>{
 const caption=ctx.message.caption||"";
 const match=caption.match(/^\/submit(?:@\w+)?\s+(\d+)\s*(.*)$/i);
 if(!match)return ctx.reply("To submit a screenshot, add a caption in this format: /submit 5 I have joined the support group.");
 const n=Number(match[1]);
 const types=["WEBSITE_REGISTRATION","SUPER_ONE_REGISTRATION","SPONSOR_CONFIRMATION","COACH_BOT_COMPLETION","SUPPORT_GROUP_JOIN","FOOTBALL_ENGAGEMENT"];
 if(!Number.isInteger(n)||n<1||n>6)return ctx.reply("Please use a task number from 1 to 6 in your photo caption.");
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}});
 if(!u)return ctx.reply("Please use /start first.");
 const task=await prisma.task.findUnique({where:{type:types[n-1] as any}});
 if(!task)return ctx.reply("Campaign tasks are not yet configured.");
 const existing=await prisma.taskSubmission.findUnique({where:{userId_taskId:{userId:u.id,taskId:task.id}}});
 if(existing?.status==="APPROVED")return ctx.reply("This task has already been approved. It cannot be submitted again.");
 const photo=ctx.message.photo[ctx.message.photo.length-1];
 await prisma.taskSubmission.upsert({
  where:{userId_taskId:{userId:u.id,taskId:task.id}},
  create:{userId:u.id,taskId:task.id,details:{text:match[2]||caption,photoFileId:photo.file_id}},
  update:{details:{text:match[2]||caption,photoFileId:photo.file_id},status:"PENDING",reviewNote:null,reviewedAt:null,rewardCredited:false}
 });
 await ctx.reply("Screenshot received for "+task.title+". Your submission is pending admin review. Reward if approved: "+fmt(task.rewardKobo)+".");
});
bot.command("submit",async ctx=>{
 const bits=ctx.message.text.split(" "); const n=Number(bits[1]);
 const types=["WEBSITE_REGISTRATION","SUPER_ONE_REGISTRATION","SPONSOR_CONFIRMATION","COACH_BOT_COMPLETION","SUPPORT_GROUP_JOIN","FOOTBALL_ENGAGEMENT"];
 if(!Number.isInteger(n)||n<1||n>6)return ctx.reply("Usage: /submit 1 your details. Use /tasks for the checklist and rewards.");
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}}); if(!u)return ctx.reply("Please use /start first.");
 const task=await prisma.task.findUnique({where:{type:types[n-1] as any}}); if(!task)return ctx.reply("Campaign tasks are not yet configured.");
 const details=bits.slice(2).join(" ");
 if(!details.trim())return ctx.reply("Please include your evidence or details after the task number. For example: /submit 5 I have joined the support group; screenshot attached separately.");
 await prisma.taskSubmission.upsert({where:{userId_taskId:{userId:u.id,taskId:task.id}},create:{userId:u.id,taskId:task.id,details:{text:details}},update:{details:{text:details},status:"PENDING",reviewNote:null,reviewedAt:null,rewardCredited:false}});
 await ctx.reply("Submission received for "+task.title+". It is pending administrator verification. Reward if approved: "+fmt(task.rewardKobo)+".");
});
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
 const hadDraft=withdrawalDrafts.delete(String(ctx.from.id));
 await ctx.reply(hadDraft?"Your withdrawal request has been cancelled. No money was deducted.":"There is no active withdrawal request to cancel.");
});
bot.action("withdraw_cancel",async ctx=>{
 await ctx.answerCbQuery();withdrawalDrafts.delete(String(ctx.from.id));
 await ctx.reply("Your withdrawal request has been cancelled. No money was deducted.");
});
bot.action("withdraw_confirm",async ctx=>{
 await ctx.answerCbQuery();
 const key=String(ctx.from.id),draft=withdrawalDrafts.get(key);
 if(!draft||draft.step!=="confirm"||!draft.amountKobo||!draft.accountName||!draft.bankName||!draft.accountNumber)return ctx.reply("Your withdrawal details have expired. Please start again with /withdraw.");
 const user=await prisma.user.findUnique({where:{telegramId:key}});
 if(!user){withdrawalDrafts.delete(key);return ctx.reply("Please use /start first.");}
 try{
  const withdrawal=await prisma.$transaction(async tx=>{
   const changed=await tx.wallet.updateMany({where:{userId:user.id,availableKobo:{gte:draft.amountKobo!}},data:{availableKobo:{decrement:draft.amountKobo!},pendingKobo:{increment:draft.amountKobo!}}});
   if(changed.count!==1)throw new Error("INSUFFICIENT_BALANCE");
   const request=await tx.withdrawal.create({data:{userId:user.id,amountKobo:draft.amountKobo!,accountHolderName:draft.accountName!,bankName:draft.bankName!,accountNumber:draft.accountNumber!}});
   await tx.walletTransaction.create({data:{userId:user.id,type:"WITHDRAWAL_RESERVE",amountKobo:draft.amountKobo!,reference:"withdrawal:"+request.id+":reserve",description:"Withdrawal request reserved - "+draft.bankName}});
   return request;
  });
  withdrawalDrafts.delete(key);
  await ctx.reply("✅ Your withdrawal request has been submitted.\n\nAmount: "+fmt(draft.amountKobo)+"\nAccount name: "+draft.accountName+"\nBank: "+draft.bankName+"\nAccount number: "+draft.accountNumber+"\nStatus: PENDING REVIEW\n\nYour funds have been reserved. Payment is manual and will only be marked Paid after administrator confirmation.\nReference: "+withdrawal.id);
 }catch(e:any){if(e.message==="INSUFFICIENT_BALANCE")return ctx.reply("Your available balance is no longer sufficient. No withdrawal was created.");console.error("Withdrawal submission failed",e);return ctx.reply("Sorry, we could not submit your withdrawal. Please try again later.");}
});
bot.on("text",async(ctx:any,next:any)=>{
 const key=String(ctx.from.id),draft=withdrawalDrafts.get(key);
 if(!draft)return next();
 const answer=ctx.message.text.trim();
 if(answer.startsWith("/"))return next();
 if(draft.step==="amount"){
  const amount=Number(answer.replace(/,/g,""));
  if(!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(Math.round(amount*100))||Math.abs(amount*100-Math.round(amount*100))>0.001)return ctx.reply("Please enter a valid amount in naira, for example 2500.");
  if(amount<config.MIN_WITHDRAWAL_NGN)return ctx.reply("The minimum withdrawal is "+fmt(config.MIN_WITHDRAWAL_NGN*100)+". Please enter another amount.");
  const user=await prisma.user.findUnique({where:{telegramId:key},include:{wallet:true}});
  const amountKobo=Math.round(amount*100);
  if(!user?.wallet||user.wallet.availableKobo<amountKobo)return ctx.reply("Your available balance is insufficient. Available: "+fmt(user?.wallet?.availableKobo||0)+". Enter a lower amount or /cancel.");
  draft.amountKobo=amountKobo;draft.step="name";
  return ctx.reply("Please enter the full name of the bank account holder.");
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
