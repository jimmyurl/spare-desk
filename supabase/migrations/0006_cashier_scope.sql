-- Spares Desk: cashiers can only make sales and see their OWN sales.
-- They no longer read the stock, sales or sale-line tables directly (those hold buying prices
-- and other people's sales). They get safe views instead. Safe to re-run.

-- 1) Base tables: admins only -------------------------------------------------------
drop policy if exists "spares staff read items" on public.spares_items;
drop policy if exists "spares admin read items" on public.spares_items;
create policy "spares admin read items" on public.spares_items for select to authenticated
  using (public.is_spares_admin());

drop policy if exists "spares read sales" on public.spares_sales;
create policy "spares read sales" on public.spares_sales for select to authenticated
  using (public.is_spares_admin());

drop policy if exists "spares read sale items" on public.spares_sale_items;
create policy "spares read sale items" on public.spares_sale_items for select to authenticated
  using (public.is_spares_admin());

-- 2) Views for the point of sale (no buying prices, only the caller's own sales) --------
-- Views run with the owner's rights, so each one filters by the signed-in user itself.
create or replace view public.spares_items_for_sale with (security_barrier = true) as
  select id, name, sku, category, location, quantity, unit_price
  from public.spares_items
  where public.is_spares_staff();

create or replace view public.spares_my_sales with (security_barrier = true) as
  select id, created_at, customer_name, payment_method, total
  from public.spares_sales
  where created_by = auth.uid() and public.is_spares_staff();

create or replace view public.spares_my_sale_items with (security_barrier = true) as
  select i.id, i.sale_id, i.item_id, i.item_name, i.quantity, i.unit_price
  from public.spares_sale_items i
  join public.spares_sales s on s.id = i.sale_id
  where s.created_by = auth.uid() and public.is_spares_staff();

revoke all on public.spares_items_for_sale, public.spares_my_sales, public.spares_my_sale_items from public, anon;
grant select on public.spares_items_for_sale, public.spares_my_sales, public.spares_my_sale_items to authenticated;
grant select on public.spares_items_for_sale, public.spares_my_sales, public.spares_my_sale_items to service_role;

notify pgrst, 'reload schema';
