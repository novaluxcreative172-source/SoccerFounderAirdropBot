import { Markup, Telegraf } from "telegraf";
import { config } from "./config";

const adminIds = config.ADMIN_IDS.split(",").map(value => value.trim()).filter(Boolean);

export const adminNotificationBot = config.ADMIN_NOTIFICATION_BOT_TOKEN
  ? new Telegraf(config.ADMIN_NOTIFICATION_BOT_TOKEN)
  : null;

if (adminNotificationBot) {
  adminNotificationBot.start(async ctx => {
    if (!adminIds.includes(String(ctx.from.id))) {
      return ctx.reply("This bot is for authorized campaign administrators only.");
    }
    return ctx.reply("✅ ADMIN NOTIFICATIONS CONNECTED\n\nYou will receive:\n• New task submission alerts\n• Participant details\n• Withdrawal alerts\n\nUse Confirm Paid after manually sending a withdrawal payment. Use the Approve or Reject buttons to review task evidence.");
  });
  adminNotificationBot.catch(error => console.error("Admin notification bot error:", error));
}

export async function notifyAdminText(message: string): Promise<void> {
  if (!adminNotificationBot) {
    console.warn("Admin notification bot token is not configured; admin text alert was not sent.");
    return;
  }
  for (const adminId of adminIds) {
    try {
      await adminNotificationBot.telegram.sendMessage(Number(adminId), message);
    } catch (error) {
      console.error("Could not send admin notification to", adminId, error);
    }
  }
}


type AdminReviewHandler = (submissionId: string, approved: boolean, adminId: string) => Promise<string>;
export function registerAdminReviewHandler(handler: AdminReviewHandler): void {
  if (!adminNotificationBot) return;
  adminNotificationBot.action(/^review_(approve|reject)_([A-Za-z0-9_-]+)$/, async ctx => {
    const adminId = String(ctx.from.id);
    if (!adminIds.includes(adminId)) {
      await ctx.answerCbQuery("Not authorized.", { show_alert: true });
      return;
    }
    const approved = ctx.match[1] === "approve";
    const submissionId = ctx.match[2];
    try {
      const result = await handler(submissionId, approved, adminId);
      await ctx.answerCbQuery(approved ? "Task approved." : "Task rejected.");
      const oldText = ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text || "" : "";
      await ctx.editMessageText(oldText + "\n\n" + (approved ? "✅ APPROVED" : "❌ REJECTED") + "\n" + result, { reply_markup: { inline_keyboard: [] } });
    } catch (error: any) {
      const message = String(error?.message || "");
      await ctx.answerCbQuery(message.includes("already reviewed") ? "This submission was already reviewed." : "Review failed. Check the admin dashboard.", { show_alert: true });
    }
  });
}

export async function notifyAdminReview(message: string, submissionId: string): Promise<boolean> {
  console.log("[SUBMISSION] Sending text-only admin review alert. Submission:", submissionId,
    "Notification bot ready:", Boolean(adminNotificationBot),
    "Admin recipients:", adminIds.length);

  if (!adminNotificationBot) {
    console.error("[SUBMISSION] FAILED: ADMIN_NOTIFICATION_BOT_TOKEN is not configured.");
    return false;
  }
  const validAdminIds = adminIds.filter(id => /^\d+$/.test(id));
  if (validAdminIds.length === 0) {
    console.error("[SUBMISSION] FAILED: no valid numeric ADMIN_IDS configured.");
    return false;
  }

  let delivered = 0;
  for (const adminId of validAdminIds) {
    try {
      await adminNotificationBot.telegram.sendMessage(Number(adminId), message, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback("✅ Approve task", "review_approve_" + submissionId)],
          [Markup.button.callback("❌ Reject task", "review_reject_" + submissionId)]
        ])
      });
      delivered++;
      console.log("[SUBMISSION] Text-only review alert delivered to admin", adminId, "submission", submissionId);
    } catch (error: any) {
      console.error("[SUBMISSION] Text-only alert failed for admin", adminId, "submission", submissionId,
        error?.response?.description || error?.message || String(error));
    }
  }
  return delivered > 0;
}


type AdminWithdrawalHandler = (withdrawalId: string, adminId: string) => Promise<string>;
export function registerAdminWithdrawalHandler(handler: AdminWithdrawalHandler): void {
  if (!adminNotificationBot) return;
  adminNotificationBot.action(/^withdraw_paid_([A-Za-z0-9_-]+)$/, async ctx => {
    const adminId = String(ctx.from.id);
    if (!adminIds.includes(adminId)) {
      await ctx.answerCbQuery("Not authorized.", { show_alert: true });
      return;
    }
    const withdrawalId = ctx.match[1];
    try {
      const result = await handler(withdrawalId, adminId);
      await ctx.answerCbQuery("Payment marked as paid.");
      const oldText = ctx.callbackQuery.message && "text" in ctx.callbackQuery.message ? ctx.callbackQuery.message.text || "" : "";
      await ctx.editMessageText(oldText + "\\n\\n✅ PAYMENT CONFIRMED\\n" + result, { reply_markup: { inline_keyboard: [] } });
    } catch (error: any) {
      const message = String(error?.message || "");
      await ctx.answerCbQuery(message.includes("already paid") ? "This withdrawal is already marked paid." : "Payment confirmation failed. Check the admin dashboard.", { show_alert: true });
    }
  });
}

export async function notifyAdminWithdrawal(message: string, withdrawalId: string): Promise<boolean> {
  if (!adminNotificationBot) {
    console.error("[WITHDRAWAL] Admin notification bot token is not configured.");
    return false;
  }
  const validAdminIds = adminIds.filter(id => /^\\d+$/.test(id));
  if (!validAdminIds.length) {
    console.error("[WITHDRAWAL] No valid numeric ADMIN_IDS configured.");
    return false;
  }
  let delivered = 0;
  for (const adminId of validAdminIds) {
    try {
      await adminNotificationBot.telegram.sendMessage(Number(adminId), message, Markup.inlineKeyboard([
        [Markup.button.callback("✅ Confirm Paid — payment sent", "withdraw_paid_" + withdrawalId)]
      ]));
      delivered++;
      console.log("[WITHDRAWAL] Alert with Confirm Paid button delivered to", adminId, withdrawalId);
    } catch (error: any) {
      console.error("[WITHDRAWAL] Alert delivery failed for", adminId, withdrawalId, error?.response?.description || error?.message || String(error));
    }
  }
  return delivered > 0;
}
