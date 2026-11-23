# SoccerFounder Airdrop & Rewards Bot

Telegram campaign bot using Node.js, TypeScript, Telegraf, PostgreSQL and Prisma.

## Features in this initial build
- Telegram onboarding and six-step checklist.
- Task evidence submission with administrator review pending.
- Personal wallet summary and referral links.
- PostgreSQL data models and seed tasks.
- Render blueprint and health endpoint.

## Campaign safeguards
- Required sponsor is Shane.
- Engagement requirement defaults to 30 days; do not approve it solely from a user's claim.
- No reward amounts are assumed; task rewards and referral reward default to zero.
- Website, Super One and Coach Bot have no assumed private API integration; manual review is required.
- Manual withdrawals only; never request a PIN, password, OTP or card security code.
- This community campaign bot must not be represented as officially operated by Super One.

## Local setup
1. Use Node.js 20+ and PostgreSQL.
2. Copy .env.example to .env and fill BOT_TOKEN, DATABASE_URL, ADMIN_IDS and a long ADMIN_SESSION_SECRET.
3. Run npm install, npx prisma generate, npx prisma migrate dev --name init, npm run prisma:seed, then npm run dev.
4. Health check: /health.

## Render
Create a Blueprint from render.yaml. Set BOT_TOKEN, ADMIN_IDS and WEBHOOK_DOMAIN. Review current Render pricing before provisioning resources. Make the bot an administrator in the support group before enabling membership/activity checks.

## Development status
This is the first backend foundation, not yet a complete public-launch product. Admin dashboard UI, withdrawal workflow, verified 30-day activity engine, group membership checks, notifications, and end-to-end tests still need implementation. Never commit .env or live credentials.
