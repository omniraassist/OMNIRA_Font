# Omnira Server

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
