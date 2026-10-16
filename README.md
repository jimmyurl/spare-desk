# Spares Desk — Spare Parts Sales Dashboard

A React + Vite + TypeScript app with Supabase (auth + Postgres) for tracking
sales, stock and profit in a spare parts shop.

**Stack:** React 19, Vite, TanStack Router (file-based) and Query, Tailwind CSS v4,
shadcn/ui, Recharts, Supabase.

## Setup

```sh
npm install
cp .env.example .env     # then fill in your Supabase URL and publishable key
npm run dev
```

## Supabase

1. Run `supabase/migrations/0001_sales_schema.sql` in the Supabase SQL editor
   (creates `items`, `sales`, `sale_items`, RLS policies and the `record_sale` function).
2. Load your 192 parts into `items` (your `INSERT public.items` SQL).
3. **Authentication → URL Configuration:** set Site URL to your deployed URL and add
   `http://localhost:5173/**` to Redirect URLs.
4. **Google sign-in (optional):** Authentication → Providers → Google, add your own
   Google OAuth client ID/secret. Email + password works without this.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Run tests |

## Deploying

It is a static site: upload `dist/` to Vercel, Netlify or Cloudflare Pages. Set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables
on the host. SPA fallback rules are included (`vercel.json`, `public/_redirects`).
# spare-desk
