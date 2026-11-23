import {PrismaClient,TaskType} from "@prisma/client";
const prisma=new PrismaClient();
const tasks:{type:TaskType,title:string,description:string}[]=[
{type:"WEBSITE_REGISTRATION",title:"SoccerFounder website registration",description:"Register and submit name, email and phone for review."},
{type:"SUPER_ONE_REGISTRATION",title:"Super One registration",description:"Submit Super One username and ID for manual review."},
{type:"SPONSOR_CONFIRMATION",title:"Confirm sponsor Shane",description:"Confirm Shane as sponsor/team leader."},
{type:"COACH_BOT_COMPLETION",title:"Coach Bot completion",description:"Complete the six Coach Bot steps and submit confirmation."},
{type:"SUPPORT_GROUP_JOIN",title:"Join support group",description:"Join the configured group; membership verification requires bot admin rights."},
{type:"FOOTBALL_ENGAGEMENT",title:"30-day football engagement",description:"Meaningful participation for the configured engagement period."}
];
async function main(){
 for(const t of tasks)await prisma.task.upsert({where:{type:t.type},create:t,update:{title:t.title,description:t.description}});
 await prisma.campaignSettings.upsert({where:{id:"default"},create:{id:"default"},update:{}});
 console.log("Six tasks seeded; rewards intentionally remain zero until configured.");
}
main().finally(()=>prisma.$disconnect());
