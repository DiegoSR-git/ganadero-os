-- ============================================================
-- 1) Extensiones para cron + http
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 2) Ampliar companies con campos de suscripción
-- ============================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id      text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  text,
  ADD COLUMN IF NOT EXISTS stripe_price_id         text,
  ADD COLUMN IF NOT EXISTS subscription_status     text,
  ADD COLUMN IF NOT EXISTS current_period_end      timestamptz,
  ADD COLUMN IF NOT EXISTS is_active               boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_customer_id_key
  ON public.companies(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS companies_stripe_subscription_id_key
  ON public.companies(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Empresas que ya existían: legacy activas
UPDATE public.companies
SET is_active = true,
    subscription_status = COALESCE(subscription_status, 'legacy')
WHERE is_active = false AND subscription_status IS NULL;

-- ============================================================
-- 3) Tabla de registros provisionales (pending_registrations)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pending_registrations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Datos cuenta
  email                       text NOT NULL,
  password_hash               text NOT NULL, -- hash bcrypt temporal, se descarta tras crear el usuario
  -- Datos empresa
  nombre_comercial            text NOT NULL,
  razon_social                text,
  nif                         text,
  telefono                    text,
  whatsapp_number             text,
  -- Stripe
  stripe_checkout_session_id  text,
  stripe_customer_id          text,
  stripe_subscription_id      text,
  -- Estado: pending_payment | completed | canceled_checkout | expired | failed
  status                      text NOT NULL DEFAULT 'pending_payment',
  -- Resultado al completar
  company_id                  uuid,
  user_id                     uuid,
  -- Tiempos
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  expires_at                  timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  completed_at                timestamptz,
  raw_payload                 jsonb
);

CREATE INDEX IF NOT EXISTS pending_registrations_status_idx
  ON public.pending_registrations(status);
CREATE INDEX IF NOT EXISTS pending_registrations_session_idx
  ON public.pending_registrations(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS pending_registrations_email_idx
  ON public.pending_registrations(lower(email));

DROP TRIGGER IF EXISTS trg_pending_registrations_touch ON public.pending_registrations;
CREATE TRIGGER trg_pending_registrations_touch
BEFORE UPDATE ON public.pending_registrations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.pending_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff gestiona pending" ON public.pending_registrations;
CREATE POLICY "staff gestiona pending"
ON public.pending_registrations
FOR ALL
USING (public.is_staff(auth.uid()))
WITH CHECK (public.is_staff(auth.uid()));

-- ============================================================
-- 4) Idempotencia de webhooks Stripe
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id            text PRIMARY KEY,        -- evt_... de Stripe
  type          text NOT NULL,
  processed_at  timestamptz NOT NULL DEFAULT now(),
  payload       jsonb
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff ve eventos stripe" ON public.stripe_events;
CREATE POLICY "staff ve eventos stripe"
ON public.stripe_events
FOR SELECT
USING (public.is_staff(auth.uid()));

-- ============================================================
-- 5) Función para purgar registros provisionales caducados
-- ============================================================
CREATE OR REPLACE FUNCTION public.purge_expired_registrations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH del AS (
    DELETE FROM public.pending_registrations
    WHERE status IN ('pending_payment','canceled_checkout','expired','failed')
      AND expires_at < now()
      AND completed_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM del;
  RETURN COALESCE(deleted_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_registrations() FROM public;

-- ============================================================
-- 6) Cron: ejecutar purga cada hora
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_expired_registrations_hourly') THEN
    PERFORM cron.unschedule('purge_expired_registrations_hourly');
  END IF;
  PERFORM cron.schedule(
    'purge_expired_registrations_hourly',
    '0 * * * *',
    $cron$ SELECT public.purge_expired_registrations(); $cron$
  );
END $$;