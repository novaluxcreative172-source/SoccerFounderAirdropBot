import { Input, Markup, Telegraf } from "telegraf";
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
    return ctx.reply("✅ SoccerFounder admin notifications are connected. You will receive task screenshots and withdrawal alerts here.");
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
      const oldCaption = ctx.callbackQuery.message && "caption" in ctx.callbackQuery.message ? ctx.callbackQuery.message.caption || "" : "";
      await ctx.editMessageCaption(oldCaption + "\\n\\n" + (approved ? "✅ APPROVED" : "❌ REJECTED") + "\\n" + result, { reply_markup: { inline_keyboard: [] } });
    } catch (error: any) {
      const message = String(error?.message || "");
      await ctx.answerCbQuery(message.includes("already reviewed") ? "This submission was already reviewed." : "Review failed. Check the admin dashboard.", { show_alert: true });
    }
  });
}

export async function notifyAdminPhoto(photoUrl: string, caption: string, submissionId: string): Promise<boolean> {
  if (!adminNotificationBot) {
    console.error("Screenshot delivery failed: ADMIN_NOTIFICATION_BOT_TOKEN is not configured.");
    return false;
  }
  if (adminIds.length === 0) {
    console.error("Screenshot delivery failed: ADMIN_IDS is empty.");
    return false;
  }

  let delivered = 0;
  try {
    const response = await fetch(photoUrl);
    if (!response.ok) throw new Error("Main bot Telegram file download failed with HTTP " + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new Error("Downloaded screenshot is empty.");

    for (const adminId of adminIds) {
      if (!/^\\d+$/.test(adminId)) {
        console.error("Screenshot delivery skipped: invalid ADMIN_IDS entry:", adminId);
        continue;
      }
      try {
        await adminNotificationBot.telegram.sendPhoto(
          Number(adminId),
          Input.fromBuffer(bytes, "task-evidence.jpg"),
          {
            caption,
            ...Markup.inlineKeyboard([
              [Markup.button.callback("✅ Approve task", "review_approve_" + submissionId)],
              [Markup.button.callback("❌ Reject task", "review_reject_" + submissionId)]
            ])
          }
        );
        delivered++;
        console.log("Task screenshot successfully delivered to admin Telegram ID", adminId, "for submission", submissionId);
      } catch (error: any) {
        console.error("Task screenshot delivery failed for admin Telegram ID", adminId, "submission", submissionId, "Telegram error:", error?.response?.description || error?.description || error?.message || error);
      }
    }
  } catch (error: any) {
    console.error("Task screenshot could not be downloaded or forwarded. Submission:", submissionId, "Error:", error?.response?.description || error?.description || error?.message || error);
  }
  return delivered > 0;
}
