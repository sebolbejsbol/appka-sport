// Generuje jednorazową parę kluczy VAPID (Web Push) + losowy sekret do
// autoryzacji wywołań Postgres -> Supabase Edge Function. Uruchom raz przy
// zakładaniu Web Pusha; wygenerowane wartości wklej ręcznie do .env
// (EXPO_PUBLIC_VAPID_PUBLIC_KEY) oraz do sekretów Supabase (patrz README w
// supabase/functions/send-web-push/). Nic stąd nie trafia automatycznie do
// żadnego zdalnego systemu — to tylko generator.
import crypto from 'node:crypto';

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
});

const pubJwk = publicKey.export({ format: 'jwk' });
const x = Buffer.from(pubJwk.x, 'base64url');
const y = Buffer.from(pubJwk.y, 'base64url');
const rawPub = Buffer.concat([Buffer.from([0x04]), x, y]);

const privJwk = privateKey.export({ format: 'jwk' });
const rawPriv = Buffer.from(privJwk.d, 'base64url');

console.log('VAPID_PUBLIC_KEY=' + b64url(rawPub));
console.log('VAPID_PRIVATE_KEY=' + b64url(rawPriv));
console.log('NOTIFY_SHARED_SECRET=' + b64url(crypto.randomBytes(32)));
