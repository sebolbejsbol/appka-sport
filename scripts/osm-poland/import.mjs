// Import boisk koszykówki z OSM dla całej Polski (kafelki Overpass).
//
// Użycie:
//   node scripts/import-osm-fields-poland.mjs
//   node scripts/import-osm-fields-poland.mjs --enrich          # + adresy Mapbox (wolne)
//   node scripts/import-osm-fields-poland.mjs --tiles=6x8      # siatka kafelków
//
// Wymaga: .env z EXPO_PUBLIC_MAPBOX_TOKEN przy --enrich

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_DELAY_MS = 2500;
const MAPBOX_DELAY_MS = 110;
const DEFAULT_COURT = 'Boisko do koszykówki';

/** Granice Polski (z marginesem). */
export const POLAND_BBOX = { south: 49.0, west: 14.12, north: 54.84, east: 24.15 };

const OUT = 'supabase/migrations/0049_osm_basketball_poland.sql';
const CACHE = 'scripts/.cache/poland-basketball-osm.json';

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
  const tilesArg = argv.find((a) => a.startsWith('--tiles='))?.split('=')[1] ?? '8x10';
  const [rows, cols] = tilesArg.split('x').map((n) => Number(n));
  return {
    enrich: flags.has('--enrich'),
    rows: Number.isFinite(rows) ? rows : 8,
    cols: Number.isFinite(cols) ? cols : 10,
    useCache: !flags.has('--no-cache'),
    out: argv.find((a) => a.startsWith('--out='))?.split('=').slice(1).join('=') ?? OUT,
  };
}

function buildOverpassQuery(bbox) {
  const { south, west, north, east } = bbox;
  const area = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:240];
(
  nwr["leisure"="pitch"]["sport"~"basketball"]${area};
  nwr["leisure"="pitch"]["hoops"]${area};
  nwr["leisure"="playground"]["sport"~"basketball"]${area};
  nwr["leisure"="recreation_ground"]["sport"~"basketball"]${area};
  nwr["leisure"="pitch"]["sport"="multi"]${area};
);
out tags center;`;
}

/** Boisko z koszem — kategoria koszykówka (w tym orliki/multi i place zabaw). */
function isBasketballCourt(el) {
  const tags = el.tags ?? {};
  const sport = (tags.sport ?? '').trim().toLowerCase();
  if (sport === 'basketball' || sport === 'multi') return true;
  if (sport.includes('basketball')) return true;
  if (tags.hoops) return true;
  if (tags.leisure === 'playground' && /basketball/i.test(sport)) return true;
  if (tags.leisure === 'recreation_ground' && /basketball/i.test(sport)) return true;
  return false;
}

function tilePoland(rows, cols) {
  const { south, west, north, east } = POLAND_BBOX;
  const latStep = (north - south) / rows;
  const lngStep = (east - west) / cols;
  const tiles = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        south: south + r * latStep,
        north: south + (r + 1) * latStep,
        west: west + c * lngStep,
        east: west + (c + 1) * lngStep,
        id: `${r + 1}x${c + 1}`,
      });
    }
  }
  return tiles;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchTile(bbox) {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'dudieday-sport/1.0 (Poland basketball OSM import)',
      Accept: 'application/json',
    },
    body: 'data=' + encodeURIComponent(buildOverpassQuery(bbox)),
  });

  if (res.status === 429 || res.status === 504) {
    await sleep(8000);
    return fetchTile(bbox);
  }
  if (!res.ok) {
    throw new Error(`Overpass ${res.status} dla kafelka ${bbox.id ?? ''}`);
  }
  const json = await res.json();
  return json.elements ?? [];
}

function coordsOf(el) {
  if (typeof el.lon === 'number' && typeof el.lat === 'number') {
    return [el.lon, el.lat];
  }
  if (el.center && typeof el.center.lon === 'number' && typeof el.center.lat === 'number') {
    return [el.center.lon, el.center.lat];
  }
  return null;
}

function formatStreet(street) {
  const trimmed = street.trim();
  if (/^ul(\.|ica)?\s/i.test(trimmed)) return trimmed;
  return `ul. ${trimmed}`;
}

function courtNameFromTags(tags) {
  const osm =
    tags.name?.trim() ||
    tags['addr:street']?.trim() ||
    tags.operator?.trim() ||
    null;
  if (!osm) return DEFAULT_COURT;
  if (/^boisko/i.test(osm) || /orlik|kosz|basket|sport/i.test(osm)) return osm;
  return osm;
}

function buildNameFromOsmTags(tags) {
  const street =
    tags['addr:street']?.trim() ||
    tags['addr:place']?.trim() ||
    tags['addr:full']?.trim() ||
    null;
  const court = courtNameFromTags(tags);
  if (street) return `${court} · ${formatStreet(street)}`;
  return court;
}

function buildAddress(feature) {
  if (!feature) return null;
  const street = feature.text?.trim();
  if (!street) return null;
  const num = feature.address?.trim();
  const city =
    feature.context?.find((c) => c.id?.startsWith('place.'))?.text?.trim() || null;
  const streetPart = formatStreet(street);
  const withNum = num ? `${streetPart} ${num}` : streetPart;
  return city ? `${withNum}, ${city}` : withNum;
}

async function mapboxAddress(lng, lat, token) {
  const params = new URLSearchParams({
    language: 'pl',
    types: 'address',
    limit: '1',
    access_token: token,
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return buildAddress(json.features?.[0]);
}

function sqlString(value) {
  if (value == null || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(rows) {
  const header = `-- ═══════════════════════════════════════════════════════════════════════════
