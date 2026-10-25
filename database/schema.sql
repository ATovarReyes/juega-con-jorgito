-- Juega con Jorgito: esquema MVP para Supabase
-- Ejecuta todo este archivo en Supabase > SQL Editor.
-- Las políticas RLS son parte de la seguridad: no las desactives.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Jugador',
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

create table if not exists public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_key text not null,
  points integer not null check (points between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('personaje','anecdota','frase','pregunta','reto')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personaje','anecdota','frase','pregunta','reto')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 3000),
  created_by uuid not null references public.profiles(id),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists game_results_user_id_idx on public.game_results(user_id);
create index if not exists proposals_author_id_idx on public.proposals(author_id);
create index if not exists proposals_status_idx on public.proposals(status);

-- Crear automáticamente un perfil al aceptar/crear una cuenta en Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'jugador'), '@', 1)),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Función para comprobar el rol del propietario dentro de políticas RLS.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'owner'
  );
$$;

alter table public.profiles enable row level security;
alter table public.game_results enable row level security;
alter table public.proposals enable row level security;
alter table public.content_items enable row level security;

drop policy if exists "Profiles readable by authenticated members" on public.profiles;
create policy "Profiles readable by authenticated members" on public.profiles
for select to authenticated using (true);

drop policy if exists "Owner manages profiles" on public.profiles;
create policy "Owner manages profiles" on public.profiles
for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Members read all game results" on public.game_results;
create policy "Members read all game results" on public.game_results
for select to authenticated using (true);

drop policy if exists "Members insert own game results" on public.game_results;
create policy "Members insert own game results" on public.game_results
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "Owner deletes game results" on public.game_results;
create policy "Owner deletes game results" on public.game_results
for delete to authenticated using (public.is_owner());

drop policy if exists "Members read own proposals and owner reads all" on public.proposals;
create policy "Members read own proposals and owner reads all" on public.proposals
for select to authenticated using (author_id = (select auth.uid()) or public.is_owner());

drop policy if exists "Members submit own proposals" on public.proposals;
create policy "Members submit own proposals" on public.proposals
for insert to authenticated with check (author_id = (select auth.uid()) and status = 'pending');

drop policy if exists "Owner reviews proposals" on public.proposals;
create policy "Owner reviews proposals" on public.proposals
for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Members read published content and owner reads all" on public.content_items;
create policy "Members read published content and owner reads all" on public.content_items
for select to authenticated using (published = true or public.is_owner());

drop policy if exists "Owner creates content" on public.content_items;
create policy "Owner creates content" on public.content_items
for insert to authenticated with check (public.is_owner() and created_by = (select auth.uid()));

drop policy if exists "Owner updates content" on public.content_items;
create policy "Owner updates content" on public.content_items
for update to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Owner deletes content" on public.content_items;
create policy "Owner deletes content" on public.content_items
for delete to authenticated using (public.is_owner());

-- Ranking agregado. Los resultados individuales no exponen correo electrónico.
create or replace view public.leaderboard
with (security_invoker = true)
as
select
  p.id as user_id,
  p.display_name,
  coalesce(sum(gr.points), 0)::bigint as points
from public.profiles p
left join public.game_results gr on gr.user_id = p.id
group by p.id, p.display_name;

grant usage on schema public to authenticated;
grant select on public.profiles, public.game_results, public.proposals, public.content_items, public.leaderboard to authenticated;
grant insert on public.game_results, public.proposals, public.content_items to authenticated;
grant update on public.profiles, public.proposals, public.content_items to authenticated;
grant delete on public.game_results, public.content_items to authenticated;

-- PASO MANUAL: después de invitar al propietario y de que se cree su perfil,
-- sustituye UUID_DEL_PROPIETARIO por el UUID del usuario de Authentication > Users:
-- update public.profiles set role = 'owner', display_name = 'Jorgito'
-- where id = 'UUID_DEL_PROPIETARIO';
--
-- NOTA DE SEGURIDAD: el botón de puntos del MVP es demostrativo y manipulable
-- desde el navegador. Antes de usarlo como ranking competitivo real, mover el
-- cálculo y validación de puntuaciones a una Edge Function/RPC que valide cada
-- partida; no confiar en puntos enviados directamente por el cliente.
