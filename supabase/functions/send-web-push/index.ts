// Wysyła pojedyncze powiadomienie Web Push (VAPID) do jednej subskrypcji
// przeglądarki. Jedyny wywołujący to public.send_web_push() w Postgresie
// (przez pg_net), autoryzowany współdzielonym sekretem w nagłówku
// x-notify-secret — bez tego ta funkcja byłaby otwartym relayem do
// dowolnego adresu subskrypcji push (VAPID identyfikuje NADAWCĘ, nie
// autoryzuje dostępu do konkretnej subskrypcji).
//
// Sekrety wymagane (supabase secrets set ...), patrz README.md w tym
// katalogu: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
// NOTIFY_SHARED_SECRET.

import webpush from 'npm:web-push@3.6.7';

type Payload = {
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:kontakt@dudieday.pl';
const NOTIFY_SHARED_SECRET = Deno.env.get('NOTIFY_SHARED_SECRET') ?? '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method_not_allowed', { status: 405 });
  }

  if (!NOTIFY_SHARED_SECRET || req.headers.get('x-notify-secret') !== NOTIFY_SHARED_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response('vapid_not_configured', { status: 500 });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid_json', { status: 400 });
  }

  const { subscription, title, body, data } = payload ?? {};
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return new Response('invalid_subscription', { status: 400 });
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({ title, body, data: data ?? {} }),
    );
    return new Response('ok', { status: 200 });
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    // 404/410 = subskrypcja martwa (odinstalowane rozszerzenie, wygasła,
    // użytkownik cofnął zgodę) — zwracamy status żeby wywołujący mógł
    // (opcjonalnie) posprzątać, ale to nie jest błąd naszej strony.
    if (statusCode === 404 || statusCode === 410) {
      return new Response('gone', { status: 410 });
    }
    console.error('send-web-push error', err);
    return new Response('send_failed', { status: 502 });
  }
});
