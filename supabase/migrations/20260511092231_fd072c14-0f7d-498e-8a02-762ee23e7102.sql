
-- 1) Añadir valor al enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestoria';

-- 2) Tabla gestorias
CREATE TABLE IF NOT EXISTS public.gestorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  nombre text NOT NULL,
  nif text,
  email text NOT NULL,
  telefono text,
  direccion text,
  codigo_postal text,
  ciudad text,
  provincia text,
  notas text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  subscription_status text,
  current_period_end timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  max_empresas integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Si la tabla ya existía de una ejecución/migración previa, asegurar columnas esperadas.
ALTER TABLE public.gestorias
  ADD COLUMN IF NOT EXISTS nif text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS provincia text,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_empresas integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_gestorias_user ON public.gestorias(user_id);
CREATE INDEX IF NOT EXISTS idx_gestorias_email ON public.gestorias(lower(email));

ALTER TABLE public.gestorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver propia gestoria"
ON public.gestorias;

CREATE POLICY "ver propia gestoria"
  ON public.gestorias FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "editar propia gestoria"
ON public.gestorias;

CREATE POLICY "editar propia gestoria"
  ON public.gestorias FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "staff gestiona gestorias"
ON public.gestorias;

CREATE POLICY "staff gestiona gestorias"
  ON public.gestorias FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP TRIGGER IF EXISTS trg_gestorias_touch ON public.gestorias;
CREATE TRIGGER trg_gestorias_touch
  BEFORE UPDATE ON public.gestorias
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Añadir columna gestoria_id a companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS gestoria_id uuid REFERENCES public.gestorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_companies_gestoria ON public.companies(gestoria_id);

