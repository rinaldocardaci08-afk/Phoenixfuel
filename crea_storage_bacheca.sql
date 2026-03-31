-- Crea bucket storage per allegati bacheca
INSERT INTO storage.buckets (id, name, public) VALUES ('bacheca', 'bacheca', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: tutti possono leggere
CREATE POLICY "Lettura pubblica bacheca" ON storage.objects FOR SELECT USING (bucket_id = 'bacheca');

-- Policy: utenti autenticati possono caricare
CREATE POLICY "Upload autenticati bacheca" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'bacheca' AND auth.role() = 'authenticated');

-- Policy: utenti autenticati possono eliminare
CREATE POLICY "Delete autenticati bacheca" ON storage.objects FOR DELETE USING (bucket_id = 'bacheca' AND auth.role() = 'authenticated');
