CREATE OR REPLACE FUNCTION public.signup_create_company(
  _nombre_comercial text,
  _razon_social text DEFAULT NULL,
  _nif text DEFAULT NULL,
  _telefono text DEFAULT NULL,
  _email text DEFAULT NULL,
  _whatsapp_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF _nombre_comercial IS NULL OR length(trim(_nombre_comercial)) = 0 THEN
    RAISE EXCEPTION 'El nombre comercial es obligatorio';
  END IF;

  -- Si el usuario ya tiene una empresa asignada, devolverla
  SELECT company_id INTO _company_id
  FROM public.user_roles
  WHERE user_id = _uid AND company_id IS NOT NULL
  LIMIT 1;

  IF _company_id IS NOT NULL THEN
    RETURN _company_id;
  END IF;

  INSERT INTO public.companies (
    nombre_comercial, razon_social, nif, telefono, email, whatsapp_number
  ) VALUES (
    trim(_nombre_comercial),
    NULLIF(trim(coalesce(_razon_social,'')), ''),
    NULLIF(upper(trim(coalesce(_nif,''))), ''),
    NULLIF(trim(coalesce(_telefono,'')), ''),
    NULLIF(trim(coalesce(_email,'')), ''),
    NULLIF(trim(coalesce(_whatsapp_number,'')), '')
  )
  RETURNING id INTO _company_id;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (_uid, _company_id, 'cliente_empresa');

  UPDATE public.profiles
  SET current_company_id = _company_id
  WHERE user_id = _uid;

  RETURN _company_id;
END;
$$;