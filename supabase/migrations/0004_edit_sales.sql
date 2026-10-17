-- Spares Desk: let admins correct or delete wrong sales. Stock is put back automatically,
-- and every change is written to an audit log. Safe to re-run.

alter table public.spares_sales add column if not exists edited_at timestamptz;

-- Audit log (kept even after a sale is deleted, so there is no foreign key to spares_sales).
create table if not exists public.spares_sale_audit (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null,
  action text not null check (action in ('edit', 'delete')),
  by_user uuid default auth.uid(),
  at timestamptz not null default now(),
  before jsonb,
  after jsonb
);
alter table public.spares_sale_audit enable row level security;
grant select on public.spares_sale_audit to authenticated;
grant all on public.spares_sale_audit to service_role;
drop policy if exists "spares admin read audit" on public.spares_sale_audit;
create policy "spares admin read audit" on public.spares_sale_audit for select to authenticated
  using (public.is_spares_admin());

-- Internal helper: a sale with its lines as JSON (not callable from the app).
create or replace function public.spares_sale_snapshot(_sale uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) || jsonb_build_object('lines', coalesce(
    (select jsonb_agg(to_jsonb(l)) from public.spares_sale_items l where l.sale_id = s.id), '[]'::jsonb))
  from public.spares_sales s where s.id = _sale;
$$;
revoke execute on function public.spares_sale_snapshot(uuid) from public, anon, authenticated;

-- Delete a sale; by default the parts go back into stock.
create or replace function public.spares_delete_sale(_sale uuid, _restock boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare _snap jsonb;
begin
  if not public.is_spares_admin() then raise exception 'Only admins can delete sales'; end if;
  _snap := public.spares_sale_snapshot(_sale);
  if _snap is null then raise exception 'Sale not found'; end if;
  if _restock then
    update public.spares_items i set quantity = i.quantity + l.q, updated_at = now()
      from (select item_id, sum(quantity) as q from public.spares_sale_items
            where sale_id = _sale and item_id is not null group by item_id) l
      where i.id = l.item_id;
  end if;
  insert into public.spares_sale_audit(sale_id, action, before) values (_sale, 'delete', _snap);
  delete from public.spares_sales where id = _sale;
end $$;

-- Edit a sale. _lines = null keeps the parts as they are (only customer / payment / date change).
-- Otherwise the old quantities go back into stock and the new lines are deducted again.
create or replace function public.spares_update_sale(
  _sale uuid, _customer text, _payment text, _lines jsonb default null, _sold_at timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare _before jsonb; _l jsonb; _it public.spares_items; _qty int; _price numeric; _cost numeric;
        _total numeric := 0; _costtot numeric := 0; _new jsonb := '[]'::jsonb;
begin
  if not public.is_spares_admin() then raise exception 'Only admins can edit sales'; end if;
  _before := public.spares_sale_snapshot(_sale);
  if _before is null then raise exception 'Sale not found'; end if;

  if _lines is not null then
    if jsonb_array_length(_lines) = 0 then
      raise exception 'A sale needs at least one part. Delete the sale instead.';
    end if;
    -- 1) put the old quantities back
    update public.spares_items i set quantity = i.quantity + l.q, updated_at = now()
      from (select item_id, sum(quantity) as q from public.spares_sale_items
            where sale_id = _sale and item_id is not null group by item_id) l
      where i.id = l.item_id;
    -- 2) deduct the new lines
    for _l in select * from jsonb_array_elements(_lines) loop
      _qty := (_l->>'quantity')::int; _price := (_l->>'unit_price')::numeric;
      if _qty <= 0 then raise exception 'Quantity must be positive'; end if;
      if _price < 0 then raise exception 'Price cannot be negative'; end if;
      select * into _it from public.spares_items where id = (_l->>'item_id')::uuid for update;
      if not found then raise exception 'Part not found'; end if;
      if _it.quantity < _qty then raise exception 'Not enough stock for % (only % available)', _it.name, _it.quantity; end if;
      update public.spares_items set quantity = quantity - _qty, updated_at = now() where id = _it.id;
      -- keep the cost the part had when it was first sold; new parts use today's cost
      select cost_price into _cost from public.spares_sale_items where sale_id = _sale and item_id = _it.id limit 1;
      _cost := coalesce(_cost, _it.cost_price);
      _new := _new || jsonb_build_object('item_id', _it.id, 'item_name', _it.name, 'quantity', _qty,
                                          'unit_price', _price, 'cost_price', _cost);
      _total := _total + _qty * _price; _costtot := _costtot + _qty * _cost;
    end loop;
    delete from public.spares_sale_items where sale_id = _sale;
    insert into public.spares_sale_items(sale_id, item_id, item_name, quantity, unit_price, cost_price)
      select _sale, (x->>'item_id')::uuid, x->>'item_name', (x->>'quantity')::int,
             (x->>'unit_price')::numeric, (x->>'cost_price')::numeric
      from jsonb_array_elements(_new) x;
    update public.spares_sales set total = _total, cost_total = _costtot where id = _sale;
  end if;

  update public.spares_sales set
    customer_name = nullif(_customer, ''),
    payment_method = coalesce(nullif(_payment, ''), payment_method),
    created_at = coalesce(_sold_at, created_at),
    edited_at = now()
  where id = _sale;

  insert into public.spares_sale_audit(sale_id, action, before, after)
    values (_sale, 'edit', _before, public.spares_sale_snapshot(_sale));
end $$;

revoke execute on function public.spares_delete_sale(uuid, boolean), public.spares_update_sale(uuid, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.spares_delete_sale(uuid, boolean), public.spares_update_sale(uuid, text, text, jsonb, timestamptz) to authenticated;

notify pgrst, 'reload schema';
