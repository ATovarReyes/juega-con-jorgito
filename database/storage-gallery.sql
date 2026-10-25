-- MIGRACION PARA GALERIA DE MEMES Y STICKERS
-- Ejecutar en Supabase > SQL Editor después de database/schema.sql.
-- Permite los tipos imagen/sticker en content_items; el esquema inicial no los incluía.
alter table public.content_items drop constraint if exists content_items_kind_check;
alter table public.content_items
  add constraint content_items_kind_check
  check (kind in ('personaje','anecdota','frase','pregunta','reto','imagen','sticker'));

-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Crea el bucket público de imágenes y limita las cargas a la cuenta owner.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'jorgito-gallery',
  'jorgito-gallery',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Las imágenes publicadas deben poder verse sin iniciar sesión.
drop policy if exists "Gallery images are publicly readable" on storage.objects;
create policy "Gallery images are publicly readable"
on storage.objects for select
using (bucket_id = 'jorgito-gallery');

-- Solo la cuenta con role='owner' puede subir imágenes.
drop policy if exists "Only owner can upload gallery images" on storage.objects;
create policy "Only owner can upload gallery images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'jorgito-gallery'
  and exists (
    select 1 from public.profiles
    where profiles.id = (select auth.uid())
      and profiles.role = 'owner'
  )
);

-- Solo el propietario puede reemplazar o borrar archivos del bucket.
drop policy if exists "Only owner can update gallery images" on storage.objects;
create policy "Only owner can update gallery images"
on storage.objects for update to authenticated
using (
  bucket_id = 'jorgito-gallery'
  and exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'owner')
)
with check (
  bucket_id = 'jorgito-gallery'
  and exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'owner')
);

drop policy if exists "Only owner can delete gallery images" on storage.objects;
create policy "Only owner can delete gallery images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'jorgito-gallery'
  and exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.role = 'owner')
);
