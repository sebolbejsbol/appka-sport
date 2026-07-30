// Granice województw → PostGIS + przypisanie boisk + RPC liczący boiska per sport.
//
// Użycie:
//   node --use-system-ca scripts/osm-poland/voivodeship-boundaries.mjs
//
// Co robi:
//   1. Pobiera uproszczony GeoJSON granic województw (16 wielokątów).
//   2. Tworzy tabelę public.voivodeship_boundaries + indeks GiST.
//   3. Wstawia 16 granic.
//   4. Dodaje fields.voivodeship i przypisuje boiska (point-in-polygon).
//   5. Tworzy RPC public.voivodeship_field_counts(sport_filter) — liczba boisk per
//      województwo z uwzględnieniem filtra sportu (null = wszystkie).
//   Zapisuje też migrację supabase/migrations/0053_voivodeship_boundaries.sql.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMcpClient } from '../basketball-upload/lib/mcp-http.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GEOJSON_URL =
  'https://raw.githubusercontent.com/ppatrzyk/polska-geojson/master/wojewodztwa/wojewodztwa-medium.geojson';
const OUT = 'supabase/migrations/0053_voivodeship_boundaries.sql';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gjkbnkaijlempveotnui';

function abs(rel) {
  return join(ROOT, rel);
}

function loadEnv() {
  const envPath = abs('.env');
  if (!existsSync(envPath)) return;
  let content = readFileSync(envPath, 'utf8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

const DDL_TABLE = `create table if not exists public.voivodeship_boundaries (
  voivodeship text primary key,
  geom geometry(Geometry, 4326) not null
);
create index if not exists voivodeship_boundaries_gix on public.voivodeship_boundaries using gist (geom);`;

const DDL_RPC = `create or replace function public.voivodeship_field_counts(sport_filter text default null)
returns table (voivodeship text, court_count bigint, lng double precision, lat double precision)
language sql
stable
as $$
  select
    v.voivodeship,
    count(f.id) as court_count,
    v.lng,
    v.lat
  from public.voivodeship_stats v
  left join public.fields f
    on f.voivodeship = v.voivodeship
   and f.status = 'approved'
   and public.field_matches_sport_filter(f.sport, sport_filter)
  group by v.voivodeship, v.lng, v.lat;
$$;

grant execute on function public.voivodeship_field_counts(text) to authenticated;`;

const DDL_FIELDS = `alter table public.fields add column if not exists voivodeship text;
create index if not exists fields_voivodeship_idx on public.fields (voivodeship);`;

// Uproszczone wielokąty bywają niepoprawne (samoprzecięcia) → naprawa, inaczej st_contains zawodzi.
const MAKEVALID_SQL = `update public.voivodeship_boundaries set geom = st_makevalid(geom) where not st_isvalid(geom);`;

const RESET_SQL = `update public.fields set voivodeship = null where voivodeship is not null;`;

function backfillSql() {
  return `update public.fields f
set voivodeship = b.voivodeship
from public.voivodeship_boundaries b
where f.voivodeship is null
  and st_contains(b.geom, f.geom::geometry);`;
}

// Punkty tuż poza uproszczonym wielokątem (np. nadmorskie) → najbliższe województwo,
// ale tylko bardzo blisko (~1 km), żeby NIE łapać zagranicznych boisk przy granicy.
function nearestFallbackSql() {
  return `update public.fields f
set voivodeship = sub.voivodeship
from (
  select f2.id, n.voivodeship
  from public.fields f2
  cross join lateral (
    select b.voivodeship, b.geom <-> f2.geom::geometry as dist
    from public.voivodeship_boundaries b
    order by b.geom <-> f2.geom::geometry
    limit 1
  ) n
  where f2.status = 'approved' and f2.voivodeship is null and n.dist < 0.01
) sub
where f.id = sub.id;`;
}

function insertBoundarySql(name, geometry) {
  const geo = JSON.stringify(geometry);
  return `insert into public.voivodeship_boundaries (voivodeship, geom) values (${sqlStr(name)}, st_setsrid(st_geomfromgeojson(${sqlStr(geo)}), 4326))
on conflict (voivodeship) do update set geom = excluded.geom;`;
}

async function main() {
  loadEnv();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Brak SUPABASE_ACCESS_TOKEN w .env');

  console.log('Pobieram granice województw…');
  const res = await fetch(GEOJSON_URL, { headers: { 'User-Agent': 'dudieday/1.0' } });
  if (!res.ok) throw new Error(`GeoJSON HTTP ${res.status}`);
  const gj = JSON.parse(await res.text());
  const features = (gj.features || []).filter((f) => f.properties?.nazwa && f.geometry);
  console.log(`Województw: ${features.length}`);
  if (features.length !== 16) console.warn('Uwaga: spodziewano się 16 województw.');

  const insertStatements = features.map((f) =>
    insertBoundarySql(String(f.properties.nazwa).trim().toLowerCase(), f.geometry),
  );

  // Zapis migracji do repo (odtwarzalność).
  const migration = [
    '-- 0053 — granice województw + przypisanie boisk + RPC liczący per sport.',
    '-- WYGENEROWANE: scripts/osm-poland/voivodeship-boundaries.mjs',
    '',
    DDL_TABLE,
    '',
    insertStatements.join('\n'),
    '',
    MAKEVALID_SQL,
    '',
    DDL_FIELDS,
    '',
    RESET_SQL,
    backfillSql(),
    '',
    nearestFallbackSql(),
    '',
    DDL_RPC,
    '',
    "notify pgrst, 'reload schema';",
    '',
  ].join('\n');
  mkdirSync(dirname(abs(OUT)), { recursive: true });
  writeFileSync(abs(OUT), migration, 'utf8');
  console.log(`Zapisano migrację: ${OUT}`);

  const url = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}&features=database`;
  const mcp = await createMcpClient({ url, token });

  console.log('Tworzę tabelę granic…');
  await mcp.callTool('execute_sql', { query: DDL_TABLE });

  for (let i = 0; i < insertStatements.length; i++) {
    await mcp.callTool('execute_sql', { query: insertStatements[i] });
    console.log(`  granica ${i + 1}/${insertStatements.length}`);
  }

  console.log('Naprawiam geometrie granic (st_makevalid)…');
  await mcp.callTool('execute_sql', { query: MAKEVALID_SQL });

  console.log('Dodaję kolumnę fields.voivodeship…');
  await mcp.callTool('execute_sql', { query: DDL_FIELDS });

  console.log('Resetuję poprzednie przypisania…');
  await mcp.callTool('execute_sql', { query: RESET_SQL });

  console.log('Przypisuję boiska do województw (point-in-polygon)…');
  await mcp.callTool('execute_sql', { query: backfillSql() });

  console.log('Przypisuję punkty graniczne do najbliższego województwa…');
  await mcp.callTool('execute_sql', { query: nearestFallbackSql() });

  console.log('Tworzę RPC voivodeship_field_counts…');
  await mcp.callTool('execute_sql', { query: DDL_RPC });
  await mcp.callTool('execute_sql', { query: "notify pgrst, 'reload schema';" });

  console.log('Gotowe.');
}

main().catch((e) => {
  console.error('Błąd:', e.message || e);
  process.exit(1);
});
