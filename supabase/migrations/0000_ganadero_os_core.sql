-- ============ FASE 1: modelo ganadero ============

CREATE TABLE public.explotaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nombre text NOT NULL,
  codigo_rega text,
  especie_principal text NOT NULL DEFAULT 'bovino',
  tipo_ganaderia text NOT NULL DEFAULT 'extensiva',
  municipio text,
  provincia text,
  superficie_total numeric,
  numero_animales_estimado integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.explotaciones TO authenticated;
GRANT ALL ON public.explotaciones TO service_role;
ALTER TABLE public.explotaciones ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.explotacion_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'worker',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (explotacion_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.explotacion_members TO authenticated;
GRANT ALL ON public.explotacion_members TO service_role;
ALTER TABLE public.explotacion_members ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.user_owns_explotacion(_user_id uuid, _explotacion_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.explotaciones e WHERE e.id = _explotacion_id AND e.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.user_in_explotacion(_user_id uuid, _explotacion_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.user_owns_explotacion(_user_id, _explotacion_id)
      OR EXISTS (SELECT 1 FROM public.explotacion_members m
                 WHERE m.explotacion_id = _explotacion_id AND m.user_id = _user_id AND m.status = 'active');
$$;

CREATE POLICY "explotaciones_select" ON public.explotaciones FOR SELECT TO authenticated
  USING (public.user_in_explotacion(auth.uid(), id));
CREATE POLICY "explotaciones_insert" ON public.explotaciones FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "explotaciones_update" ON public.explotaciones FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "explotaciones_delete" ON public.explotaciones FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "members_select" ON public.explotacion_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_owns_explotacion(auth.uid(), explotacion_id));
CREATE POLICY "members_write" ON public.explotacion_members FOR ALL TO authenticated
  USING (public.user_owns_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_owns_explotacion(auth.uid(), explotacion_id));

-- Fincas
CREATE TABLE public.fincas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  superficie numeric,
  ubicacion text,
  referencia text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fincas TO authenticated;
GRANT ALL ON public.fincas TO service_role;
ALTER TABLE public.fincas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fincas_all" ON public.fincas FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_fincas_expl ON public.fincas(explotacion_id);

-- Parcelas
CREATE TABLE public.parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  finca_id uuid REFERENCES public.fincas(id) ON DELETE SET NULL,
  nombre text NOT NULL,
  superficie numeric,
  referencia_sigpac text,
  uso text,
  estado text NOT NULL DEFAULT 'disponible',
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parcelas TO authenticated;
GRANT ALL ON public.parcelas TO service_role;
ALTER TABLE public.parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parcelas_all" ON public.parcelas FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_parcelas_finca ON public.parcelas(finca_id);
CREATE INDEX idx_parcelas_expl ON public.parcelas(explotacion_id);

-- Lotes
CREATE TABLE public.lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  finca_id uuid REFERENCES public.fincas(id) ON DELETE SET NULL,
  parcela_id uuid REFERENCES public.parcelas(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'activo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lotes TO authenticated;
GRANT ALL ON public.lotes TO service_role;
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lotes_all" ON public.lotes FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_lotes_expl ON public.lotes(explotacion_id);

-- Animales
CREATE TABLE public.animales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  parcela_id uuid REFERENCES public.parcelas(id) ON DELETE SET NULL,
  crotal text NOT NULL,
  identificador_secundario text,
  especie text NOT NULL DEFAULT 'bovino',
  raza text,
  sexo text NOT NULL DEFAULT 'hembra',
  fecha_nacimiento date,
  madre_id uuid REFERENCES public.animales(id) ON DELETE SET NULL,
  padre_id uuid REFERENCES public.animales(id) ON DELETE SET NULL,
  fecha_alta date NOT NULL DEFAULT current_date,
  origen text,
  fecha_baja date,
  motivo_baja text,
  peso_actual numeric,
  estado text NOT NULL DEFAULT 'activo',
  estado_reproductivo text,
  fotografia_url text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (explotacion_id, crotal)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.animales TO authenticated;
GRANT ALL ON public.animales TO service_role;
ALTER TABLE public.animales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "animales_all" ON public.animales FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_animales_expl ON public.animales(explotacion_id);
CREATE INDEX idx_animales_lote ON public.animales(lote_id);
CREATE INDEX idx_animales_crotal ON public.animales(explotacion_id, crotal);
CREATE INDEX idx_animales_estado ON public.animales(explotacion_id, estado);

-- ============ FASE 2: eventos ============
CREATE TABLE public.eventos_animales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  animal_id uuid REFERENCES public.animales(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  fecha date NOT NULL DEFAULT current_date,
  descripcion text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  documento_id uuid,
  estado text NOT NULL DEFAULT 'cerrado',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eventos_animales TO authenticated;
GRANT ALL ON public.eventos_animales TO service_role;
ALTER TABLE public.eventos_animales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "eventos_all" ON public.eventos_animales FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_eventos_animal ON public.eventos_animales(animal_id, fecha DESC);
CREATE INDEX idx_eventos_expl_tipo ON public.eventos_animales(explotacion_id, tipo_evento, fecha DESC);

-- Tareas
CREATE TABLE public.tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  fecha_limite date,
  prioridad text NOT NULL DEFAULT 'normal',
  estado text NOT NULL DEFAULT 'pendiente',
  animal_id uuid REFERENCES public.animales(id) ON DELETE SET NULL,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas TO authenticated;
GRANT ALL ON public.tareas TO service_role;
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tareas_all" ON public.tareas FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_tareas_expl ON public.tareas(explotacion_id, estado);

-- Documentos
CREATE TABLE public.documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'otros',
  archivo_path text,
  bucket text NOT NULL DEFAULT 'expenses',
  fecha date NOT NULL DEFAULT current_date,
  animal_id uuid REFERENCES public.animales(id) ON DELETE SET NULL,
  evento_id uuid REFERENCES public.eventos_animales(id) ON DELETE SET NULL,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO authenticated;
GRANT ALL ON public.documentos TO service_role;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documentos_all" ON public.documentos FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_documentos_expl ON public.documentos(explotacion_id);

-- Ingresos ganaderos (venta animales, subvenciones...)
CREATE TABLE public.ingresos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT current_date,
  concepto text NOT NULL,
  categoria text NOT NULL DEFAULT 'otros',
  importe numeric NOT NULL DEFAULT 0,
  cliente text,
  animal_id uuid REFERENCES public.animales(id) ON DELETE SET NULL,
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingresos TO authenticated;
GRANT ALL ON public.ingresos TO service_role;
ALTER TABLE public.ingresos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingresos_all" ON public.ingresos FOR ALL TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (public.user_in_explotacion(auth.uid(), explotacion_id));
CREATE INDEX idx_ingresos_expl ON public.ingresos(explotacion_id, fecha DESC);

-- Gastos: vinculación opcional al modelo ganadero (aditivo, no destructivo)
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS explotacion_id uuid REFERENCES public.explotaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finca_id uuid REFERENCES public.fincas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS animal_id uuid REFERENCES public.animales(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ALTER COLUMN company_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_expl ON public.expenses(explotacion_id, fecha DESC);

DROP POLICY IF EXISTS "expenses_ganadero_all" ON public.expenses;
CREATE POLICY "expenses_ganadero_all" ON public.expenses FOR ALL TO authenticated
  USING (explotacion_id IS NOT NULL AND public.user_in_explotacion(auth.uid(), explotacion_id))
  WITH CHECK (explotacion_id IS NOT NULL AND public.user_in_explotacion(auth.uid(), explotacion_id));

-- touch triggers
CREATE TRIGGER trg_explotaciones_touch BEFORE UPDATE ON public.explotaciones FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_fincas_touch BEFORE UPDATE ON public.fincas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_parcelas_touch BEFORE UPDATE ON public.parcelas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_lotes_touch BEFORE UPDATE ON public.lotes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_animales_touch BEFORE UPDATE ON public.animales FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tareas_touch BEFORE UPDATE ON public.tareas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_documentos_touch BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_ingresos_touch BEFORE UPDATE ON public.ingresos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_members_touch BEFORE UPDATE ON public.explotacion_members FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();