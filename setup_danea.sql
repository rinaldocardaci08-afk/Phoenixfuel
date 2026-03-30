-- PhoenixFuel — Integrazione Danea Easyfatt
-- Aggiunge codice Danea per matching anagrafica

ALTER TABLE clienti ADD COLUMN IF NOT EXISTS codice_danea text;
COMMENT ON COLUMN clienti.codice_danea IS 'Codice cliente in Danea Easyfatt (CustomerCode per matching automatico)';

ALTER TABLE fornitori ADD COLUMN IF NOT EXISTS codice_danea text;
COMMENT ON COLUMN fornitori.codice_danea IS 'Codice fornitore in Danea Easyfatt (CustomerCode per matching automatico)';
