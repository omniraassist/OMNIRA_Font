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

## Run database schema in Supabase

1. Open Supabase project SQL Editor.
2. Paste contents of `server/sql/schema.sql`.
3. Run query.
