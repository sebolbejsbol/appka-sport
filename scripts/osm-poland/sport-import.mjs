// Import boisk z OSM dla całej Polski — piłka nożna i tenis.
// Analogiczny proces jak koszykówka (scripts/osm-poland/import.mjs + basketball-upload),
// ale w jednym pliku: fetch (Overpass → cache + SQL), upload (MCP → baza), verify.
//
// Użycie (uruchamiaj z --use-system-ca dla poprawnych certyfikatów TLS):
//   node --use-system-ca scripts/osm-poland/sport-import.mjs fetch  --sport=football
//   node --use-system-ca scripts/osm-poland/sport-import.mjs fetch  --sport=tennis
//   node --use-system-ca scripts/osm-poland/sport-import.mjs upload --sport=football
//   node --use-system-ca scripts/osm-poland/sport-import.mjs upload --sport=tennis
//   node --use-system-ca scripts/osm-poland/sport-import.mjs verify --sport=football
//
// Flagi: --tiles=RxC (siatka kafelków), --no-cache (wymuś ponowny fetch), --chunk=500

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMcpClient } from '../basketball-upload/lib/mcp-http.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const OVERPASS_DELAY_MS = 2500;

/** Granice Polski (z marginesem) — identyczne jak w imporcie koszykówki. */
const POLAND_BBOX = { south: 49.0, west: 14.12, north: 54.84, east: 24.15 };

const SPORTS = {
  basketball: {
    storedSport: 'basketball',
    defaultCourt: 'Boisko do koszykówki',
    cache: 'scripts/.cache/poland-basketball-osm.json',
    out: 'supabase/migrations/0049_osm_basketball_poland.sql',
    progress: 'scripts/.cache/basketball-remerge-upload.json',
    tiles: { rows: 8, cols: 10 },
    overpassBody: (area) => `
  nwr["leisure"="pitch"]["sport"~"basketball"]${area};
  nwr["leisure"="pitch"]["hoops"]${area};
  nwr["leisure"="playground"]["sport"~"basketball"]${area};
  nwr["leisure"="recreation_ground"]["sport"~"basketball"]${area};
  nwr["leisure"="pitch"]["sport"="multi"]${area};`,
    match: (tags) => {
      const sport = (tags.sport ?? '').trim().toLowerCase();
      if (sport === 'basketball' || sport === 'multi') return true;
      if (sport.includes('basketball')) return true;
      if (tags.hoops) return true;
      if (tags.leisure === 'playground' && /basketball/i.test(sport)) return true;
      if (tags.leisure === 'recreation_ground' && /basketball/i.test(sport)) return true;
      return false;
    },
    title: 'Boiska koszykówki z OSM: cała Polska',
  },
  football: {
    storedSport: 'football',
    defaultCourt: 'Boisko do piłki nożnej',
    cache: 'scripts/.cache/poland-football-osm.json',
    out: 'supabase/migrations/0051_osm_football_poland.sql',
    progress: 'scripts/.cache/football-upload.json',
    tiles: { rows: 12, cols: 12 },
    overpassBody: (area) => `
  nwr["leisure"="pitch"]["sport"~"soccer"]${area};
  nwr["leisure"="pitch"]["sport"~"football"]${area};`,
    match: (tags) => {
      const tokens = (tags.sport ?? '').toLowerCase().split(';').map((s) => s.trim());
      return tokens.includes('soccer') || tokens.includes('football');
    },
    title: 'Boiska piłki nożnej z OSM: cała Polska',
  },
  tennis: {
    storedSport: 'tennis',
    defaultCourt: 'Kort tenisowy',
    cache: 'scripts/.cache/poland-tennis-osm.json',
    out: 'supabase/migrations/0052_osm_tennis_poland.sql',
    progress: 'scripts/.cache/tennis-upload.json',
    tiles: { rows: 8, cols: 10 },
    overpassBody: (area) => `
  nwr["leisure"="pitch"]["sport"~"tennis"]${area};
  nwr["leisure"="sports_centre"]["sport"~"tennis"]${area};`,
    match: (tags) => {
      const tokens = (tags.sport ?? '').toLowerCase().split(';').map((s) => s.trim());
      return tokens.includes('tennis'); // wyklucza 'table_tennis' (osobny token)
    },
    title: 'Korty tenisowe z OSM: cała Polska',
  },
};

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'gjkbnkaijlempveotnui';

