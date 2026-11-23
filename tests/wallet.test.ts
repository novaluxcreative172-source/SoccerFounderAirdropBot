import {describe,it,expect} from "vitest";
describe("currency representation",()=>{
 it("converts naira to integer kobo",()=>{
  const amountNaira=1500;
  const amountKobo=Math.round(amountNaira*100);
  expect(amountKobo).toBe(150000);
  expect(Number.isSafeInteger(amountKobo)).toBe(true);
 });
 it("rejects non-positive reward values",()=>{
  const valid=(n:number)=>Number.isSafeInteger(n)&&n>0;
  expect(valid(500)).toBe(true);
  expect(valid(0)).toBe(false);
  expect(valid(-1)).toBe(false);
 });
});
