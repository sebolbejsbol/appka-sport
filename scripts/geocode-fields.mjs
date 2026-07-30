/**
 * Reverse-geocoding boisk (Mapbox v6) -> public.field_geocode.
 * Zapisuje kraj (do usuwania nie-PL) oraz ulicę/numer/miasto (do nazw).
 * Wznawialny: pomija boiska już zapisane w field_geocode.
 *
 * Uruchom: node --use-system-ca scripts/geocode-fields.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const TOKEN = env.EXPO_PUBLIC_MAPBOX_TOKEN;
const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY);

const BATCH = 10; // równolegle
const PAUSE_MS = 1100; // przerwa między batchami (~9/s)

async function fetchAll(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

async function reverse(lng, lat) {
  const url = `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&language=pl&access_token=${TOKEN}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        continue;
      }
      if (!r.ok) return { error: `HTTP ${r.status}` };
      const j = await r.json();
      const f = j.features?.[0];
      if (!f) return { country: null, place: null, street: null, housenumber: null, full: null };
      const c = f.properties?.context ?? {};
      return {
        country: c.country?.country_code?.toUpperCase() ?? null,
        place: c.place?.name ?? c.locality?.name ?? c.region?.name ?? null,
        street: c.street?.name ?? null,
        housenumber: c.address?.address_number ?? null,
        full: f.properties?.full_address ?? null,
      };
    } catch (e) {
      if (attempt === 2) return { error: String(e).slice(0, 80) };
      await new Promise((res) => setTimeout(res, 1000));
    }
  }
  return { error: 'retries exhausted' };
}

async function main() {
  console.log('Pobieram listę boisk i już zgeokodowane...');
  const [coords, done] = await Promise.all([
    fetchAll('v_fields_coords', 'id,lng,lat'),
    fetchAll('field_geocode', 'field_id'),
  ]);
  const doneSet = new Set(done.map((d) => d.field_id));
  let todo = coords.filter((c) => !doneSet.has(c.id));
  const LIMIT = Number(process.env.GEOCODE_LIMIT || 0);
  if (LIMIT > 0) todo = todo.slice(0, LIMIT);
  console.log(`Wszystkich: ${coords.length}, zrobione: ${doneSet.size}, do zrobienia: ${todo.length}`);

  let okCount = 0;
  let errCount = 0;
  const t0 = Date.now();

  for (let i = 0; i < todo.length; i += BATCH) {
    const slice = todo.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (f) => {
        const res = await reverse(f.lng, f.lat);
        return { f, res };
      }),
    );

    const toInsert = [];
    for (const { f, res } of results) {
      if (res.error) {
        errCount++;
        continue;
      }
      toInsert.push({
        field_id: f.id,
        country: res.country,
        place: res.place,
        street: res.street,
        housenumber: res.housenumber,
        full_address: res.full,
      });
    }

    if (toInsert.length) {
      const { error } = await supabase.from('field_geocode').upsert(toInsert, { onConflict: 'field_id' });
      if (error) {
        console.error('upsert error:', error.message);
        errCount += toInsert.length;
      } else {
        okCount += toInsert.length;
      }
    }

    if (i % 500 === 0 || i + BATCH >= todo.length) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = okCount / Math.max(elapsed, 1);
      const remaining = todo.length - (i + slice.length);
      const eta = remaining / Math.max(rate, 0.1);
      console.log(
        `progress ${i + slice.length}/${todo.length} ok=${okCount} err=${errCount} ` +
          `rate=${rate.toFixed(1)}/s eta=${Math.round(eta / 60)}min`,
      );
    }

    await new Promise((res) => setTimeout(res, PAUSE_MS));
  }

  console.log(`GOTOWE. ok=${okCount} err=${errCount} czas=${Math.round((Date.now() - t0) / 60000)}min`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
