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
async function main(){
 await prisma.$connect();
 if(config.WEBHOOK_DOMAIN && config.NODE_ENV==="production"){
  const path="/telegram/"+(config.WEBHOOK_SECRET||"replace-this-secret");
  await bot.telegram.setWebhook(config.WEBHOOK_DOMAIN.replace(/\/$/,"")+path);
  app.use(bot.webhookCallback(path));
 } else { await bot.launch(); }
 app.listen(config.PORT,()=>console.log("Server listening on "+config.PORT));
}
main().catch(e=>{console.error(e);process.exit(1);});
process.once("SIGINT",()=>{bot.stop("SIGINT");void prisma.$disconnect();});
process.once("SIGTERM",()=>{bot.stop("SIGTERM");void prisma.$disconnect();});
