CREATE POLICY explotaciones_select_own ON public.explotaciones
FOR SELECT TO authenticated
USING (user_id = auth.uid());