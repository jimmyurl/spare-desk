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

1. Run `supabase/migrations/0001_sales_schema.sql` in the Supabase SQL editor. All tables are
   prefixed `spares_` (`spares_items`, `spares_sales`, `spares_sale_items`, `spares_staff`), so it
   can share a project with other apps. Only users listed in `spares_staff` can use the app:
   edit and run the last `insert into public.spares_staff ...` line with your login email.
2. Load your 192 parts into `spares_items` (change `public.items` to `public.spares_items` in your INSERT SQL).
3. **Create users (username login).** Staff sign in with a username. In Supabase go to
   Authentication → Users → Add user → Create new user, enter `<username>@spares.example.com`
   (e.g. `admin@spares.example.com`), a password, and tick **Auto Confirm User**. Then run:
   ```sql
   insert into public.spares_staff(user_id)
   select id from auth.users where email = 'admin@spares.example.com' on conflict do nothing;
   ```
   The person signs in with just `admin` and the password. The email domain is set in
   `src/lib/username.ts`; example.com is reserved, so nothing is ever delivered to it.
4. For local dev, add `http://localhost:5173/**` under Authentication → URL Configuration.

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
