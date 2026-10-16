create table public.items (
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
grant select, insert, update, delete on public.items to authenticated;
grant all on public.items to service_role;
alter table public.items enable row level security;
create policy "staff manage items" on public.items for all to authenticated using (true) with check (true);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  payment_method text not null default 'cash',
  total numeric(12,2) not null default 0,
  cost_total numeric(12,2) not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;
create policy "staff manage sales" on public.sales for all to authenticated using (true) with check (true);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  item_id uuid references public.items(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  cost_price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index on public.sale_items(sale_id);
create index on public.sale_items(item_id);
create index on public.sales(created_at);
grant select, insert, update, delete on public.sale_items to authenticated;
grant all on public.sale_items to service_role;
alter table public.sale_items enable row level security;
create policy "staff manage sale items" on public.sale_items for all to authenticated using (true) with check (true);

create or replace function public.record_sale(_customer text, _payment text, _lines jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare _sale uuid; _l jsonb; _it public.items; _qty int; _price numeric; _total numeric := 0; _cost numeric := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if jsonb_array_length(_lines) = 0 then raise exception 'Sale has no items'; end if;
  insert into public.sales(customer_name, payment_method, created_by) values (nullif(_customer,''), coalesce(_payment,'cash'), auth.uid()) returning id into _sale;
  for _l in select * from jsonb_array_elements(_lines) loop
    _qty := (_l->>'quantity')::int; _price := (_l->>'unit_price')::numeric;
    if _qty <= 0 then raise exception 'Quantity must be positive'; end if;
    select * into _it from public.items where id = (_l->>'item_id')::uuid for update;
    if not found then raise exception 'Item not found'; end if;
    if _it.quantity < _qty then raise exception 'Not enough stock for %', _it.name; end if;
    update public.items set quantity = quantity - _qty, updated_at = now() where id = _it.id;
    insert into public.sale_items(sale_id, item_id, item_name, quantity, unit_price, cost_price) values (_sale, _it.id, _it.name, _qty, _price, _it.cost_price);
    _total := _total + _qty * _price; _cost := _cost + _qty * _it.cost_price;
  end loop;
  update public.sales set total = _total, cost_total = _cost where id = _sale;
  return _sale;
end $$;
revoke execute on function public.record_sale(text, text, jsonb) from public, anon;
grant execute on function public.record_sale(text, text, jsonb) to authenticated;