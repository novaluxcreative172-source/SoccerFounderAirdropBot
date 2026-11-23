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
 const w=u.wallet; await ctx.reply("YOUR REWARDS WALLET\nAvailable: "+fmt(w?.availableKobo||0)+"\nPending: "+fmt(w?.pendingKobo||0)+"\nTotal earned: "+fmt(w?.totalEarnedKobo||0)+"\nWithdrawn: "+fmt(w?.withdrawnKobo||0)+"\nMinimum withdrawal: ₦"+config.MIN_WITHDRAWAL_NGN.toLocaleString("en-NG")+"\n\nWithdrawals are manually reviewed.");
});
bot.action("referral",async ctx=>{
 await ctx.answerCbQuery(); const u=await prisma.user.findUnique({where:{telegramId:String(ctx.from.id)}});
 if(!u)return ctx.reply("Please use /start first.");
 await ctx.reply("Your personal referral link:\nhttps://t.me/"+config.BOT_USERNAME+"?start="+u.referralCode+"\n\nOne-level referrals only. Rewards are subject to campaign verification.");
});
bot.command("tasks",ctx=>ctx.reply("Tap My tasks from /start."));
bot.command("wallet",ctx=>ctx.reply("Tap My wallet from /start."));
bot.command("help",ctx=>ctx.reply("Commands: /start, /tasks, /submit 1 details, /wallet. Contact the configured campaign support group for help."));
bot.catch((err)=>console.error("Bot error",err));
