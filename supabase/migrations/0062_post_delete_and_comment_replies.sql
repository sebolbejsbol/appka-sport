-- ═══════════════════════════════════════════════════════════════════════════
-- 0062 — Usuwanie postów + odpowiedzi na komentarze (wątki 1 poziom)
-- Kategoria: Społeczność  |  Typ: BASE  |  Wymaga: 0036
-- Plik: supabase/migrations/0062_post_delete_and_comment_replies.sql
-- SQL Editor: 0062 — posty · usuwanie + odpowiedzi na komentarze
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Usuwanie posta przez autora (kaskada usuwa lajki/komentarze/media) ──────

create or replace function public.delete_post(p_post_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted int;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;

  delete from public.posts
  where id = p_post_id and author_id = v_uid;

  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    return 'deleted';
  end if;

  return 'forbidden';
end;
$$;

grant execute on function public.delete_post(uuid) to authenticated;

-- ─── Odpowiedzi na komentarze: kolumna parent_id ────────────────────────────

alter table public.post_comments
  add column if not exists parent_id uuid
  references public.post_comments (id) on delete cascade;

create index if not exists post_comments_parent_idx
  on public.post_comments (parent_id);

-- ─── create_post_comment z obsługą odpowiedzi ───────────────────────────────

drop function if exists public.create_post_comment(uuid, text);

create or replace function public.create_post_comment(
  p_post_id uuid,
  p_body text,
  p_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_id uuid;
  v_author uuid;
  v_parent_author uuid;
  v_parent_post uuid;
  v_parent_top uuid;
  v_effective_parent uuid;
  v_nick text;
  v_token text;
  v_preview text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_view_post(p_post_id, v_uid) then
    raise exception 'forbidden';
  end if;

  v_body := trim(coalesce(p_body, ''));
  if char_length(v_body) < 1 or char_length(v_body) > 500 then
    raise exception 'invalid_body';
  end if;

  select po.author_id into v_author from public.posts po where po.id = p_post_id;
  if not found then
    raise exception 'not_found';
  end if;

  -- Walidacja komentarza nadrzędnego. Trzymamy jeden poziom zagłębienia:
  -- odpowiedź na odpowiedź trafia pod ten sam komentarz najwyższego poziomu.
  v_effective_parent := null;
  if p_parent_id is not null then
    select pc.post_id, pc.author_id, coalesce(pc.parent_id, pc.id)
      into v_parent_post, v_parent_author, v_parent_top
    from public.post_comments pc
    where pc.id = p_parent_id;

    if not found or v_parent_post <> p_post_id then
      raise exception 'invalid_parent';
    end if;

    v_effective_parent := v_parent_top;
  end if;

  insert into public.post_comments (post_id, author_id, body, parent_id)
  values (p_post_id, v_uid, v_body, v_effective_parent)
  returning id into v_id;

  v_preview := v_body;
  if char_length(v_preview) > 80 then
    v_preview := left(v_preview, 77) || '…';
  end if;

  -- Powiadomienie dla autora posta
  if v_author <> v_uid then
    select commenter.nick, author.expo_push_token into v_nick, v_token
    from public.profiles commenter
    join public.profiles author on author.id = v_author
    where commenter.id = v_uid;

    perform public.send_expo_push(
      v_token,
      coalesce(nullif(trim(v_nick), ''), 'Gracz') || ' skomentował Twój post',
      v_preview,
      jsonb_build_object('type', 'post_comment', 'post_id', p_post_id::text)
    );
  end if;

  -- Powiadomienie dla autora komentarza, na który odpowiadamy
  if p_parent_id is not null
     and v_parent_author is not null
     and v_parent_author <> v_uid
     and v_parent_author <> v_author then
    select replier.nick, parent_author.expo_push_token into v_nick, v_token
    from public.profiles replier
    join public.profiles parent_author on parent_author.id = v_parent_author
    where replier.id = v_uid;

    perform public.send_expo_push(
      v_token,
      coalesce(nullif(trim(v_nick), ''), 'Gracz') || ' odpowiedział na Twój komentarz',
      v_preview,
      jsonb_build_object('type', 'post_comment', 'post_id', p_post_id::text)
    );
  end if;

  return v_id;
end;
$$;

grant execute on function public.create_post_comment(uuid, text, uuid) to authenticated;

-- ─── list_post_comments zwraca parent_id ────────────────────────────────────

drop function if exists public.list_post_comments(uuid, integer, timestamptz);

create or replace function public.list_post_comments(
  p_post_id uuid,
  p_limit integer default 50,
  p_before timestamptz default null
)
returns table (
  comment_id uuid,
  parent_id uuid,
  author_id uuid,
  author_nick text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id as comment_id,
    pc.parent_id,
    pc.author_id,
    p.nick as author_nick,
    p.avatar_url as author_avatar_url,
    pc.body,
    pc.created_at,
    (pc.author_id = auth.uid()) as is_mine
  from public.post_comments pc
  join public.profiles p on p.id = pc.author_id
  where public.can_view_post(p_post_id, auth.uid())
    and pc.post_id = p_post_id
    and (p_before is null or pc.created_at < p_before)
  order by pc.created_at asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

grant execute on function public.list_post_comments(uuid, integer, timestamptz) to authenticated;

notify pgrst, 'reload schema';
