# SoccerFounder Airdrop & Rewards Bot

Telegram campaign bot using Node.js, TypeScript, Telegraf, PostgreSQL and Prisma.

## Implemented in this build
- Telegram onboarding, six-step checklist and task evidence submission.
- Participant wallet summary and referral links.
- Participant withdrawal requests using Nigerian bank account details.
- Wallet balance reservation when a withdrawal is submitted.
- Admin dashboard at `/admin` to view requests, confirm manual bank payments, or reject requests.
- Confirming payment changes the withdrawal status to `PAID`, updates wallet totals and notifies the participant in Telegram.
- Rejecting a request returns the reserved amount to the participant's available wallet and sends the rejection reason.
- Authenticated admin API, request rate limiting, health endpoint and Render deployment blueprint.

## Manual withdrawal process
1. Participant sends `/withdraw AMOUNT | ACCOUNT NAME | BANK NAME | 10-DIGIT ACCOUNT NUMBER` in the bot.
2. The bot validates the request and reserves the amount from the participant's available wallet balance.
3. The request appears as `PENDING` in the dashboard at `https://YOUR-RENDER-SERVICE.onrender.com/admin`.
4. Admin sends the money manually using any Nigerian bank/payment app.
5. Only after the transfer succeeds, admin clicks **Confirm Paid**. The request becomes `PAID`, the wallet's pending amount decreases, withdrawn total increases, and the participant receives a Telegram notification.
6. If the request is rejected, the admin must provide a reason. The reserved amount is returned to the available balance.

The dashboard requires the `ADMIN_SESSION_SECRET` environment variable. Keep it private. Do not commit it or share it with participants. Bank account details are sensitive; restrict dashboard access and use the HTTPS Render URL.

## Campaign safeguards
- Required sponsor is Shane.
- Engagement requirement defaults to 30 days; do not approve it solely from a user's claim.
- No reward amounts are assumed; task rewards and referral reward default to zero.
- Website, Super One and Coach Bot have no assumed private API integration; manual review is required.
- Manual withdrawals only; the system does not initiate bank transfers or claim that money was sent.
- This community campaign bot must not be represented as officially operated by Super One.
- Never request a participant's bank PIN, password, OTP or card security code.

## Local setup
1. Use Node.js 20+ and PostgreSQL.
2. Copy .env.example to .env and fill BOT_TOKEN, DATABASE_URL, ADMIN_IDS and a long ADMIN_SESSION_SECRET.
3. Run `npm install`, `npx prisma generate`, `npx prisma db push`, `npm run prisma:seed`, then `npm run dev`.
4. Open `/admin` on your local server and sign in using ADMIN_SESSION_SECRET.
5. Health check: `/health`.

## Render
Create a Blueprint from render.yaml. Set BOT_TOKEN and ADMIN_IDS (the Telegram admin ID configured for bot-side admin features). Set a private, long ADMIN_SESSION_SECRET if you want to choose your own dashboard key; otherwise Render generates one. Review current Render pricing before provisioning resources. Make the bot an administrator in the support group before enabling membership/activity checks.

## Development status
This is an evolving implementation, not yet a production-audited launch. The withdrawal request and manual confirmation workflow is implemented, but automated bank transfers, bank account name verification, full task-verification dashboard, group activity tracking, and full end-to-end production testing are not implemented. Run the GitHub Actions checks and test with a small internal test balance before inviting participants.
