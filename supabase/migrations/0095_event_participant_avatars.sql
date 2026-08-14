-- Dodaje avatar_url do listy uczestników/listy rezerwowej zwracanej przez
-- event_detail() — potrzebne, żeby lista uczestników na ekranie eventu
-- mogła pokazać awatary (tak jak ranking/social), zamiast samego nicku.

create or replace function public.event_detail(p_event_id uuid)
returns json
language sql
stable
security definer
set search_path to 'public'
as $function$
  with bounds as (
    select
      e.id as event_id,
      e.starts_at + (e.duration_min || ' minutes')::interval as ends_at,
      b.opens_at,
      b.closes_at
    from public.events e
    cross join lateral public.event_check_in_bounds(e.starts_at, e.duration_min) b
    where e.id = p_event_id
  )
  select json_build_object(
    'id', e.id,
    'field_id', e.field_id,
    'field_name', f.name,
    'field_lng', st_x(f.geom::geometry),
    'field_lat', st_y(f.geom::geometry),
    'category', e.category,
    'subcategory', e.subcategory,
    'lat', coalesce(e.lat, st_y(f.geom::geometry)),
    'lng', coalesce(e.lng, st_x(f.geom::geometry)),
    'location_name', coalesce(e.location_name, f.name),
    'description_long', e.description_long,
    'image_url', e.image_url,
    'image_urls', e.image_urls,
    'organizer_name', e.organizer_name,
    'organizer_contact', e.organizer_contact,
    'organizer_url', e.organizer_url,
    'price_cents', e.price_cents,
    'title', e.title,
    'notes', e.notes,
    'starts_at', e.starts_at,
    'duration_min', e.duration_min,
    'ends_at', bd.ends_at,
    'is_past_scheduled_end', (e.status = 'planned' and now() > bd.ends_at),
    'max_players', e.max_players,
    'status', e.status,
    'sport', e.sport,
    'skill_level', coalesce(e.skill_level, 'any'),
    'event_type', coalesce(e.event_type, 'match'),
    'payment_status', coalesce(e.payment_status, 'free'),
    'visibility', coalesce(e.visibility, 'public'),
    'creator_id', e.creator_id,
    'creator_nick', cp.nick,
    'participant_count', (
      select count(*) from public.event_participants ep where ep.event_id = e.id
    ),
    'waitlist_count', (
      select count(*) from public.event_waitlist w where w.event_id = e.id
    ),
    'is_joined', exists(
      select 1 from public.event_participants ep2
      where ep2.event_id = e.id and ep2.user_id = auth.uid()
    ),
    'is_waitlisted', exists(
      select 1 from public.event_waitlist w2
      where w2.event_id = e.id and w2.user_id = auth.uid()
    ),
    'has_blocked_co_player', public.event_has_my_blocked_co_player(e.id, auth.uid()),
    'blocked_co_players', public.event_my_blocked_co_players(e.id, auth.uid()),
    'can_manage', (e.creator_id = auth.uid() or public.is_app_admin()),
    'is_admin_view', public.is_app_admin(),
    'check_in_opens_at', bd.opens_at,
    'check_in_closes_at', bd.closes_at,
    'check_in_window', case
      when e.status <> 'planned' then 'closed'
      when now() < bd.opens_at then 'not_yet'
      when now() > bd.closes_at then 'closed'
      else 'open'
    end,
    'my_check_in', (
      select json_build_object(
        'checked_in_at', ci.checked_in_at,
        'method', ci.method,
        'is_late', ci.is_late
      )
      from public.event_check_ins ci
      where ci.event_id = e.id and ci.user_id = auth.uid()
    ),
    'can_rate_field', public.user_can_rate_event_field(e.id),
    'my_field_rating', (
      select json_build_object(
        'surface_score', fr.surface_score,
        'lighting_score', fr.lighting_score,
        'cleanliness_score', fr.cleanliness_score,
        'accessibility_score', fr.accessibility_score,
        'safety_score', fr.safety_score,
        'comment', fr.comment
      )
      from public.field_ratings fr
      where fr.event_id = e.id and fr.user_id = auth.uid()
    ),
    'participants', coalesce((
      select json_agg(
        json_build_object(
          'user_id', ep.user_id,
          'nick', pp.nick,
          'avatar_url', pp.avatar_url,
          'joined_at', ep.joined_at,
          'checked_in_at', ci.checked_in_at,
          'check_in_method', ci.method,
          'is_late', ci.is_late,
          'is_blocked_by_me', public.i_blocked_user(auth.uid(), ep.user_id)
        )
        order by ep.joined_at asc
      )
      from public.event_participants ep
      left join public.profiles pp on pp.id = ep.user_id
      left join public.event_check_ins ci
        on ci.event_id = ep.event_id and ci.user_id = ep.user_id
      where ep.event_id = e.id
    ), '[]'::json),
    'waitlist', case
      when e.creator_id = auth.uid() or public.is_app_admin() then coalesce((
        select json_agg(
          json_build_object(
            'user_id', w.user_id,
            'nick', wp.nick,
            'avatar_url', wp.avatar_url,
            'joined_at', w.joined_at,
            'is_blocked_by_me', public.i_blocked_user(auth.uid(), w.user_id)
          )
          order by w.joined_at asc
        )
        from public.event_waitlist w
        left join public.profiles wp on wp.id = w.user_id
        where w.event_id = e.id
      ), '[]'::json)
      else '[]'::json
    end
  )
  from public.events e
  left join public.fields f on f.id = e.field_id
  left join public.profiles cp on cp.id = e.creator_id
  left join bounds bd on bd.event_id = e.id
  where e.id = p_event_id
    and public.can_view_event(e.id, auth.uid());
$function$;
