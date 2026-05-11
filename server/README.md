# Omnira Server

## Deploy on Vercel (important)

1. Create a **separate Vercel project** for this API (not the same as the marketing frontend).
2. In **Project → Settings → General → Root Directory**, set **`server`** (the folder that contains `package.json` and `server.js`).  
   If Root Directory is the monorepo root, Vercel will **not** install `server/package.json` dependencies and the function will crash.
3. Add all variables from `env.vercel.production.template` (especially `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
4. **WhatsApp bot:** In Vercel you must set the same Meta + OpenAI variables as in local `server/.env` (`META_WABA_VERIFY_TOKEN`, `META_WABA_ACCESS_TOKEN`, `META_WABA_PHONE_NUMBER_ID`, `OPENAI_API_KEY`, and either `META_WABA_APP_SECRET` or temporarily `META_WABA_WEBHOOK_SKIP_SIGNATURE=true`). In Meta Developers → WhatsApp → Configuration, set the webhook URL to **`https://<your-backend>.vercel.app/api/meta/whatsapp/webhook`** (replace with your real backend hostname, e.g. `omnira-backend.vercel.app`). After deploy, open **`GET https://<backend>/`** and **`GET https://<backend>/health`**: `vercel_env` should be **`production`**, `meta_whatsapp_replies_ready` should be **`true`**. If every flag is still `false`, the variables are on the wrong Vercel **project**, only enabled for **Preview** (not Production), or the project was not **redeployed** after saving env.
5. Redeploy. `GET /` and `GET /health` should return JSON.

Vercel looks for Express at `server.js`, `index.js`, or **`src/index.js`**. This repo’s app lives in `src/index.js` and is now **`export default app`** so auto-detection works.

## Setup

1. Install dependencies:
   - `npm install`
2. Start server:
   - `npm run start`

On startup, terminal will show:
- `Supabase connected successfully.`
- `Server running on http://localhost:5000`

## Production smoke test (CLI)

From `server/`:

```bash
npm run verify:production
# or another host:
OMNIRA_VERIFY_BASE=https://your-backend.vercel.app npm run verify:production
```

Checks `GET /`, `GET /health`, Stripe publishable key route, and Meta webhook verify (using `META_WABA_VERIFY_TOKEN` from local `server/.env`). Exit code **1** if payment or WhatsApp readiness fails on that deployment.

Full WhatsApp + OpenAI pipeline (optional): `npm run test:wa-agent` with `OMNIRA_WA_TEST_BASE` set to the same URL.

## Health check

- `GET http://localhost:5000/health`

## Database schema (single file)

All DDL lives in **`server/sql/schema.sql`** only.

**Option A — Supabase SQL Editor:** paste the full contents of `server/sql/schema.sql` and run.

**Option B — Node (needs direct Postgres URI in `server/.env`):**

```bash
cd server
npm run db:up
```

Set `DATABASE_URL` to the **direct** connection string (port **5432**), from Supabase → Project Settings → Database. For TLS issues locally, add `PGSSL_REJECT_UNAUTHORIZED=0`.

**Destructive reset** (drops Omnira tables, then reapplies schema):

```bash
npm run db:reset
```
