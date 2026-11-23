import "dotenv/config";
import { z } from "zod";
const schema=z.object({
 BOT_TOKEN:z.string().min(1), DATABASE_URL:z.string().min(1), ADMIN_IDS:z.string().default(""),
 NODE_ENV:z.enum(["development","production","test"]).default("development"), PORT:z.coerce.number().default(3000),
 WEBHOOK_DOMAIN:z.string().optional(), WEBHOOK_SECRET:z.string().optional(), ADMIN_SESSION_SECRET:z.string().min(16).optional(),
 BOT_USERNAME:z.string().default("SoccerFounderAirdropBot"), WEBSITE_URL:z.string().url().default("https://www.SoccerFounder.com"),
 COACH_BOT_USERNAME:z.string().default("SoccerFounderCoachBot"), SUPPORT_GROUP_ID:z.string().optional(),
 SUPPORT_GROUP_INVITE_URL:z.string().optional(), REQUIRED_SPONSOR:z.string().default("Shane"),
 MIN_WITHDRAWAL_NGN:z.coerce.number().default(1000), ENGAGEMENT_DAYS:z.coerce.number().default(30)
});
export const config=schema.parse(process.env);
export const adminIds=new Set(config.ADMIN_IDS.split(",").map(x=>x.trim()).filter(Boolean));
