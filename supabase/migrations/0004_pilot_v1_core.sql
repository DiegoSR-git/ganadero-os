-- ============ Piloto V1: fiabilidad, idempotencia, feedback, analítica, auditoría ============

-- 1. Campos de piloto en explotaciones
ALTER TABLE public.explotaciones
  ADD COLUMN IF NOT EXISTS pilot_status text NOT NULL DEFAULT 'candidata',
  ADD COLUMN IF NOT EXISTS pilot_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS pilot_notes text,
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- 2. Idempotencia de WhatsApp: id de mensaje de Meta
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS wa_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS wa_messages_wa_message_id_uidx
  ON public.wa_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

-- 3. Idempotencia de escrituras (IA, WhatsApp, importaciones)
ALTER TABLE public.eventos_animales ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.expenses          ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.ingresos          ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.animales          ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS eventos_animales_idem_uidx ON public.eventos_animales (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_idem_uidx         ON public.expenses (idempotency_key)         WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ingresos_idem_uidx         ON public.ingresos (idempotency_key)         WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS animales_idem_uidx         ON public.animales (idempotency_key)         WHERE idempotency_key IS NOT NULL;

-- 4. Crotal único por explotación + índices de rendimiento
CREATE UNIQUE INDEX IF NOT EXISTS animales_explotacion_crotal_uidx ON public.animales (explotacion_id, lower(crotal));
CREATE INDEX IF NOT EXISTS animales_explotacion_estado_idx  ON public.animales (explotacion_id, estado);
CREATE INDEX IF NOT EXISTS animales_crotal_trgm_idx         ON public.animales (explotacion_id, crotal text_pattern_ops);
CREATE INDEX IF NOT EXISTS eventos_animales_animal_idx      ON public.eventos_animales (animal_id, fecha DESC);
CREATE INDEX IF NOT EXISTS eventos_animales_expl_idx        ON public.eventos_animales (explotacion_id, fecha DESC);
CREATE INDEX IF NOT EXISTS expenses_expl_fecha_idx          ON public.expenses (explotacion_id, fecha DESC);
CREATE INDEX IF NOT EXISTS ingresos_expl_fecha_idx          ON public.ingresos (explotacion_id, fecha DESC);
CREATE INDEX IF NOT EXISTS documentos_expl_fecha_idx        ON public.documentos (explotacion_id, fecha DESC);
CREATE INDEX IF NOT EXISTS tareas_expl_estado_idx           ON public.tareas (explotacion_id, estado);
CREATE INDEX IF NOT EXISTS ai_action_log_expl_idx           ON public.ai_action_log (explotacion_id, created_at DESC);

-- 5. Feedback de usuarios
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  user_id uuid,
  canal text NOT NULL DEFAULT 'app',
  mensaje text NOT NULL,
  valoracion integer,
  contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado text NOT NULL DEFAULT 'nuevo',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feedback_insert_own ON public.feedback;
CREATE POLICY feedback_insert_own ON public.feedback FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (explotacion_id IS NULL OR public.user_in_explotacion(auth.uid(), explotacion_id)));
DROP POLICY IF EXISTS feedback_select_own ON public.feedback;
CREATE POLICY feedback_select_own ON public.feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'superadmin'));

-- 6. Analítica de producto
CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  user_id uuid,
  canal text NOT NULL DEFAULT 'app',
  evento text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_events_evento_idx ON public.product_events (evento, created_at DESC);
CREATE INDEX IF NOT EXISTS product_events_expl_idx   ON public.product_events (explotacion_id, created_at DESC);
GRANT SELECT, INSERT ON public.product_events TO authenticated;
GRANT ALL ON public.product_events TO service_role;
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_events_insert_own ON public.product_events;
CREATE POLICY product_events_insert_own ON public.product_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (explotacion_id IS NULL OR public.user_in_explotacion(auth.uid(), explotacion_id)));
DROP POLICY IF EXISTS product_events_select_admin ON public.product_events;
CREATE POLICY product_events_select_admin ON public.product_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

-- 7. Auditoría por explotación (trazabilidad de escrituras)
CREATE TABLE IF NOT EXISTS public.actividad_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid NOT NULL REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  user_id uuid,
  canal text NOT NULL DEFAULT 'app',
  accion text NOT NULL,
  entidad text,
  entidad_id uuid,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS actividad_log_expl_idx ON public.actividad_log (explotacion_id, created_at DESC);
GRANT SELECT ON public.actividad_log TO authenticated;
GRANT ALL ON public.actividad_log TO service_role;
ALTER TABLE public.actividad_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actividad_log_select_member ON public.actividad_log;
CREATE POLICY actividad_log_select_member ON public.actividad_log FOR SELECT TO authenticated
  USING (public.user_in_explotacion(auth.uid(), explotacion_id) OR public.has_role(auth.uid(), 'superadmin'));

-- 8. Vista de métricas del piloto (solo la usa el panel interno vía RPC)
CREATE OR REPLACE FUNCTION public.pilot_metrics()
RETURNS TABLE(
  explotacion_id uuid,
  nombre text,
  pilot_status text,
  animales bigint,
  eventos_7d bigint,
  acciones_ia_7d bigint,
  mensajes_wa_7d bigint,
  ultimo_uso timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.nombre, e.pilot_status,
    (SELECT count(*) FROM public.animales a WHERE a.explotacion_id = e.id),
    (SELECT count(*) FROM public.eventos_animales ev WHERE ev.explotacion_id = e.id AND ev.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.ai_action_log l WHERE l.explotacion_id = e.id AND l.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.ai_sessions s WHERE s.explotacion_id = e.id AND s.canal = 'whatsapp' AND s.updated_at > now() - interval '7 days'),
    GREATEST(
      COALESCE((SELECT max(created_at) FROM public.eventos_animales ev WHERE ev.explotacion_id = e.id), e.created_at),
      COALESCE((SELECT max(created_at) FROM public.ai_action_log l WHERE l.explotacion_id = e.id), e.created_at)
    )
  FROM public.explotaciones e
  WHERE public.has_role(auth.uid(), 'superadmin')
  ORDER BY e.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.pilot_metrics() TO authenticated;
