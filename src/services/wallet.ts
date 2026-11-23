import {prisma} from "../db";
import {TransactionType} from "@prisma/client";
export async function creditWallet(userId:string,amountKobo:number,type:TransactionType,reference:string,description:string){
 if(!Number.isSafeInteger(amountKobo)||amountKobo<=0)throw new Error("Amount must be a positive integer in kobo");
 return prisma.$transaction(async tx=>{
  const old=await tx.walletTransaction.findUnique({where:{reference}});
  if(old)return old;
  await tx.wallet.upsert({where:{userId},create:{userId,availableKobo:amountKobo,totalEarnedKobo:amountKobo},update:{availableKobo:{increment:amountKobo},totalEarnedKobo:{increment:amountKobo}});
  return tx.walletTransaction.create({data:{userId,type,amountKobo,reference,description}});
 });
}
