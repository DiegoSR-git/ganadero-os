ALTER TABLE public.explotaciones ADD COLUMN IF NOT EXISTS whatsapp_number text;
CREATE INDEX IF NOT EXISTS idx_explotaciones_whatsapp ON public.explotaciones (whatsapp_number);