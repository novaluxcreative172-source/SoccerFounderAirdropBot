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
    return ctx.reply("✅ ADMIN NOTIFICATIONS CONNECTED\n\nYou will receive:\n• New task screenshots\n• Participant details\n• Withdrawal alerts\n\nUse the Approve or Reject buttons to review task evidence.");
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
      await ctx.editMessageCaption(oldCaption + "\n\n" + (approved ? "✅ APPROVED" : "❌ REJECTED") + "\n" + result, { reply_markup: { inline_keyboard: [] } });
    } catch (error: any) {
      const message = String(error?.message || "");
      await ctx.answerCbQuery(message.includes("already reviewed") ? "This submission was already reviewed." : "Review failed. Check the admin dashboard.", { show_alert: true });
    }
  });
}

export async function notifyAdminPhoto(photoUrl: string, caption: string, submissionId: string): Promise<boolean> {
  console.log("[SCREENSHOT] Forwarding started. Submission:", submissionId,
    "Notification bot ready:", Boolean(adminNotificationBot),
    "Admin recipients:", adminIds.length);

  if (!adminNotificationBot) {
    console.error("[SCREENSHOT] FAILED: ADMIN_NOTIFICATION_BOT_TOKEN is not configured.");
    return false;
  }
  const validAdminIds = adminIds.filter(id => /^\d+$/.test(id));
  if (validAdminIds.length === 0) {
    console.error("[SCREENSHOT] FAILED: no valid numeric ADMIN_IDS configured. Entries:", adminIds.length);
    return false;
  }

  // Download the image with the MAIN bot's file URL, then upload the bytes
  // through the notification bot. Telegram file_id values and file URLs are
  // bot-specific, so the notification bot must not be asked to fetch that URL.
  let imageBuffer: Buffer;
  let filename = "task-evidence.jpg";
  try {
    console.log("[SCREENSHOT] Downloading image through main bot file URL. Submission:", submissionId);
    const response = await fetch(photoUrl);
    if (!response.ok) {
      throw new Error("Main bot file download returned HTTP " + response.status);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      throw new Error("Downloaded file is not an image. Content-Type: " + contentType);
    }
    const arrayBuffer = await response.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
    if (imageBuffer.length === 0) throw new Error("Downloaded screenshot is empty.");
    if (imageBuffer.length > 20 * 1024 * 1024) {
      throw new Error("Screenshot exceeds Telegram's 20 MB bot upload limit.");
    }
    const extension = contentType.toLowerCase().includes("png") ? "png"
      : contentType.toLowerCase().includes("webp") ? "webp"
      : contentType.toLowerCase().includes("gif") ? "gif" : "jpg";
    filename = "task-evidence." + extension;
    console.log("[SCREENSHOT] Image downloaded successfully. Submission:", submissionId,
      "Bytes:", imageBuffer.length, "Content-Type:", contentType);
  } catch (error: any) {
    console.error("[SCREENSHOT] MAIN BOT IMAGE DOWNLOAD FAILED. Submission:", submissionId,
      "Error:", error?.message || String(error));
    return false;
  }

  let delivered = 0;
  for (const adminId of validAdminIds) {
    try {
      console.log("[SCREENSHOT] Uploading image bytes to admin", adminId, "submission", submissionId);
      await adminNotificationBot.telegram.sendPhoto(
        Number(adminId),
        { source: imageBuffer, filename },
        {
          caption,
          ...Markup.inlineKeyboard([
            [Markup.button.callback("✅ Approve task", "review_approve_" + submissionId)],
            [Markup.button.callback("❌ Reject task", "review_reject_" + submissionId)]
          ])
        }
      );
      delivered++;
      console.log("[SCREENSHOT] SUCCESS: uploaded image to admin", adminId, "submission", submissionId);
    } catch (error: any) {
      console.error("[SCREENSHOT] SEND FAILED: admin", adminId, "submission", submissionId,
        "Telegram error:", error?.response?.description || error?.description || error?.message || String(error));
    }
  }
  console.log("[SCREENSHOT] Forwarding finished. Submission:", submissionId, "Delivered:", delivered, "of", validAdminIds.length);
  return delivered > 0;
}
