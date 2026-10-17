-- Spares Desk schema. All objects are prefixed "spares_" so this can live safely
-- inside a Supabase project that already hosts other apps (e.g. an existing `items` table).
-- Safe to re-run: it only creates things that do not exist yet.

-- 1) Who may use the spares app -------------------------------------------------
-- Supabase auth users are shared across every app in a project. Without this
-- allowlist, any user of your other apps could read and edit spares data.
create table if not exists public.spares_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.spares_staff enable row level security; -- no policies: managed from the SQL editor only

create or replace function public.is_spares_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.spares_staff where user_id = auth.uid());
$$;
revoke execute on function public.is_spares_staff() from public, anon;
grant execute on function public.is_spares_staff() to authenticated;

-- 2) Tables ----------------------------------------------------------------------
create table if not exists public.spares_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  description text,
  location text,
  quantity integer not null default 0,
  min_quantity integer not null default 5,
  unit_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.spares_sales (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  payment_method text not null default 'cash',
  total numeric(12,2) not null default 0,
  cost_total numeric(12,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.spares_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.spares_sales(id) on delete cascade,
  item_id uuid references public.spares_items(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  cost_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists spares_sale_items_sale_id_idx on public.spares_sale_items(sale_id);
create index if not exists spares_sale_items_item_id_idx on public.spares_sale_items(item_id);
create index if not exists spares_sales_created_at_idx on public.spares_sales(created_at);

-- 3) Security: only spares staff ------------------------------------------------
grant select, insert, update, delete on public.spares_items, public.spares_sales, public.spares_sale_items to authenticated;
grant all on public.spares_items, public.spares_sales, public.spares_sale_items to service_role;

alter table public.spares_items enable row level security;
alter table public.spares_sales enable row level security;
alter table public.spares_sale_items enable row level security;

drop policy if exists "spares staff manage items" on public.spares_items;
create policy "spares staff manage items" on public.spares_items for all to authenticated
  using (public.is_spares_staff()) with check (public.is_spares_staff());
drop policy if exists "spares staff manage sales" on public.spares_sales;
create policy "spares staff manage sales" on public.spares_sales for all to authenticated
  using (public.is_spares_staff()) with check (public.is_spares_staff());
drop policy if exists "spares staff manage sale items" on public.spares_sale_items;
create policy "spares staff manage sale items" on public.spares_sale_items for all to authenticated
  using (public.is_spares_staff()) with check (public.is_spares_staff());

-- 4) Recording a sale (atomic: checks stock, deducts it, writes the sale) ---------
create or replace function public.spares_record_sale(_customer text, _payment text, _lines jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
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

-- 5) Add yourself as staff (EDIT THE EMAIL, then run this line on its own) --------
-- insert into public.spares_staff(user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;

notify pgrst, 'reload schema';