function abs(rel) {
  return join(ROOT, rel);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv) {
  const sport = argv.find((a) => a.startsWith('--sport='))?.split('=')[1];
  const tilesArg = argv.find((a) => a.startsWith('--tiles='))?.split('=')[1];
  const chunkArg = argv.find((a) => a.startsWith('--chunk='))?.split('=')[1];
  return {
    sport,
    tilesArg,
    chunk: chunkArg ? Number(chunkArg) : 500,
    useCache: !argv.includes('--no-cache'),
  };
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

function buildOverpassQuery(cfg, bbox) {
  const area = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  return `[out:json][timeout:240];\n(${cfg.overpassBody(area)}\n);\nout tags center;`;
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

async function fetchTile(cfg, bbox, attempt = 0) {
  let res;
  try {
    res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'dudieday-sport/1.0 (Poland OSM import)',
        Accept: 'application/json',
      },
      body: 'data=' + encodeURIComponent(buildOverpassQuery(cfg, bbox)),
    });
  } catch (e) {
    if (attempt < 5) {
      await sleep(8000);
      return fetchTile(cfg, bbox, attempt + 1);
    }
    throw e;
  }
  if (res.status === 429 || res.status === 504 || res.status === 502) {
    if (attempt < 8) {
      await sleep(10000);
      return fetchTile(cfg, bbox, attempt + 1);
    }
  }
  if (!res.ok) throw new Error(`Overpass ${res.status} dla kafelka ${bbox.id ?? ''}`);
  const json = await res.json();
  return json.elements ?? [];
}

function coordsOf(el) {
  if (typeof el.lon === 'number' && typeof el.lat === 'number') return [el.lon, el.lat];
  if (el.center && typeof el.center.lon === 'number') return [el.center.lon, el.center.lat];
  return null;
}

function formatStreet(street) {
  const trimmed = street.trim();
  if (/^ul(\.|ica)?\s/i.test(trimmed)) return trimmed;
  return `ul. ${trimmed}`;
}

function buildName(cfg, tags) {
  const court = tags.name?.trim() || tags.operator?.trim() || cfg.defaultCourt;
  const street =
    tags['addr:street']?.trim() || tags['addr:place']?.trim() || tags['addr:full']?.trim() || null;
  if (street) return `${court} · ${formatStreet(street)}`;
  return court;
}

function sqlString(value) {
  if (value == null || value === '') return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildRows(cfg, elements) {
  const rows = [];
  let skipped = 0;
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (!cfg.match(tags)) continue;
    const coords = coordsOf(el);
    if (!coords) {
      skipped++;
      continue;
    }
    rows.push({
      osm_type: el.type,
      osm_id: el.id,
      name: buildName(cfg, tags),
      lng: coords[0],
      lat: coords[1],
    });
  }
  return { rows, skipped };
}

function valueLine(cfg, r) {
  const point = `st_setsrid(st_makepoint(${r.lng}, ${r.lat}), 4326)::geography`;
  return `  (${sqlString(r.osm_type)}, ${r.osm_id}, ${sqlString(r.name)}, '${cfg.storedSport}', ${point}, 'osm', 'approved')`;
}

function insertSql(cfg, rows) {
  const header = `insert into public.fields (osm_type, osm_id, name, sport, geom, source, status) values`;
  // Scalamy sporty (lista rozdzielana ';'), żeby boiska wielofunkcyjne (np. kosz + piłka)
  // pojawiały się pod każdym właściwym filtrem zamiast nadpisywać poprzednią dyscyplinę.
  const footer = `\non conflict (osm_type, osm_id) where osm_type is not null and osm_id is not null\ndo update set\n  sport = (\n    select string_agg(s, ';' order by s)\n    from (\n      select distinct trim(x) as s\n      from unnest(string_to_array(coalesce(public.fields.sport, '') || ';' || excluded.sport, ';')) as x\n      where trim(x) <> ''\n    ) u\n  ),\n  geom = excluded.geom,\n  updated_at = now();`;
  return `${header}\n${rows.map((r) => valueLine(cfg, r)).join(',\n')}\n${footer}`;
}

function buildFullSql(cfg, rows) {
  const head = `-- ═══════════════════════════════════════════════════════════════════════════
-- ${cfg.out.split('/').pop()} — ${cfg.title}
-- WYGENEROWANE: scripts/osm-poland/sport-import.mjs — nie edytować ręcznie.
-- Liczba boisk: ${rows.length}
-- Idempotentne (on conflict aktualizuje sport, geom; nazwy istniejących bez zmian).
-- ═══════════════════════════════════════════════════════════════════════════

`;
  return `${head}${insertSql(cfg, rows)}\n\nnotify pgrst, 'reload schema';\n`;
}

