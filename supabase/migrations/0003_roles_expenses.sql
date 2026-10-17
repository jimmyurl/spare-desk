-- Spares Desk: user roles, expenses (for profit & loss) and tighter access rules.
-- Safe to re-run. Everything is prefixed "spares_", so your other apps are not touched.

-- 1) Staff: roles, username, status ------------------------------------------------
do $$ begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'spares_staff' and column_name = 'role') then
    alter table public.spares_staff
      add column role text not null default 'cashier' check (role in ('admin', 'cashier'));
    update public.spares_staff set role = 'admin';   -- everyone added so far becomes an admin
  end if;
end $$;
alter table public.spares_staff add column if not exists username text;
alter table public.spares_staff add column if not exists full_name text;
alter table public.spares_staff add column if not exists active boolean not null default true;
update public.spares_staff s set username = split_part(u.email, '@', 1)
  from auth.users u where u.id = s.user_id and s.username is null;

create or replace function public.spares_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.spares_staff where user_id = auth.uid() and active;
$$;
create or replace function public.is_spares_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.spares_role() is not null;
$$;
create or replace function public.is_spares_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.spares_role() = 'admin';
$$;
create or replace function public.spares_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(r) from (
    select role, username, full_name from public.spares_staff where user_id = auth.uid() and active
  ) r;
$$;
revoke execute on function public.spares_role(), public.is_spares_staff(), public.is_spares_admin(), public.spares_me() from public, anon;
grant execute on function public.spares_role(), public.is_spares_staff(), public.is_spares_admin(), public.spares_me() to authenticated;

-- 2) Expenses ----------------------------------------------------------------------
create table if not exists public.spares_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null default 'Other',
  description text,
  amount numeric(12,2) not null check (amount > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists spares_expenses_date_idx on public.spares_expenses(expense_date);
grant select, insert, update, delete on public.spares_expenses to authenticated;
grant all on public.spares_expenses to service_role;
alter table public.spares_expenses enable row level security;
drop policy if exists "spares admin manage expenses" on public.spares_expenses;
create policy "spares admin manage expenses" on public.spares_expenses for all to authenticated
  using (public.is_spares_admin()) with check (public.is_spares_admin());

-- 3) Access rules: admin = everything, cashier = sell + view stock -------------------
drop policy if exists "spares staff manage items" on public.spares_items;
drop policy if exists "spares staff read items" on public.spares_items;
drop policy if exists "spares admin write items" on public.spares_items;
create policy "spares staff read items" on public.spares_items for select to authenticated
  using (public.is_spares_staff());
create policy "spares admin write items" on public.spares_items for all to authenticated
  using (public.is_spares_admin()) with check (public.is_spares_admin());

-- Sales can only be created through spares_record_sale(); nobody edits them directly.
drop policy if exists "spares staff manage sales" on public.spares_sales;
drop policy if exists "spares read sales" on public.spares_sales;
create policy "spares read sales" on public.spares_sales for select to authenticated
  using (public.is_spares_admin() or (public.is_spares_staff() and created_by = auth.uid()));
drop policy if exists "spares staff manage sale items" on public.spares_sale_items;
drop policy if exists "spares read sale items" on public.spares_sale_items;
create policy "spares read sale items" on public.spares_sale_items for select to authenticated
  using (public.is_spares_admin() or exists (
    select 1 from public.spares_sales s where s.id = sale_id and s.created_by = auth.uid()));
revoke insert, update, delete on public.spares_sales, public.spares_sale_items from authenticated;

-- record_sale now runs with owner rights (so cashiers can deduct stock) after checking staff.
create or replace function public.spares_record_sale(_customer text, _payment text, _lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare _sale uuid; _l jsonb; _it public.spares_items; _qty int; _price numeric; _total numeric := 0; _cost numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not public.is_spares_staff() then raise exception 'Not authorised for Spares Desk'; end if;
  if jsonb_array_length(_lines) = 0 then raise exception 'Sale has no items'; end if;
  insert into public.spares_sales(customer_name, payment_method, created_by)
    values (nullif(_customer,''), coalesce(_payment,'cash'), auth.uid()) returning id into _sale;
  for _l in select * from jsonb_array_elements(_lines) loop
    _qty := (_l->>'quantity')::int; _price := (_l->>'unit_price')::numeric;
    if _qty <= 0 then raise exception 'Quantity must be positive'; end if;
    select * into _it from public.spares_items where id = (_l->>'item_id')::uuid for update;
    if not found then raise exception 'Item not found'; end if;
    if _it.quantity < _qty then raise exception 'Not enough stock for %', _it.name; end if;
    update public.spares_items set quantity = quantity - _qty, updated_at = now() where id = _it.id;
    insert into public.spares_sale_items(sale_id, item_id, item_name, quantity, unit_price, cost_price)
      values (_sale, _it.id, _it.name, _qty, _price, _it.cost_price);
    _total := _total + _qty * _price; _cost := _cost + _qty * _it.cost_price;
  end loop;
  update public.spares_sales set total = _total, cost_total = _cost where id = _sale;
  return _sale;
end $$;
revoke execute on function public.spares_record_sale(text, text, jsonb) from public, anon;
grant execute on function public.spares_record_sale(text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
