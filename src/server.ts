import "dotenv/config";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import {bot} from "./bot";
import {config} from "./config";
import {prisma} from "./db";
const app=express();
app.disable("x-powered-by"); app.use(helmet()); app.use(compression()); app.use(express.json({limit:"32kb"}));
app.use("/api",rateLimit({windowMs:60000,limit:90}));
app.get("/health",(_req,res)=>res.json({status:"ok",service:"SoccerFounder Airdrop Bot"}));
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
