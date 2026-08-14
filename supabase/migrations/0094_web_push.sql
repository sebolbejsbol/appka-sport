-- ETAP 3: Web Push (VAPID) — realne powiadomienia w przeglądarce/PWA,
-- dotąd całkowicie nieistniejące (patrz NOTIFICATIONS_AUDIT.md sekcja 2).
-- Wysyłkę robi nowa Supabase Edge Function `send-web-push`
-- (supabase/functions/send-web-push/) wywoływana z Postgresa przez
-- pg_net — sam Postgres nie potrafi zrobić szyfrowania ECDH/AES-GCM
-- wymaganego przez Web Push, więc to jedyne poprawne miejsce na tę logikę.
--
-- WYMAGA ręcznej konfiguracji po zaaplikowaniu tej migracji (patrz
-- supabase/functions/send-web-push/README.md):
--   alter database postgres set app.settings.notify_shared_secret = '<wartość z generate-vapid-keys.mjs>';
-- Bez tego send_web_push() cicho nic nie wyśle (fail-safe, nie fail-loud).

alter table public.push_tokens add column if not exists p256dh text;
alter table public.push_tokens add column if not exists auth_key text;
-- Dla platform='web': token = subscription.endpoint (naturalny unikalny
-- klucz per przeglądarka/urządzenie), p256dh/auth_key = klucze szyfrujące
-- z PushSubscription. Dla ios/android: bez zmian, token = Expo push token.

create or replace function public.send_web_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text := current_setting('app.settings.notify_shared_secret', true);
begin
  if p_endpoint is null or trim(p_endpoint) = '' then
    return;
  end if;
  if v_secret is null or v_secret = '' then
    -- sekret nieskonfigurowany jeszcze na tym środowisku — pomiń cicho,
    -- tak samo jak send_expo_push robi to dla brakującego pg_net.
    return;
  end if;

  perform net.http_post(
    url := 'https://gjkbnkaijlempveotnui.supabase.co/functions/v1/send-web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    ),
    body := jsonb_build_object(
      'subscription', jsonb_build_object(
        'endpoint', p_endpoint,
        'keys', jsonb_build_object('p256dh', p_p256dh, 'auth', p_auth)
      ),
      'title', p_title,
      'body', p_body,
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
exception
  when undefined_function then
    null;
end;
$$;

create or replace function public.save_web_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_endpoint is null or trim(p_endpoint) = '' then
    raise exception 'invalid_endpoint';
  end if;

  insert into public.push_tokens (user_id, token, platform, p256dh, auth_key, updated_at)
  values (auth.uid(), trim(p_endpoint), 'web', p_p256dh, p_auth, now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        updated_at = now();
end;
$$;

create or replace function public.remove_web_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  delete from public.push_tokens where token = p_endpoint and user_id = auth.uid() and platform = 'web';
end;
$$;

grant execute on function public.save_web_push_subscription(text, text, text) to authenticated;
grant execute on function public.remove_web_push_subscription(text) to authenticated;

-- notify_user: rozgałęzia per-token na web (szyfrowany Web Push przez Edge
-- Function) vs natywne (Expo Push) zamiast wołać tylko send_expo_push.
create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  v_sent boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb));

  for r in select token, platform, p256dh, auth_key from public.push_tokens where user_id = p_user_id loop
    if r.platform = 'web' and r.p256dh is not null and r.auth_key is not null then
      perform public.send_web_push(r.token, r.p256dh, r.auth_key, p_title, p_body, p_data);
    else
      perform public.send_expo_push(r.token, p_title, p_body, p_data);
    end if;
    v_sent := true;
  end loop;

  if not v_sent then
    perform public.send_expo_push(
      (select expo_push_token from public.profiles where id = p_user_id),
      p_title, p_body, p_data
    );
  end if;
end;
$$;
