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
 const match=caption.match(/^\\/submit(?:@\\w+)?\\s+(\\d+)\\s*(.*)$/i);
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
 const w=u.wallet; await ctx.reply("YOUR REWARDS WALLET\nAvailable: "+fmt(w?.availableKobo||0)+"\nPending: "+fmt(w?.pendingKobo||0)+"\nTotal earned: "+fmt(w?.totalEarnedKobo||0)+"\nWithdrawn: "+fmt(w?.withdrawnKobo||0)+"\nMinimum withdrawal: ₦"+config.MIN_WITHDRAWAL_NGN.toLocaleString("en-NG")+"\n\nTo request a withdrawal, send:\n/withdraw AMOUNT | ACCOUNT NAME | BANK NAME | 10-DIGIT ACCOUNT NUMBER\nExample: /withdraw 2500 | Ada Okafor | Access Bank | 0123456789\n\nYour available balance is reserved while the request is pending. Payment is manual and only marked Paid after admin confirmation.");
});
bot.action("withdraw_help",async ctx=>{
 await ctx.answerCbQuery();
 await ctx.reply("To request a withdrawal, send this command:\n/withdraw AMOUNT | ACCOUNT NAME | BANK NAME | 10-DIGIT ACCOUNT NUMBER\nExample:\n/withdraw 2500 | Ada Okafor | Access Bank | 0123456789\n\nUse your correct Nigerian bank details. Never send your PIN, password or OTP.");
});
bot.command("withdraw",async ctx=>{
 const raw=ctx.message.text.replace(/^\/withdraw(?:@\w+)?\s*/i,"");
 const parts=raw.split("|").map((x:string)=>x.trim());
 if(parts.length!==4)return ctx.reply("Please use this exact format:\n/withdraw AMOUNT | ACCOUNT NAME | BANK NAME | 10-DIGIT ACCOUNT NUMBER\nExample: /withdraw 2500 | Ada Okafor | Access Bank | 0123456789");
 const amount=Number(parts[0]);
 if(!Number.isFinite(amount)||!Number.isSafeInteger(Math.round(amount*100))||amount<=0||Math.abs(amount*100-Math.round(amount*100))>0.001)return ctx.reply("Enter a valid amount in naira, up to 2 decimal places.");
 if(parts[1].length<3||parts[1].length>100||parts[2].length<2||parts[2].length>80||!/^\d{10}$/.test(parts[3]))return ctx.reply("Check the account holder name, bank name and 10-digit account number, then try again.");
 const amountKobo=Math.round(amount*100);
 if(amount<config.MIN_WITHDRAWAL_NGN)return ctx.reply("The minimum withdrawal is "+fmt(config.MIN_WITHDRAWAL_NGN*100)+".");
 const user=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!user)return ctx.reply("Please use /start first.");
 try{
  const withdrawal=await prisma.$transaction(async tx=>{
   const changed=await tx.wallet.updateMany({where:{userId:user.id,availableKobo:{gte:amountKobo}},data:{availableKobo:{decrement:amountKobo},pendingKobo:{increment:amountKobo}}});
   if(changed.count!==1)throw new Error("INSUFFICIENT_BALANCE");
   const request=await tx.withdrawal.create({data:{userId:user.id,amountKobo,accountHolderName:parts[1],bankName:parts[2],accountNumber:parts[3]}});
   await tx.walletTransaction.create({data:{userId:user.id,type:"WITHDRAWAL_RESERVE",amountKobo,reference:"withdrawal:"+request.id+":reserve",description:"Withdrawal request reserved - "+parts[2]}});
   return request;
  });
  await ctx.reply("✅ Withdrawal request submitted.\nAmount: "+fmt(amountKobo)+"\nBank: "+parts[2]+"\nAccount: "+parts[3]+"\nStatus: PENDING\n\nYour funds have been reserved. You will be notified when the admin updates the payment status. Reference: "+withdrawal.id);
 }catch(e:any){if(e.message==="INSUFFICIENT_BALANCE")return ctx.reply("Your available wallet balance is not enough for this withdrawal.");console.error(e);return ctx.reply("Sorry, we could not submit your request. Please try again later.");}
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
 const w=u.wallet;return ctx.reply("Available: "+fmt(w?.availableKobo||0)+"\nPending: "+fmt(w?.pendingKobo||0)+"\nTotal earned: "+fmt(w?.totalEarnedKobo||0)+"\nWithdrawn: "+fmt(w?.withdrawnKobo||0)+"\nMinimum: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\nUse /withdraw for bank payout instructions.");
});
bot.command("help",ctx=>ctx.reply("Commands: /start, /tasks, /submit 1 details, /wallet, /withdraw. Contact the SoccerFounder Support Group using the invite link provided in the campaign."));
bot.catch((err)=>console.error("Bot error",err));