-- 4) Tabla de vínculos
CREATE TABLE IF NOT EXISTS public.gestoria_empresa_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gestoria_id uuid NOT NULL REFERENCES public.gestorias(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','revoked')),
  requested_by text NOT NULL DEFAULT 'empresa' CHECK (requested_by IN ('empresa','gestoria','auto')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gestoria_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_gel_gestoria ON public.gestoria_empresa_links(gestoria_id);
CREATE INDEX IF NOT EXISTS idx_gel_company ON public.gestoria_empresa_links(company_id);
CREATE INDEX IF NOT EXISTS idx_gel_status ON public.gestoria_empresa_links(status);

ALTER TABLE public.gestoria_empresa_links ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_gel_touch ON public.gestoria_empresa_links;
CREATE TRIGGER trg_gel_touch
  BEFORE UPDATE ON public.gestoria_empresa_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5) Funciones de seguridad
CREATE OR REPLACE FUNCTION public.user_owns_gestoria(_user_id uuid, _gestoria_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.gestorias WHERE id = _gestoria_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.gestoria_manages_company(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gestoria_empresa_links gel
    JOIN public.gestorias g ON g.id = gel.gestoria_id
    WHERE gel.company_id = _company_id
      AND gel.status = 'accepted'
      AND g.user_id = _user_id
      AND g.is_active = true
  );
$$;

-- Actualizar user_has_company para incluir gestorías que gestionen la empresa
CREATE OR REPLACE FUNCTION public.user_has_company(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin','gestor')
  ) OR public.gestoria_manages_company(_user_id, _company_id);
$$;

-- Política RLS para gestoria_empresa_links: visible por gestoría y por empresa
DROP POLICY IF EXISTS "gestoria ve sus links"
  ON public.gestoria_empresa_links;

CREATE POLICY "gestoria ve sus links"
  ON public.gestoria_empresa_links FOR SELECT TO authenticated
  USING (
    public.user_owns_gestoria(auth.uid(), gestoria_id)
    OR public.user_has_company(auth.uid(), company_id)
    OR public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "gestoria gestiona sus links"
  ON public.gestoria_empresa_links;

CREATE POLICY "gestoria gestiona sus links"
  ON public.gestoria_empresa_links FOR ALL TO authenticated
  USING (
    public.user_owns_gestoria(auth.uid(), gestoria_id)
    OR public.user_has_company(auth.uid(), company_id)
    OR public.is_staff(auth.uid())
  )
  WITH CHECK (
    public.user_owns_gestoria(auth.uid(), gestoria_id)
    OR public.user_has_company(auth.uid(), company_id)
    OR public.is_staff(auth.uid())
  );

-- 6) Trigger que sincroniza companies.gestoria_id al cambiar estado del link
CREATE OR REPLACE FUNCTION public.sync_company_gestoria_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'accepted')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted') THEN
    -- Revocar otros links accepted de la misma empresa
    UPDATE public.gestoria_empresa_links
       SET status = 'revoked', decided_at = now()
     WHERE company_id = NEW.company_id
       AND id <> NEW.id
       AND status = 'accepted';
    UPDATE public.companies SET gestoria_id = NEW.gestoria_id WHERE id = NEW.company_id;
    NEW.decided_at := COALESCE(NEW.decided_at, now());
  ELSIF (TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status IN ('rejected','revoked','pending')) THEN
    UPDATE public.companies SET gestoria_id = NULL WHERE id = NEW.company_id AND gestoria_id = NEW.gestoria_id;
    NEW.decided_at := COALESCE(NEW.decided_at, now());
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IN ('rejected','revoked') AND OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.decided_at := COALESCE(NEW.decided_at, now());
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_company_gestoria_link ON public.gestoria_empresa_links;
CREATE TRIGGER trg_sync_company_gestoria_link
  BEFORE INSERT OR UPDATE ON public.gestoria_empresa_links
  FOR EACH ROW EXECUTE FUNCTION public.sync_company_gestoria_link();

-- 7) Función para registrar una gestoría desde el alta
CREATE OR REPLACE FUNCTION public.signup_create_gestoria(
  _nombre text,
  _email text,
  _nif text DEFAULT NULL,
  _telefono text DEFAULT NULL,
  _direccion text DEFAULT NULL,
  _codigo_postal text DEFAULT NULL,
  _ciudad text DEFAULT NULL,
  _provincia text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _gid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _nombre IS NULL OR length(trim(_nombre)) = 0 THEN RAISE EXCEPTION 'Nombre obligatorio'; END IF;
  IF _email IS NULL OR length(trim(_email)) = 0 THEN RAISE EXCEPTION 'Email obligatorio'; END IF;

  SELECT id INTO _gid FROM public.gestorias WHERE user_id = _uid;
  IF _gid IS NOT NULL THEN RETURN _gid; END IF;

  INSERT INTO public.gestorias (user_id, nombre, email, nif, telefono, direccion, codigo_postal, ciudad, provincia)
  VALUES (_uid, trim(_nombre), lower(trim(_email)),
          NULLIF(upper(trim(coalesce(_nif,''))),''),
          NULLIF(trim(coalesce(_telefono,'')),''),
          NULLIF(trim(coalesce(_direccion,'')),''),
          NULLIF(trim(coalesce(_codigo_postal,'')),''),
          NULLIF(trim(coalesce(_ciudad,'')),''),
          NULLIF(trim(coalesce(_provincia,'')),''))
  RETURNING id INTO _gid;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'gestoria')
  ON CONFLICT DO NOTHING;

  RETURN _gid;
END; $$;

