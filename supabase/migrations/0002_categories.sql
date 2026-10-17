-- Adds part categories (the same 12 used in Vaultis) and assigns them to your parts.
-- Safe to re-run. Only parts without a category are changed, so your manual edits are kept.
alter table public.spares_items add column if not exists category text;
create index if not exists spares_items_category_idx on public.spares_items(category);

update public.spares_items set category = case
    when name ilike '%bearing%' then 'Bearings'
    when name ilike '%tube%' or name ilike '%tyre%' then 'Tyres & Tubes'
    when name ilike '%gasket%' or name ilike '%oil seal%' then 'Gaskets & Seals'
    when name ilike '%carburetor%' then 'Pistons & Engine'
    when name ilike '%cable%' or name ilike '%excelleta%' then 'Cables'
    when name ilike '%brake%' or name ilike '%linings%' or name ilike '%master cylinder%' then 'Brakes'
    when name ilike '%clutch%' then 'Clutch & Gearbox'
    when name ilike '%mirror%' or name ilike '%guard%' or name ilike '%chain box%' or name ilike '%side cover%' or name ilike '%foot rest%' or name ilike '%stend%' or name ilike '%gad guard%' then 'Body, Guards & Mirrors'
    when name ilike '%sprocket%' or name ilike '%chain%' then 'Sprockets & Chains'
    when name ilike '%gear%' then 'Clutch & Gearbox'
    when name ilike '%shockups%' or name ilike '%steering%' or name ilike '%king tope%' or name ilike '%bullet%' then 'Suspension & Steering'
    when name ilike '%indicator%' or name ilike '%taa%' or name ilike '%bulb%' or name ilike '%horn%' or name ilike '%flasher%' or name ilike '%switch%' or name ilike '%koil%' or name ilike '%wiring%' or name ilike '%plug%' or name ilike '%sdi%' or name ilike '%battery%' or name ilike '%dimmer%' or name ilike '%solenoid%' or name ilike '%self starter%' or name ilike '%magnet%' or name ilike '%dashboard%' then 'Electrical & Lighting'
    when name ilike '%piston%' or name ilike '%valve%' or name ilike '%block%' or name ilike '%connecting rod%' or name ilike '%crank%' or name ilike '%kick%' or name ilike '%kiki%' then 'Pistons & Engine'
    else 'Other Spares'
  end
where category is null;

select category, count(*) from public.spares_items group by category order by category;

notify pgrst, 'reload schema';