-- 0049 — Boiska koszykówki z OSM: cała Polska
-- WYGENEROWANE: scripts/import-osm-fields-poland.mjs — nie edytować ręcznie.
-- Liczba boisk: ${rows.length} (kategoria koszykówka: kosze, orliki, place zabaw)
-- Idempotentne (on conflict aktualizuje sport, geom; nazwy istniejących bez zmian).
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.fields (osm_type, osm_id, name, sport, geom, source, status) values`;

  const chunkSize = 400;
  const valueLines = rows.map((r) => {
    const point = `st_setsrid(st_makepoint(${r.lng}, ${r.lat}), 4326)::geography`;
    return `  (${sqlString(r.osm_type)}, ${r.osm_id}, ${sqlString(r.name)}, 'basketball', ${point}, 'osm', 'approved')`;
  });

  const chunks = [];
  for (let i = 0; i < valueLines.length; i += chunkSize) {
    chunks.push(valueLines.slice(i, i + chunkSize).join(',\n'));
  }

  const footer = `
on conflict (osm_type, osm_id) where osm_type is not null and osm_id is not null
do update set
  sport = excluded.sport,
  geom = excluded.geom,
  updated_at = now();

notify pgrst, 'reload schema';
`;

  return `${header}\n${chunks.join(',\n')}\n${footer}`;
}

async function fetchAllTiles(tiles, useCache) {
  if (useCache && existsSync(CACHE)) {
    console.log(`Wczytuję cache: ${CACHE}`);
    return JSON.parse(readFileSync(CACHE, 'utf8'));
  }

  const seen = new Set();
  const elements = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    console.log(
      `Kafelek ${i + 1}/${tiles.length} (${tile.id}) S=${tile.south.toFixed(2)} W=${tile.west.toFixed(2)}…`,
    );
    const batch = await fetchTile(tile);
    for (const el of batch) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      elements.push(el);
    }
    if (i < tiles.length - 1) await sleep(OVERPASS_DELAY_MS);
  }

  mkdirSync(dirname(CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(elements), 'utf8');
  console.log(`Zapisano cache: ${CACHE} (${elements.length} elementów)`);
  return elements;
}

async function main() {
  const { enrich, rows, cols, useCache, out } = parseArgs(process.argv.slice(2));
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  if (enrich && !token) {
    throw new Error('Flaga --enrich wymaga EXPO_PUBLIC_MAPBOX_TOKEN w .env');
  }

  const tiles = tilePoland(rows, cols);
  console.log(`Import boisk koszykówki — Polska (${rows}x${cols} kafelków, ${tiles.length} zapytań)`);

  const elements = await fetchAllTiles(tiles, useCache);
  const courts = elements.filter(isBasketballCourt);
  console.log(`Boiska z koszem: ${courts.length}/${elements.length} elementów.`);

  const rowsOut = [];
  let skipped = 0;

  for (let i = 0; i < courts.length; i++) {
    const el = courts[i];
    const coords = coordsOf(el);
    if (!coords) {
      skipped++;
      continue;
    }
    const tags = el.tags ?? {};
    let name = buildNameFromOsmTags(tags);

    if (enrich) {
      const court = courtNameFromTags(tags);
      const address = await mapboxAddress(coords[0], coords[1], token);
      name = address ? `${court} · ${address}` : court;
      if ((i + 1) % 50 === 0) {
        console.log(`  Mapbox ${i + 1}/${courts.length}…`);
      }
      await sleep(MAPBOX_DELAY_MS);
    }

    rowsOut.push({
      osm_type: el.type,
      osm_id: el.id,
      name,
      lng: coords[0],
      lat: coords[1],
    });
  }

  console.log(`Gotowe: ${rowsOut.length} boisk (pominięto ${skipped} bez współrzędnych).`);

  if (rowsOut.length === 0) {
    throw new Error('Brak boisk — przerwano.');
  }

  const sql = buildSql(rowsOut);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sql, 'utf8');
  console.log(`Zapisano: ${out} (${(sql.length / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch((err) => {
  console.error('Błąd:', err.message);
  process.exit(1);
});
