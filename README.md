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

## Roles, expenses and profit & loss

Run these in order in the Supabase SQL editor: `0001_sales_schema.sql`, the parts data,
`0002_categories.sql`, then `0003_roles_expenses.sql`.

* **Admin**: everything (sales, stock and prices, expenses, Profit & Loss, reports, users).
* **Cashier**: record sales and look up stock only.
* **Profit & Loss** = sales − cost of parts sold = gross profit, − expenses = net profit or loss.
  Record rent, salaries, transport etc. under **Expenses**.

### User management (Edge Function)

Creating logins needs the service-role key, which must never be in the browser, so it lives in a
Supabase Edge Function. Deploy it once:

1. Supabase → **Edge Functions → Deploy a new function → Via Editor**.
2. Name it exactly `spares-users`, paste the contents of `supabase/functions/spares-users/index.ts`.
3. Turn **off** "Verify JWT" (the function checks the caller itself), then **Deploy**.

Or with the CLI: `supabase functions deploy spares-users --no-verify-jwt`.

Set `VITE_USERNAME_DOMAIN` in `.env` (default `bkspares.com`) to the domain your staff logins use.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the production build |
| `npm test` | Run tests |

## Deploying (shared server)

The app uses hash routing (`/#/dashboard`) and relative asset paths, so it needs no server
rewrite rules and works at the domain root or in a sub-folder.

```sh
npm run build
```

Upload the **contents** of `dist/` (including the `assets` folder) to the server, for example
`public_html/spares/`, then open `https://yourdomain/spares/`. The Supabase URL and key are
baked in at build time from `.env`, so build after changing it.
