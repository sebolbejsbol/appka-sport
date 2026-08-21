-- ═══════════════════════════════════════════════════════════════════════════
-- 0103 — XP tylko za faktycznie rozegrany event (zameldowanie + zakończenie)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- get_leaderboard/get_player_rank liczyły "events_played" jako liczbę
-- event_participants wierszy dla eventów, których starts_at już minął —
-- czyli grało się dostawało za sam zapis na event, nawet bez zameldowania
-- i bez względu na to, czy event w ogóle został zakończony (status wciąż
-- 'planned', dopóki ktoś nie wywoła finish_event). Do tego osobno doliczało
-- się +25 za każde zameldowanie (bez sprawdzania, czy event się zakończył),
-- więc typowy grany event dawał 50+25=75 XP z dwóch nakładających się źródeł.
--
-- Teraz jedno, jasne źródło: "rozegrany event" = zameldowanie NA evencie,
-- KTÓRY MA status = 'finished'. Spóźnienie nadal obniża nagrodę (ale nie
-- zeruje jej), zamiast być osobnym, niezależnym odjęciem.

create or replace function public.get_leaderboard(p_limit integer default 100)
returns table (
  user_id uuid, nick text, avatar_url text, city text, country_code text,
  events_played bigint, events_created bigint, check_ins bigint, late_check_ins bigint,
  xp integer, rank bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select
      p.id as user_id, p.nick, p.avatar_url, p.city, p.country_code,
      coalesce(pl.cnt, 0) as events_played,
      coalesce(cr.cnt, 0) as events_created,
      coalesce(ontime.cnt, 0) as check_ins,
      coalesce(late.cnt, 0) as late_check_ins
    from public.profiles p
    left join (
      select ci.user_id, count(*) as cnt
      from public.event_check_ins ci
      join public.events e on e.id = ci.event_id
      where e.status = 'finished'
      group by ci.user_id
    ) pl on pl.user_id = p.id
    left join (
      select creator_id as user_id, count(*) as cnt
      from public.events where starts_at < now() group by creator_id
    ) cr on cr.user_id = p.id
    left join (
      select ci.user_id, count(*) as cnt
      from public.event_check_ins ci
      join public.events e on e.id = ci.event_id
      where e.status = 'finished' and coalesce(ci.is_late, false) = false
      group by ci.user_id
    ) ontime on ontime.user_id = p.id
    left join (
      select ci.user_id, count(*) as cnt
      from public.event_check_ins ci
      join public.events e on e.id = ci.event_id
      where e.status = 'finished' and coalesce(ci.is_late, false) = true
      group by ci.user_id
    ) late on late.user_id = p.id
  ), scored as (
    select s.*, greatest(0, (s.events_played * 50 - s.late_check_ins * 15))::int as xp
    from stats s
  )
  select
    user_id, nick, avatar_url, city, country_code,
    events_played, events_created, check_ins, late_check_ins, xp,
    rank() over (order by xp desc, events_played desc, nick asc) as rank
  from scored
  order by xp desc, events_played desc, nick asc
  limit greatest(1, least(p_limit, 500));
$$;

create or replace function public.get_player_rank(p_user uuid)
returns table (
  user_id uuid, xp integer, rank bigint, total bigint,
  events_played bigint, events_created bigint, check_ins bigint, late_check_ins bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select
      p.id as user_id, p.nick,
      coalesce(pl.cnt, 0) as events_played,
      coalesce(cr.cnt, 0) as events_created,
      coalesce(ontime.cnt, 0) as check_ins,
      coalesce(late.cnt, 0) as late_check_ins
    from public.profiles p
    left join (
      select ci.user_id, count(*) as cnt
      from public.event_check_ins ci
      join public.events e on e.id = ci.event_id
      where e.status = 'finished'
      group by ci.user_id
    ) pl on pl.user_id = p.id
    left join (
      select creator_id as user_id, count(*) as cnt
      from public.events where starts_at < now() group by creator_id
    ) cr on cr.user_id = p.id
    left join (
      select ci.user_id, count(*) as cnt
      from public.event_check_ins ci
      join public.events e on e.id = ci.event_id
      where e.status = 'finished' and coalesce(ci.is_late, false) = false
      group by ci.user_id
    ) ontime on ontime.user_id = p.id
    left join (
      select ci.user_id, count(*) as cnt
      from public.event_check_ins ci
      join public.events e on e.id = ci.event_id
      where e.status = 'finished' and coalesce(ci.is_late, false) = true
      group by ci.user_id
    ) late on late.user_id = p.id
  ), scored as (
    select s.*, greatest(0, (s.events_played * 50 - s.late_check_ins * 15))::int as xp
    from stats s
  ), ranked as (
    select sc.*, rank() over (order by xp desc, events_played desc, nick asc) as rnk, count(*) over () as tot
    from scored sc
  )
  select user_id, xp, rnk, tot, events_played, events_created, check_ins, late_check_ins
  from ranked where user_id = p_user;
$$;

notify pgrst, 'reload schema';
