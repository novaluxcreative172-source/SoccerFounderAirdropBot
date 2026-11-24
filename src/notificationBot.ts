import { Telegraf } from "telegraf";
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

export async function notifyAdminPhoto(photoFileId: string, caption: string): Promise<void> {
  if (!adminNotificationBot) {
    console.warn("Admin notification bot token is not configured; admin screenshot was not forwarded.");
    return;
  }
  for (const adminId of adminIds) {
    try {
      await adminNotificationBot.telegram.sendPhoto(Number(adminId), photoFileId, { caption });
    } catch (error) {
      console.error("Could not send admin screenshot to", adminId, error);
    }
  }
}
