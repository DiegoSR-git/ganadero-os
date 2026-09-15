CREATE POLICY "usuarios editan su empresa"
ON public.companies
FOR UPDATE
USING (public.user_has_company(auth.uid(), id))
WITH CHECK (public.user_has_company(auth.uid(), id));