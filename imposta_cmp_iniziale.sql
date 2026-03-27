-- ═══════════════════════════════════════════════════════════════
-- IMPOSTAZIONE CMP INIZIALE — Cisterne Deposito Vibo
-- ═══════════════════════════════════════════════════════════════
-- 
-- Modifica i valori di costo_medio con il costo reale approssimativo
-- attuale dei litri presenti nelle cisterne.
-- Il costo dovrebbe essere: costo_fornitore + trasporto per litro.
--
-- Prima di eseguire, controlla le cisterne con questa query:
-- SELECT id, nome, prodotto, livello_attuale, costo_medio FROM cisterne WHERE sede = 'deposito_vibo';
--
-- Poi modifica i valori sotto e lancia l'UPDATE.
-- ═══════════════════════════════════════════════════════════════

-- GASOLIO AUTOTRAZIONE: imposta il costo medio attuale (costo+trasporto)
-- Esempio: se l'ultimo carico è costato €1.48 + €0.03 trasporto = €1.51/L
UPDATE cisterne 
SET costo_medio = 1.5100  -- ← MODIFICA con il tuo costo reale
WHERE sede = 'deposito_vibo' 
  AND prodotto = 'Gasolio Autotrazione'
  AND livello_attuale > 0;

-- GASOLIO AGRICOLO: imposta il costo medio attuale
UPDATE cisterne 
SET costo_medio = 1.2000  -- ← MODIFICA con il tuo costo reale
WHERE sede = 'deposito_vibo' 
  AND prodotto = 'Gasolio Agricolo'
  AND livello_attuale > 0;

-- BENZINA: imposta il costo medio attuale
UPDATE cisterne 
SET costo_medio = 1.5500  -- ← MODIFICA con il tuo costo reale
WHERE sede = 'deposito_vibo' 
  AND prodotto = 'Benzina'
  AND livello_attuale > 0;

-- Aggiungi altre righe se hai altri prodotti (es. GPL, AdBlue, ecc.)
-- UPDATE cisterne 
-- SET costo_medio = X.XXXX
-- WHERE sede = 'deposito_vibo' 
--   AND prodotto = 'Nome Prodotto'
--   AND livello_attuale > 0;

-- ═══════════════════════════════════════════════════════════════
-- STAZIONE OPPIDO — Se anche le cisterne stazione non hanno CMP
-- ═══════════════════════════════════════════════════════════════

UPDATE cisterne 
SET costo_medio = 1.5100  -- ← MODIFICA con il tuo costo reale gasolio stazione
WHERE sede = 'stazione_oppido' 
  AND prodotto = 'Gasolio Autotrazione'
  AND livello_attuale > 0;

UPDATE cisterne 
SET costo_medio = 1.5500  -- ← MODIFICA con il tuo costo reale benzina stazione
WHERE sede = 'stazione_oppido' 
  AND prodotto = 'Benzina'
  AND livello_attuale > 0;

-- ═══════════════════════════════════════════════════════════════
-- VERIFICA: controlla i valori dopo l'aggiornamento
-- ═══════════════════════════════════════════════════════════════
-- SELECT nome, prodotto, sede, livello_attuale, costo_medio, 
--        ROUND(livello_attuale * costo_medio, 2) as valore_giacenza
-- FROM cisterne 
-- WHERE livello_attuale > 0
-- ORDER BY sede, prodotto, nome;
