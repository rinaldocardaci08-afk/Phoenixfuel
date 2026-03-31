-- Tabella post bacheca (admin pubblica, tutti vedono)
CREATE TABLE IF NOT EXISTS bacheca_post (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titolo TEXT NOT NULL,
  contenuto TEXT,
  tipo TEXT DEFAULT 'nota',  -- nota, avviso, report, foto
  priorita TEXT DEFAULT 'normale',  -- normale, importante, urgente
  autore_id UUID,
  autore_nome TEXT,
  allegato_url TEXT,
  allegato_nome TEXT,
  pinned BOOLEAN DEFAULT false,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE bacheca_post ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tutti possono leggere post attivi" ON bacheca_post FOR SELECT USING (attivo = true);
CREATE POLICY "Admin inserisce post" ON bacheca_post FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin aggiorna post" ON bacheca_post FOR UPDATE USING (true);
CREATE POLICY "Admin elimina post" ON bacheca_post FOR DELETE USING (true);

-- Indice per ordinamento
CREATE INDEX IF NOT EXISTS idx_bacheca_post_created ON bacheca_post (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bacheca_post_pinned ON bacheca_post (pinned DESC, created_at DESC);
