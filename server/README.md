# Omnira Server

## Deploy on Vercel (important)

1. Create a **separate Vercel project** for this API (not the same as the marketing frontend).
2. In **Project → Settings → General → Root Directory**, set **`server`** (the folder that contains `package.json` and `server.js`).  
   If Root Directory is the monorepo root, Vercel will **not** install `server/package.json` dependencies and the function will crash.
3. Add all variables from `env.vercel.production.template` (especially `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
4. Redeploy. `GET /` and `GET /health` should return JSON.

Vercel looks for Express at `server.js`, `index.js`, or **`src/index.js`**. This repo’s app lives in `src/index.js` and is now **`export default app`** so auto-detection works.

## Setup

1. Install dependencies:
   - `npm install`
2. Start server:
   - `npm run start`

On startup, terminal will show:
- `Supabase connected successfully.`
- `Server running on http://localhost:5000`

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
