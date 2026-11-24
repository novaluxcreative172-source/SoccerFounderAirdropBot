import {PrismaClient,TaskType} from "@prisma/client";
const prisma=new PrismaClient();

const tasks:{type:TaskType,title:string,description:string,rewardKobo:number}[]=[
 {type:"WEBSITE_REGISTRATION",title:"SoccerFounder website and app registration",description:"Register on the SoccerFounder website, download the app from the website, complete app registration, and submit a screenshot of completed registration. Do not send personal details in chat.",rewardKobo:30000},
 {type:"SUPER_ONE_REGISTRATION",title:"SuperOne registration",description:"Complete SuperOne registration and submit a screenshot of completion. Do not send passwords or OTPs.",rewardKobo:20000},
 {type:"SPONSOR_CONFIRMATION",title:"Confirm sponsor Shane",description:"Confirm Shane as sponsor/team leader and submit evidence for review.",rewardKobo:10000},
 {type:"COACH_BOT_COMPLETION",title:"Complete all six Coach Bot steps",description:"Complete all six steps in the SoccerFounder Coach Bot and submit a screenshot showing completion.",rewardKobo:10000},
 {type:"SUPPORT_GROUP_JOIN",title:"Join support group",description:"Join the SoccerFounder Support Group and submit a screenshot for manual admin review. The Airdrop Bot is not in the group and cannot automatically verify membership.",rewardKobo:10000},
 {type:"FOOTBALL_ENGAGEMENT",title:"30-day football engagement",description:"Complete the 30-day genuine football engagement requirement and submit evidence for manual admin review.",rewardKobo:30000}
];

async function main(){
 for(const task of tasks){
  const {rewardKobo,...data}=task;
  await prisma.task.upsert({
   where:{type:task.type},
   create:{...data,rewardKobo},
   update:{...data,rewardKobo}
  });
 }
 await prisma.campaignSettings.upsert({
  where:{id:"default"},
  create:{id:"default",referralRewardKobo:10000,engagementDays:30,minimumWithdrawalKobo:130000},
  update:{referralRewardKobo:10000,engagementDays:30,minimumWithdrawalKobo:130000}
 });
 console.log("Six tasks configured: ₦300, ₦200, ₦100, ₦100, ₦100, ₦300; total ₦1,100. Minimum withdrawal ₦1,300; referral reward ₦100 after all six tasks are approved.");
}
main().finally(()=>prisma.$disconnect());
