
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS factura_logo_url text,
  ADD COLUMN IF NOT EXISTS factura_color_primario text,
  ADD COLUMN IF NOT EXISTS factura_color_acento text,
  ADD COLUMN IF NOT EXISTS factura_encabezado text,
  ADD COLUMN IF NOT EXISTS factura_pie text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "logos publicos lectura" ON storage.objects;
CREATE POLICY "logos publicos lectura"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

DROP POLICY IF EXISTS "logos empresa subir" ON storage.objects;
CREATE POLICY "logos empresa subir"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND public.user_has_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "logos empresa actualizar" ON storage.objects;
CREATE POLICY "logos empresa actualizar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND public.user_has_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "logos empresa borrar" ON storage.objects;
CREATE POLICY "logos empresa borrar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND public.user_has_company(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
