CREATE POLICY "documentos_select_explotacion"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos'
  AND public.user_in_explotacion(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "documentos_insert_explotacion"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND public.user_in_explotacion(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "documentos_update_explotacion"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documentos'
  AND public.user_in_explotacion(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "documentos_delete_explotacion"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos'
  AND public.user_in_explotacion(auth.uid(), ((storage.foldername(name))[1])::uuid)
);