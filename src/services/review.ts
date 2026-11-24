import {prisma} from "../db";

const REQUIRED_TASKS=[
 "WEBSITE_REGISTRATION",
 "SUPER_ONE_REGISTRATION",
 "SPONSOR_CONFIRMATION",
 "COACH_BOT_COMPLETION",
 "SUPPORT_GROUP_JOIN",
 "FOOTBALL_ENGAGEMENT"
] as const;

export async function reviewSubmission(id:string,approved:boolean,note:string,adminId:string){
 const submission=await prisma.taskSubmission.findUnique({where:{id},include:{task:true,user:true}});
 if(!submission)throw new Error("Submission not found");
 if(submission.status!=="PENDING")throw new Error("Submission already reviewed");

 return prisma.$transaction(async tx=>{
  const changed=await tx.taskSubmission.updateMany({
   where:{id,status:"PENDING"},
   data:{status:approved?"APPROVED":"REJECTED",reviewNote:note.slice(0,500),reviewedAt:new Date(),rewardCredited:approved&&submission.task.rewardKobo>0}
  });
  if(changed.count!==1)throw new Error("Submission already reviewed");

  if(approved&&submission.task.rewardKobo>0){
   const reference="task:"+id;
   const existing=await tx.walletTransaction.findUnique({where:{reference}});
   if(!existing){
    await tx.wallet.upsert({
     where:{userId:submission.userId},
     create:{userId:submission.userId,availableKobo:submission.task.rewardKobo,totalEarnedKobo:submission.task.rewardKobo},
     update:{availableKobo:{increment:submission.task.rewardKobo},totalEarnedKobo:{increment:submission.task.rewardKobo}}
    });
    await tx.walletTransaction.create({data:{
     userId:submission.userId,type:"TASK_REWARD",amountKobo:submission.task.rewardKobo,
     reference,description:"Approved task: "+submission.task.title
    }});
   }
  }

  if(approved&&submission.user.referredById&&!submission.user.referralRewardCredited){
   const approvedTasks=await tx.taskSubmission.findMany({
    where:{userId:submission.userId,status:"APPROVED",task:{type:{in:[...REQUIRED_TASKS]}}},
    include:{task:{select:{type:true}}}
   });
   const completed=new Set(approvedTasks.map(row=>row.task.type));
   const allTasksComplete=REQUIRED_TASKS.every(type=>completed.has(type));
   if(allTasksComplete){
    const settings=await tx.campaignSettings.findUnique({where:{id:"default"}});
    const referralRewardKobo=settings?.referralRewardKobo??10000;
    await tx.user.update({where:{id:submission.userId},data:{referralRewardCredited:true}});
    if(referralRewardKobo>0){
     const referralReference="referral:"+submission.userId;
     const existing=await tx.walletTransaction.findUnique({where:{reference:referralReference}});
     if(!existing){
      await tx.wallet.upsert({
       where:{userId:submission.user.referredById},
       create:{userId:submission.user.referredById,availableKobo:referralRewardKobo,totalEarnedKobo:referralRewardKobo},
       update:{availableKobo:{increment:referralRewardKobo},totalEarnedKobo:{increment:referralRewardKobo}}
      });
      await tx.walletTransaction.create({data:{
       userId:submission.user.referredById,type:"REFERRAL_REWARD",amountKobo:referralRewardKobo,
       reference:referralReference,description:"Referral completed all six verified campaign tasks"
      }});
     }
    }
   }
  }

  await tx.adminActionLog.create({
   data:{adminId,action:approved?"TASK_APPROVED":"TASK_REJECTED",targetId:id,metadata:{note}}
  });
  return tx.taskSubmission.findUnique({where:{id},include:{task:true}});
 });
}
