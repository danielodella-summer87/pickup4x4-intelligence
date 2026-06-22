#!/usr/bin/env bash
#
# Pickup 4x4 — Regenera y persiste la campaña de recambio (cubre caja + lona) de punta a punta.
# Standalone: NO necesita `npm run dev` ni las API routes. Persiste directo en Supabase (service role).
#
#   1) build:  computa la base desde los Excel -> CSVs vigentes + public/data/recambio.json
#   2) seed:   persiste/actualiza la campaña en Supabase (idempotente, misma identidad)
#
# Variables (de .env.local o del entorno): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
# Uso:  ./scripts/campania.sh   (o  npm run campania)
#
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶ 1/2 · Computando base de campaña…"
node scripts/build-campania.cjs

echo ""
echo "▶ 2/2 · Persistiendo en Supabase (directo, sin dev server)…"
node scripts/seed-campania-supabase-direct.cjs

echo ""
echo "✔ Campaña regenerada y persistida."
