import "dotenv/config";
import express,{Request,Response,NextFunction} from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import {timingSafeEqual} from "node:crypto";
import path from "node:path";
import {bot} from "./bot";
import {config} from "./config";
import {prisma} from "./db";
import {reviewSubmission} from "./services/review";
const app=express();
app.disable("x-powered-by"); app.use(helmet({contentSecurityPolicy:false})); app.use(compression()); app.use(express.json({limit:"32kb"}));
app.use("/api",rateLimit({windowMs:60000,limit:90}));
app.get("/health",(_req,res)=>res.json({status:"ok",service:"SoccerFounder Airdrop Bot"}));
function safeEqual(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function requireAdmin(req:Request,res:Response,next:NextFunction){
 const supplied=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 if(!config.ADMIN_SESSION_SECRET||!supplied||!safeEqual(supplied,config.ADMIN_SESSION_SECRET)){res.status(401).json({error:"Unauthorized"});return;}
 next();
}
app.get("/admin",(_req,res)=>res.sendFile(path.resolve(process.cwd(),"public/admin.html")));
app.post("/api/admin/login",(req,res)=>{const key=String(req.body?.key||"");if(!config.ADMIN_SESSION_SECRET||!safeEqual(key,config.ADMIN_SESSION_SECRET)){res.status(401).json({error:"Invalid admin key"});return;}res.json({ok:true,token:config.ADMIN_SESSION_SECRET});});
app.get("/api/admin/submissions",requireAdmin,async(req,res)=>{
 const status=String(req.query.status||"PENDING");
 if(!["PENDING","APPROVED","REJECTED"].includes(status))return res.status(400).json({error:"Invalid status"});
 const rows=await prisma.taskSubmission.findMany({
  where:{status:status as any},
  include:{task:true,user:{select:{id:true,telegramId:true,username:true,firstName:true,lastName:true}}},
  orderBy:{createdAt:"asc"},take:300
 });
 res.json(rows);
});
app.get("/api/admin/submissions/:id/photo",requireAdmin,async(req,res)=>{
 const row=await prisma.taskSubmission.findUnique({where:{id:String(req.params.id)},select:{details:true}});
 const details=row?.details as {photoFileId?:string}|null;
 if(!details?.photoFileId)return res.status(404).json({error:"No screenshot attached"});
 try{
  const fileUrl=await bot.telegram.getFileLink(details.photoFileId);
  const upstream=await fetch(fileUrl.href);
  if(!upstream.ok)return res.status(502).json({error:"Could not retrieve screenshot from Telegram"});
  res.setHeader("Content-Type",upstream.headers.get("content-type")||"image/jpeg");
  res.setHeader("Cache-Control","private, no-store");
  res.send(Buffer.from(await upstream.arrayBuffer()));
 }catch(e){console.error("Screenshot retrieval failed",e);res.status(502).json({error:"Could not retrieve screenshot"});}
});
app.post("/api/admin/submissions/:id/review",requireAdmin,async(req,res)=>{
 const id=String(req.params.id);
 const approved=req.body?.approved===true;
 const note=String(req.body?.note||"").trim().slice(0,500);
 try{
  const before=await prisma.taskSubmission.findUnique({where:{id},include:{user:{include:{referredBy:true}},task:true}});
  if(!before)return res.status(404).json({error:"Submission not found"});
  const wasReferralRewardCredited=before.user.referralRewardCredited;
  const result=await reviewSubmission(id,approved,note,"dashboard-admin");
  try{
   await bot.telegram.sendMessage(Number(before.user.telegramId),
    (approved?"✅ Your task was approved.":"❌ Your task was not approved.")+"\nTask: "+before.task.title+
    (approved?"\nReward credited: ₦"+(before.task.rewardKobo/100).toLocaleString("en-NG"):"\nAdmin note: "+(note||"Please review the task instructions and submit again.")));
  }catch(e){console.error("Task review notification failed",e);}
  const after=await prisma.user.findUnique({where:{id:before.userId},select:{referralRewardCredited:true}});
  if(!wasReferralRewardCredited&&after?.referralRewardCredited&&before.user.referredBy){
   try{await bot.telegram.sendMessage(Number(before.user.referredBy.telegramId),"🎉 Your referral has completed and received approval for all six SoccerFounder campaign tasks. Your ₦100 referral reward has been credited.");}
   catch(e){console.error("Referral reward notification failed",e);}
  }
  res.json({ok:true,submission:result});
 }catch(e:any){
  const message=String(e?.message||"");
  const status=message.includes("already reviewed")?409:500;
  res.status(status).json({error:status===409?"This submission has already been reviewed.":"Could not review submission."});
 }
});
app.get("/api/admin/withdrawals",requireAdmin,async(_req,res)=>{
 const rows=await prisma.withdrawal.findMany({include:{user:{select:{telegramId:true,username:true,firstName:true,lastName:true}}},orderBy:{createdAt:"desc"},take:250});
 res.json(rows.map(w=>({...w,amountNaira:w.amountKobo/100,accountNumber:w.accountNumber})));
});
app.post("/api/admin/withdrawals/:id/paid",requireAdmin,async(req,res)=>{
 const id=String(req.params.id);const paymentReference=String(req.body?.paymentReference||"").trim().slice(0,120);const adminNote=String(req.body?.adminNote||"").trim().slice(0,500);
 try{
  const result=await prisma.$transaction(async tx=>{
   const w=await tx.withdrawal.findUnique({where:{id},include:{user:true}});
   if(!w)throw new Error("NOT_FOUND");
   if(w.status==="PAID")throw new Error("ALREADY_PAID");
   if(w.status==="REJECTED")throw new Error("ALREADY_REJECTED");
   const updated=await tx.withdrawal.updateMany({where:{id,status:{in:["PENDING","APPROVED"]}},data:{status:"PAID",paymentReference:paymentReference||null,adminNote:adminNote||"Payment manually confirmed by admin"}});
   if(updated.count!==1)throw new Error("STATUS_CHANGED");
   await tx.wallet.update({where:{userId:w.userId},data:{pendingKobo:{decrement:w.amountKobo},withdrawnKobo:{increment:w.amountKobo}}});
   await tx.adminActionLog.create({data:{adminId:"dashboard-admin",action:"WITHDRAWAL_MARKED_PAID",targetId:id,metadata:{paymentReference}}});
   return w;
  });
  try{await bot.telegram.sendMessage(Number(result.user.telegramId),"✅ Your withdrawal has been marked PAID.\nAmount: ₦"+(result.amountKobo/100).toLocaleString("en-NG",{minimumFractionDigits:2})+"\nBank: "+result.bankName+(paymentReference?"\nPayment reference: "+paymentReference:""));}catch(e){console.error("Paid notification failed",e);}
  res.json({ok:true});
 }catch(e:any){const map:any={NOT_FOUND:404,ALREADY_PAID:409,ALREADY_REJECTED:409,STATUS_CHANGED:409};res.status(map[e.message]||500).json({error:map[e.message]?e.message:"Could not confirm payment"});}
});
app.post("/api/admin/withdrawals/:id/reject",requireAdmin,async(req,res)=>{
 const id=String(req.params.id);const note=String(req.body?.note||"").trim().slice(0,500);
 if(!note)return res.status(400).json({error:"Please provide a reason for rejection."});
 try{
  const result=await prisma.$transaction(async tx=>{
   const w=await tx.withdrawal.findUnique({where:{id},include:{user:true}});
   if(!w)throw new Error("NOT_FOUND");
   if(w.status==="PAID")throw new Error("ALREADY_PAID");
   if(w.status==="REJECTED")throw new Error("ALREADY_REJECTED");
   const changed=await tx.withdrawal.updateMany({where:{id,status:{in:["PENDING","APPROVED"]}},data:{status:"REJECTED",adminNote:note}});
   if(changed.count!==1)throw new Error("STATUS_CHANGED");
   await tx.wallet.update({where:{userId:w.userId},data:{pendingKobo:{decrement:w.amountKobo},availableKobo:{increment:w.amountKobo}}});
   await tx.walletTransaction.create({data:{userId:w.userId,type:"WITHDRAWAL_REFUND",amountKobo:w.amountKobo,reference:"withdrawal:"+id+":refund",description:"Withdrawal rejected; funds returned: "+note}});
   await tx.adminActionLog.create({data:{adminId:"dashboard-admin",action:"WITHDRAWAL_REJECTED",targetId:id,metadata:{note}}});
   return w;
  });
  try{await bot.telegram.sendMessage(Number(result.user.telegramId),"Your withdrawal request was rejected.\nReason: "+note+"\nThe reserved amount has been returned to your available wallet balance.");}catch(e){console.error("Rejection notification failed",e);}
  res.json({ok:true});
 }catch(e:any){const map:any={NOT_FOUND:404,ALREADY_PAID:409,ALREADY_REJECTED:409,STATUS_CHANGED:409};res.status(map[e.message]||500).json({error:map[e.message]?e.message:"Could not reject withdrawal"});}
});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function launchTelegramWithRateLimitRetry(start:()=>Promise<unknown>){
 for(;;){
  try{
   await start();
   console.log("Telegram bot connected successfully.");
   return;
  }catch(error:any){
   const retryAfter=Number(error?.response?.parameters?.retry_after);
   if(error?.response?.error_code!==429||!Number.isFinite(retryAfter)||retryAfter<1)throw error;
   const waitMs=(retryAfter+2)*1000;
   console.error("Telegram API rate limit: method="+String(error?.on?.method||"unknown")+"; retry_after="+retryAfter+"s; description="+String(error?.response?.description||error?.message||"unknown")+". Retrying in "+Math.ceil(waitMs/1000)+" seconds.");
   await sleep(waitMs);
  }
 }
}
async function main(){
 await prisma.$connect();
 let startTelegram:()=>Promise<unknown>;
 if(config.WEBHOOK_DOMAIN && config.NODE_ENV==="production"){
  console.log("Telegram startup mode: WEBHOOK. WEBHOOK_DOMAIN is set and NODE_ENV is production. WEBHOOK_SECRET present: "+Boolean(config.WEBHOOK_SECRET)+".");
  if(!config.WEBHOOK_SECRET)throw new Error("WEBHOOK_SECRET is required when webhook mode is enabled.");
  const webhookPath="/telegram/"+config.WEBHOOK_SECRET;
  app.use(bot.webhookCallback(webhookPath));
  startTelegram=()=>bot.telegram.setWebhook(config.WEBHOOK_DOMAIN!.replace(/\/$/,"")+webhookPath);
 }else{
  console.warn("Telegram startup mode: POLLING. Webhook mode was not selected. WEBHOOK_DOMAIN present: "+Boolean(config.WEBHOOK_DOMAIN)+"; NODE_ENV: "+config.NODE_ENV+".");
  startTelegram=()=>bot.launch();
 }
 app.listen(config.PORT,()=>console.log("Server listening on "+config.PORT));
 await launchTelegramWithRateLimitRetry(startTelegram);
}
main().catch(e=>{console.error("Application startup failed",e);process.exit(1);});
process.once("SIGINT",()=>{bot.stop("SIGINT");void prisma.$disconnect();});
process.once("SIGTERM",()=>{bot.stop("SIGTERM");void prisma.$disconnect();});
