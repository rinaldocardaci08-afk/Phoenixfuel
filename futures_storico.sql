-- PhoenixFuel — Tabella storico futures ICE Gasoil
-- Esegui in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS futures_storico (
  id                 bigint generated always as identity primary key,
  data               date not null unique,
  lgo_usd            numeric(10,2),
  eurusd             numeric(8,4),
  prezzo_euro_litro  numeric(10,5),
  var_euro_litro     numeric(10,5),
  segnale            text check (segnale in ('rialzo','ribasso','stabile')),
  impatto_pct        numeric(6,2),
  created_at         timestamptz default now()
);

-- Indice per query per data
CREATE INDEX IF NOT EXISTS idx_futures_storico_data ON futures_storico (data desc);

-- RLS
ALTER TABLE futures_storico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "futures_select" ON futures_storico
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "futures_insert" ON futures_storico
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "futures_update" ON futures_storico
  FOR UPDATE TO authenticated USING (true);
