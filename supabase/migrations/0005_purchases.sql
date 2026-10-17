-- Spares Desk: receive stock from a supplier (many parts in one delivery).
-- Creates new parts when needed, adds to stock, updates cost prices and records the purchase.
-- Safe to re-run.

create table if not exists public.spares_purchases (
  id uuid primary key default gen_random_uuid(),
  supplier text,
  reference text,
  purchase_date date not null default current_date,
  total_cost numeric(12,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.spares_purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.spares_purchases(id) on delete cascade,
  item_id uuid references public.spares_items(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0)
);
create index if not exists spares_purchases_date_idx on public.spares_purchases(purchase_date);
create index if not exists spares_purchase_items_purchase_idx on public.spares_purchase_items(purchase_id);

grant select on public.spares_purchases, public.spares_purchase_items to authenticated;
grant all on public.spares_purchases, public.spares_purchase_items to service_role;
alter table public.spares_purchases enable row level security;
alter table public.spares_purchase_items enable row level security;
drop policy if exists "spares admin read purchases" on public.spares_purchases;
create policy "spares admin read purchases" on public.spares_purchases for select to authenticated
  using (public.is_spares_admin());
drop policy if exists "spares admin read purchase items" on public.spares_purchase_items;
create policy "spares admin read purchase items" on public.spares_purchase_items for select to authenticated
  using (public.is_spares_admin());

-- _lines: [{ item_id | (name, sku, category, min_quantity), quantity, unit_cost, unit_price? }, ...]
-- Existing parts: stock is added and the buying cost becomes the weighted average of old and new stock.
-- New parts (no item_id): created first. Quantity 0 is allowed for a new part (catalogue only).
create or replace function public.spares_receive_stock(_supplier text, _reference text, _date date, _lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _p uuid; _l jsonb; _it public.spares_items; _qty int; _cost numeric; _price numeric;
  _newcost numeric; _total numeric := 0; _sku text; _name text;
begin
  if not public.is_spares_admin() then raise exception 'Only admins can receive stock'; end if;
  if _lines is null or jsonb_typeof(_lines) <> 'array' or jsonb_array_length(_lines) = 0 then
    raise exception 'Add at least one part';
  end if;

  insert into public.spares_purchases(supplier, reference, purchase_date)
    values (nullif(trim(_supplier), ''), nullif(trim(_reference), ''), coalesce(_date, current_date))
    returning id into _p;

  for _l in select * from jsonb_array_elements(_lines) loop
    _qty   := coalesce((_l->>'quantity')::int, 0);
    _cost  := coalesce((_l->>'unit_cost')::numeric, 0);
    _price := nullif(_l->>'unit_price', '')::numeric;
    if _qty < 0 then raise exception 'Quantity cannot be negative'; end if;
    if _cost < 0 or coalesce(_price, 0) < 0 then raise exception 'Prices cannot be negative'; end if;

    if nullif(_l->>'item_id', '') is not null then
      if _qty = 0 then raise exception 'Quantity must be more than 0 for an existing part'; end if;
      select * into _it from public.spares_items where id = (_l->>'item_id')::uuid for update;
      if not found then raise exception 'Part not found'; end if;
    else
      _name := nullif(trim(_l->>'name'), '');
      _sku  := nullif(trim(_l->>'sku'), '');
      if _name is null then raise exception 'Every new part needs a name'; end if;
      if _sku is not null and exists (select 1 from public.spares_items where sku = _sku) then
        raise exception 'The code % is already used by another part', _sku;
      end if;
      insert into public.spares_items(name, sku, category, quantity, min_quantity, unit_price, cost_price)
        values (_name, _sku, coalesce(nullif(_l->>'category', ''), 'Other Spares'), 0,
                coalesce(nullif(_l->>'min_quantity', '')::int, 5), coalesce(_price, 0), 0)
        returning * into _it;
    end if;

    _newcost := case
      when _it.quantity + _qty = 0 then _cost
      when _it.quantity > 0 then round((_it.quantity * _it.cost_price + _qty * _cost) / (_it.quantity + _qty), 2)
      else _cost end;

    update public.spares_items set
      quantity = quantity + _qty,
      cost_price = _newcost,
      unit_price = coalesce(_price, unit_price),
      updated_at = now()
    where id = _it.id;

    insert into public.spares_purchase_items(purchase_id, item_id, item_name, quantity, unit_cost)
      values (_p, _it.id, _it.name, _qty, _cost);
    _total := _total + _qty * _cost;
  end loop;

  update public.spares_purchases set total_cost = _total where id = _p;
  return _p;
end $$;
revoke execute on function public.spares_receive_stock(text, text, date, jsonb) from public, anon;
grant execute on function public.spares_receive_stock(text, text, date, jsonb) to authenticated;

notify pgrst, 'reload schema';