-- 8) Empresa solicita vinculación a una gestoría por email
CREATE OR REPLACE FUNCTION public.request_gestoria_link(_company_id uuid, _gestoria_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _gid uuid;
  _link_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.user_has_company(_uid, _company_id) THEN RAISE EXCEPTION 'Sin permiso sobre esta empresa'; END IF;

  SELECT id INTO _gid FROM public.gestorias WHERE lower(email) = lower(trim(_gestoria_email)) LIMIT 1;
  IF _gid IS NULL THEN RAISE EXCEPTION 'No hay ninguna gestoría registrada con ese email'; END IF;

  INSERT INTO public.gestoria_empresa_links (gestoria_id, company_id, status, requested_by)
  VALUES (_gid, _company_id, 'pending', 'empresa')
  ON CONFLICT (gestoria_id, company_id) DO UPDATE
    SET status = CASE WHEN public.gestoria_empresa_links.status IN ('rejected','revoked')
                      THEN 'pending'
                      ELSE public.gestoria_empresa_links.status END,
        requested_by = 'empresa',
        requested_at = now()
  RETURNING id INTO _link_id;

  RETURN _link_id;
END; $$;

-- 9) Gestoría invita a una empresa por email
CREATE OR REPLACE FUNCTION public.gestoria_invite_company(_company_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _gid uuid;
  _cid uuid;
  _link_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  SELECT id INTO _gid FROM public.gestorias WHERE user_id = _uid;
  IF _gid IS NULL THEN RAISE EXCEPTION 'No eres titular de ninguna gestoría'; END IF;

  SELECT id INTO _cid FROM public.companies WHERE lower(email) = lower(trim(_company_email)) LIMIT 1;
  IF _cid IS NULL THEN RAISE EXCEPTION 'No hay ninguna empresa registrada con ese email'; END IF;

  INSERT INTO public.gestoria_empresa_links (gestoria_id, company_id, status, requested_by)
  VALUES (_gid, _cid, 'pending', 'gestoria')
  ON CONFLICT (gestoria_id, company_id) DO UPDATE
    SET status = CASE WHEN public.gestoria_empresa_links.status IN ('rejected','revoked')
                      THEN 'pending'
                      ELSE public.gestoria_empresa_links.status END,
        requested_by = 'gestoria',
        requested_at = now()
  RETURNING id INTO _link_id;

  RETURN _link_id;
END; $$;

-- 10) Decidir un vínculo (aceptar/rechazar/revocar)
CREATE OR REPLACE FUNCTION public.decide_gestoria_link(_link_id uuid, _decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _link record;
  _is_gestoria boolean;
  _is_company boolean;
  _count integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _decision NOT IN ('accepted','rejected','revoked') THEN RAISE EXCEPTION 'Decisión no válida'; END IF;

  SELECT * INTO _link FROM public.gestoria_empresa_links WHERE id = _link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo no encontrado'; END IF;

  SELECT public.user_owns_gestoria(_uid, _link.gestoria_id) INTO _is_gestoria;
  SELECT public.user_has_company(_uid, _link.company_id) INTO _is_company;

  IF NOT (_is_gestoria OR _is_company OR public.is_staff(_uid)) THEN
    RAISE EXCEPTION 'Sin permiso';
  END IF;

  -- Reglas: una empresa puede revocar/rechazar, una gestoría puede aceptar/rechazar/revocar
  IF _decision = 'accepted' AND NOT _is_gestoria AND NOT public.is_staff(_uid) THEN
    RAISE EXCEPTION 'Solo la gestoría puede aceptar';
  END IF;

  -- Comprobar límite de plazas al aceptar
  IF _decision = 'accepted' THEN
    SELECT count(*) INTO _count FROM public.gestoria_empresa_links
      WHERE gestoria_id = _link.gestoria_id AND status = 'accepted' AND id <> _link_id;
    IF _count >= (SELECT max_empresas FROM public.gestorias WHERE id = _link.gestoria_id) THEN
      RAISE EXCEPTION 'Has alcanzado el máximo de empresas vinculadas';
    END IF;
  END IF;

  UPDATE public.gestoria_empresa_links
     SET status = _decision, decided_at = now()
   WHERE id = _link_id;
END; $$;

-- 11) Lista empresas vinculadas a la gestoría del usuario actual
CREATE OR REPLACE FUNCTION public.gestoria_listar_empresas()
RETURNS TABLE (
  link_id uuid, status text, requested_by text, requested_at timestamptz, decided_at timestamptz,
  company_id uuid, nombre_comercial text, nif text, email text, whatsapp_number text,
  estado_suscripcion text, is_active boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gel.id, gel.status, gel.requested_by, gel.requested_at, gel.decided_at,
         c.id, c.nombre_comercial, c.nif, c.email, c.whatsapp_number,
         c.estado_suscripcion::text, c.is_active
    FROM public.gestoria_empresa_links gel
    JOIN public.companies c ON c.id = gel.company_id
    JOIN public.gestorias g ON g.id = gel.gestoria_id
   WHERE g.user_id = auth.uid()
   ORDER BY gel.requested_at DESC;
$$;
