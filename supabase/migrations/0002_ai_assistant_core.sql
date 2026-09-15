-- Registro de acciones e intenciones de la IA
CREATE TABLE public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  explotacion_id uuid REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  user_id uuid,
  canal text NOT NULL DEFAULT 'app',
  intencion text,
  mensaje text,
  tool text,
  ok boolean NOT NULL DEFAULT true,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_action_log TO authenticated;
GRANT ALL ON public.ai_action_log TO service_role;
ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_action_log_select_own" ON public.ai_action_log
  FOR SELECT TO authenticated
  USING (explotacion_id IS NOT NULL AND public.user_in_explotacion(auth.uid(), explotacion_id));

CREATE INDEX idx_ai_action_log_expl ON public.ai_action_log(explotacion_id, created_at DESC);

-- Sesiones conversacionales cortas (app y WhatsApp)
CREATE TABLE public.ai_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL,
  external_key text NOT NULL,
  explotacion_id uuid REFERENCES public.explotaciones(id) ON DELETE CASCADE,
  user_id uuid,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  pending jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canal, external_key)
);

GRANT SELECT ON public.ai_sessions TO authenticated;
GRANT ALL ON public.ai_sessions TO service_role;
ALTER TABLE public.ai_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_sessions_select_own" ON public.ai_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_ai_sessions_updated ON public.ai_sessions(updated_at DESC);

-- Feature flags globales
CREATE TABLE public.ai_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  descripcion text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_feature_flags TO authenticated, anon;
GRANT ALL ON public.ai_feature_flags TO service_role;
ALTER TABLE public.ai_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_feature_flags_read" ON public.ai_feature_flags
  FOR SELECT TO authenticated, anon USING (true);

INSERT INTO public.ai_feature_flags (key, descripcion) VALUES
  ('ai_assistant', 'Asistente IA dentro de la app'),
  ('voice_input', 'Entrada por voz'),
  ('whatsapp_ai', 'Lenguaje natural por WhatsApp'),
  ('ear_tag_ocr', 'Lectura de crotales por foto'),
  ('document_classification', 'Clasificación automática de documentos');