-- Aggiungi colonna ordine per drag & drop
ALTER TABLE bacheca_post ADD COLUMN IF NOT EXISTS ordine INTEGER DEFAULT 0;
-- Inizializza ordine sui post esistenti
UPDATE bacheca_post SET ordine = EXTRACT(EPOCH FROM created_at)::INTEGER WHERE ordine = 0;