async function cmdFetch(cfg, opts) {
  const tiles = (() => {
    if (opts.tilesArg) {
      const [r, c] = opts.tilesArg.split('x').map(Number);
      return tilePoland(r, c);
    }
    return tilePoland(cfg.tiles.rows, cfg.tiles.cols);
  })();

  console.log(`[${cfg.storedSport}] fetch — Polska, ${tiles.length} kafelków`);

  let elements;
  const cachePath = abs(cfg.cache);
  if (opts.useCache && existsSync(cachePath)) {
    console.log(`Cache: ${cfg.cache}`);
    elements = JSON.parse(readFileSync(cachePath, 'utf8'));
  } else {
    const seen = new Set();
    elements = [];
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const batch = await fetchTile(cfg, tile);
      let added = 0;
      for (const el of batch) {
        const k = `${el.type}/${el.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        elements.push(el);
        added++;
      }
      console.log(`  kafelek ${i + 1}/${tiles.length} (${tile.id}): +${added} (suma ${elements.length})`);
      if (i < tiles.length - 1) await sleep(OVERPASS_DELAY_MS);
    }
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(elements), 'utf8');
    console.log(`Zapisano cache: ${cfg.cache} (${elements.length} elementów)`);
  }

  const { rows, skipped } = buildRows(cfg, elements);
  console.log(`Pasujące boiska: ${rows.length} (pominięto ${skipped} bez współrzędnych)`);

  const sql = buildFullSql(cfg, rows);
  const outPath = abs(cfg.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, sql, 'utf8');
  console.log(`Zapisano SQL: ${cfg.out} (${(sql.length / 1024 / 1024).toFixed(2)} MB, ${rows.length} wierszy)`);
}

function loadProgress(cfg) {
  const p = abs(cfg.progress);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'));
  return { uploaded: 0, total: 0, startedAt: new Date().toISOString() };
}
function saveProgress(cfg, data) {
  const p = abs(cfg.progress);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(data), 'utf8');
}

async function cmdUpload(cfg, opts) {
  loadEnv();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Brak SUPABASE_ACCESS_TOKEN w .env');

  const cachePath = abs(cfg.cache);
  if (!existsSync(cachePath)) throw new Error(`Brak cache ${cfg.cache} — uruchom najpierw "fetch".`);
  const elements = JSON.parse(readFileSync(cachePath, 'utf8'));
  const { rows } = buildRows(cfg, elements);

  const size = opts.chunk;
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));

  const progress = loadProgress(cfg);
  progress.total = chunks.length;
  saveProgress(cfg, progress);

  const url = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}&features=database`;
  const mcp = await createMcpClient({ url, token });

  console.log(`[${cfg.storedSport}] upload — ${rows.length} wierszy, ${chunks.length} chunków (po ${size}), start od ${progress.uploaded}`);

  for (let i = progress.uploaded; i < chunks.length; i++) {
    const sql = insertSql(cfg, chunks[i]);
    try {
      await mcp.callTool('execute_sql', { query: sql });
      progress.uploaded = i + 1;
      saveProgress(cfg, progress);
      console.log(`OK chunk ${i + 1}/${chunks.length}`);
    } catch (e) {
      console.error(`FAIL chunk ${i + 1}/${chunks.length}: ${e.message || e}`);
      throw e;
    }
  }
  console.log(`[${cfg.storedSport}] upload zakończony: ${progress.uploaded}/${chunks.length} chunków`);
}

async function cmdVerify(cfg) {
  loadEnv();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Brak SUPABASE_ACCESS_TOKEN w .env');
  const url = `https://mcp.supabase.com/mcp?project_ref=${PROJECT_REF}&features=database`;
  const mcp = await createMcpClient({ url, token });
  const q = `select count(*) as n from public.fields where status='approved' and sport='${cfg.storedSport}' and source='osm';`;
  const out = await mcp.callTool('execute_sql', { query: q });
  console.log(`[${cfg.storedSport}] w bazie:`, out);
}

async function main() {
  const cmd = process.argv[2];
  const opts = parseArgs(process.argv.slice(3));
  const cfg = SPORTS[opts.sport];
  if (!cfg) throw new Error(`Podaj --sport=football|tennis (otrzymano: ${opts.sport})`);

  if (cmd === 'fetch') return cmdFetch(cfg, opts);
  if (cmd === 'upload') return cmdUpload(cfg, opts);
  if (cmd === 'verify') return cmdVerify(cfg);
  throw new Error('Komendy: fetch | upload | verify');
}

main().catch((err) => {
  console.error('Błąd:', err.message || err);
  process.exit(1);
});
