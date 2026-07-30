Upload boisk koszykówki (OSM Polska, sport=basketball)
=====================================================

Źródło: 16 270 boisk w scripts/.cache/poland-basketball-osm.json
SQL:    163 chunków w .tmp-0049-parts/chunks/NN/chunk-XX.sql (~100 boisk, ~14 KB)
Postęp: scripts/.cache/basketball-upload.json

Komendy:
  node scripts/basketball-upload/apply.mjs status
  node scripts/basketball-upload/apply.mjs reset    # nowy start (tylko tracker)
  node scripts/basketball-upload/apply.mjs next     # następny chunk do execute_sql

Weryfikacja po imporcie:
  SELECT count(*) FILTER (WHERE sport = 'basketball' AND source = 'osm') FROM fields WHERE status = 'approved';
  -- oczekiwane: ~16 270
