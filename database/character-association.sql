-- Juega con Jorgito: asociación obligatoria de cada publicación y propuesta a un personaje.
-- Ejecutar una sola vez en Supabase > SQL Editor, después de schema.sql y storage-gallery.sql.

alter table public.content_items add column if not exists character_name text;
alter table public.proposals add column if not exists character_name text;

-- Compatibilidad con contenido/propuestas anteriores: asigna Jorgito a los registros existentes.
-- Luego todas las filas quedan obligadas a tener un personaje.
update public.content_items set character_name = 'Jorgito' where character_name is null or btrim(character_name) = '';
update public.proposals set character_name = 'Jorgito' where character_name is null or btrim(character_name) = '';

alter table public.content_items alter column character_name set not null;
alter table public.proposals alter column character_name set not null;

alter table public.content_items drop constraint if exists content_items_character_name_check;
alter table public.content_items add constraint content_items_character_name_check
  check (character_name in ('Jorgito','El Fantasma','El GPS Humano','El Rey de la Excusa','El Competitivo','El de los Audios','Moncayo'));
alter table public.proposals drop constraint if exists proposals_character_name_check;
alter table public.proposals add constraint proposals_character_name_check
  check (character_name in ('Jorgito','El Fantasma','El GPS Humano','El Rey de la Excusa','El Competitivo','El de los Audios','Moncayo'));

create index if not exists content_items_character_name_idx on public.content_items(character_name, published, created_at desc);
create index if not exists proposals_character_name_idx on public.proposals(character_name, status, created_at desc);

-- La interfaz permite proponer imágenes y stickers; habilita esos tipos en propuestas.
alter table public.proposals drop constraint if exists proposals_kind_check;
alter table public.proposals add constraint proposals_kind_check
  check (kind in ('personaje','anecdota','frase','pregunta','reto','imagen','sticker'));
