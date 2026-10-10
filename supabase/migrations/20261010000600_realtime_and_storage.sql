-- =============================================================================
-- Campus Table — Realtime and Storage
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Realtime: only the orders table is published. Postgres Changes respects RLS,
-- so students receive events for their own orders only and staff receive all
-- orders. Clients treat events purely as "something changed" signals and
-- re-fetch the authoritative state.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Storage: public bucket for menu photography. Only admins can upload, replace
-- or delete. Size and type limits are enforced by Storage itself. No order or
-- customer data is ever stored in a bucket.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "menu-images: admins read"
  on storage.objects for select to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()));

create policy "menu-images: admins upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and (select public.is_admin())
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

create policy "menu-images: admins update"
  on storage.objects for update to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()))
  with check (bucket_id = 'menu-images' and (select public.is_admin()));

create policy "menu-images: admins delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'menu-images' and (select public.is_admin()));
