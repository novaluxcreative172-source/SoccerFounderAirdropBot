import {prisma} from "../db";
import {creditWallet} from "./wallet";
export async function reviewSubmission(id:string,approved:boolean,note:string,adminId:string){
 const submission=await prisma.taskSubmission.findUnique({where:{id},include:{task:true}});
 if(!submission)throw new Error("Submission not found");
 if(submission.status!=="PENDING")throw new Error("Submission already reviewed");
 const updated=await prisma.$transaction(async tx=>{
  const row=await tx.taskSubmission.update({where:{id},data:{status:approved?"APPROVED":"REJECTED",reviewNote:note.slice(0,500),reviewedAt:new Date(),rewardCredited:approved}});
  await tx.adminActionLog.create({data:{adminId,action:approved?"TASK_APPROVED":"TASK_REJECTED",targetId:id,metadata:{note}}});
  return row;
 });
 if(approved&&submission.task.rewardKobo>0)await creditWallet(submission.userId,submission.task.rewardKobo,"TASK_REWARD","task:"+id,"Approved task: "+submission.task.title);
 return updated;
}
