CREATE TABLE benchmark_prezzi (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL,
  prodotto text NOT NULL DEFAULT 'Gasolio Autotrazione',
  prezzo numeric(10,4) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(data, prodotto)
);

ALTER TABLE benchmark_prezzi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bench_select" ON benchmark_prezzi FOR SELECT USING (true);
CREATE POLICY "bench_insert" ON benchmark_prezzi FOR INSERT WITH CHECK (true);
CREATE POLICY "bench_update" ON benchmark_prezzi FOR UPDATE USING (true);
CREATE POLICY "bench_delete" ON benchmark_prezzi FOR DELETE USING (true);

CREATE INDEX idx_bench_data ON benchmark_prezzi (data DESC, prodotto);
