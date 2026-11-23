import {Telegraf,Markup} from "telegraf";
import {randomBytes} from "node:crypto";
import {prisma} from "./db";
import {config} from "./config";
export const bot=new Telegraf(process.env.BOT_TOKEN!);
const fmt=(k:number)=>"₦"+(k/100).toLocaleString("en-NG",{minimumFractionDigits:2});
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
 await ctx.reply("⚽ Welcome to SoccerFounder Airdrop & Rewards!\n\nComplete the six campaign steps and submit evidence for admin review. Sponsor/team leader must be Shane. Rewards are subject to verification; no income is guaranteed.",Markup.inlineKeyboard([
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
 const labels=["Register on SoccerFounder and submit your name, email and phone.","Register on Super One and submit username and Super One ID.","Confirm your sponsor is Shane.","Complete the six steps in the SoccerFounder Coach Bot.","Join the configured support group.","Participate meaningfully for 30 days in the support group."];
 await ctx.reply("YOUR SIX CAMPAIGN STEPS\n\n"+labels.map((x,i)=>(i+1)+". "+x).join("\n\n")+"\n\nSubmit details using /submit TASK_NUMBER your details. Admin review is required. "+(rows.length?"Tasks are configured.":"Tasks are currently being prepared."));
});
bot.command("submit",async ctx=>{
 const bits=ctx.message.text.split(" "); const n=Number(bits[1]);
 const types=["WEBSITE_REGISTRATION","SUPER_ONE_REGISTRATION","SPONSOR_CONFIRMATION","COACH_BOT_COMPLETION","SUPPORT_GROUP_JOIN","FOOTBALL_ENGAGEMENT"];
 if(!Number.isInteger(n)||n<1||n>6)return ctx.reply("Usage: /submit 1 your details. Use /tasks for the checklist.");
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}}); if(!u)return ctx.reply("Please use /start first.");
 const task=await prisma.task.findUnique({where:{type:types[n-1] as any}}); if(!task)return ctx.reply("Campaign tasks are not yet configured.");
 await prisma.taskSubmission.upsert({where:{userId_taskId:{userId:u.id,taskId:task.id}},create:{userId:u.id,taskId:task.id,details:{text:bits.slice(2).join(" ")}},update:{details:{text:bits.slice(2).join(" ")},status:"PENDING"}});
 await ctx.reply("Submission received. It is pending administrator verification.");
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
 await ctx.reply("Your personal referral link:\nhttps://t.me/"+config.BOT_USERNAME+"?start="+u.referralCode+"\n\nOne-level referrals only. Rewards are subject to campaign verification.");
});
bot.command("tasks",ctx=>ctx.reply("Tap My tasks from /start."));
bot.command("wallet",async ctx=>{
 const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)},include:{wallet:true}});
 if(!u)return ctx.reply("Please use /start first.");
 const w=u.wallet;return ctx.reply("Available: "+fmt(w?.availableKobo||0)+"\nPending: "+fmt(w?.pendingKobo||0)+"\nTotal earned: "+fmt(w?.totalEarnedKobo||0)+"\nWithdrawn: "+fmt(w?.withdrawnKobo||0)+"\nMinimum: "+fmt(config.MIN_WITHDRAWAL_NGN*100)+"\nUse /withdraw for bank payout instructions.");
});
bot.command("help",ctx=>ctx.reply("Commands: /start, /tasks, /submit 1 details, /wallet, /withdraw. Contact the configured campaign support group for help."));
bot.catch((err)=>console.error("Bot error",err));
