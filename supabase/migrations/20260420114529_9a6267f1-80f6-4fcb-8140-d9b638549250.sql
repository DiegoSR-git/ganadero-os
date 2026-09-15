-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('superadmin', 'gestor', 'cliente_empresa');
CREATE TYPE public.invoice_status AS ENUM ('borrador', 'enviada', 'cobrada', 'vencida');
CREATE TYPE public.expense_status AS ENUM ('pendiente', 'revisado', 'rechazado');
CREATE TYPE public.message_status AS ENUM ('pendiente', 'procesado', 'error');
CREATE TYPE public.message_kind AS ENUM ('texto', 'imagen', 'documento', 'audio', 'comando');
CREATE TYPE public.subscription_status AS ENUM ('activa', 'pausada', 'cancelada', 'prueba');
CREATE TYPE public.payment_method AS ENUM ('transferencia', 'efectivo', 'bizum', 'tarjeta', 'otro');

-- ============= TIMESTAMP TRIGGER =============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============= COMPANIES =============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_comercial TEXT NOT NULL,
  razon_social TEXT,
  nif TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  whatsapp_number TEXT UNIQUE,
  serie_facturacion TEXT NOT NULL DEFAULT 'A',
  iva_default NUMERIC(5,2) NOT NULL DEFAULT 21,
  gestoria_nombre TEXT,
  gestoria_email TEXT,
  gestoria_telefono TEXT,
  estado_suscripcion public.subscription_status NOT NULL DEFAULT 'prueba',
  notas_internas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= USER ROLES =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, company_id)
);

-- ============= PROFILES =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  current_company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= SECURITY DEFINER FUNCTIONS =============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.user_has_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND company_id = _company_id
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin','gestor')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('superadmin','gestor')
  )
$$;

-- ============= CLIENTS =============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  nif TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_clients_company ON public.clients(company_id);

-- ============= INVOICES =============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  numero TEXT NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  concepto TEXT NOT NULL,
  base_imponible NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 21,
  iva_importe NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado public.invoice_status NOT NULL DEFAULT 'borrador',
  metodo_pago public.payment_method,
  notas TEXT,
  pdf_path TEXT,
  fecha_cobro DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, numero)
);
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_invoices_company ON public.invoices(company_id);
CREATE INDEX idx_invoices_estado ON public.invoices(estado);
CREATE INDEX idx_invoices_fecha ON public.invoices(fecha);

-- ============= EXPENSES =============
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  proveedor TEXT,
  concepto TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'otros',
  base_imponible NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 21,
  iva_importe NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  archivo_path TEXT,
  estado public.expense_status NOT NULL DEFAULT 'pendiente',
  observaciones TEXT,
  origen TEXT NOT NULL DEFAULT 'manual', -- manual | whatsapp | ocr
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_expenses_updated BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_expenses_company ON public.expenses(company_id);
CREATE INDEX idx_expenses_fecha ON public.expenses(fecha);

-- ============= WHATSAPP MESSAGES =============
CREATE TABLE public.wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  remitente TEXT NOT NULL,
  to_number TEXT,
  texto TEXT,
  tipo public.message_kind NOT NULL DEFAULT 'texto',
  adjunto_path TEXT,
  estado public.message_status NOT NULL DEFAULT 'pendiente',
  comando TEXT,
  resultado JSONB,
  recibido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_company ON public.wa_messages(company_id);
CREATE INDEX idx_wa_estado ON public.wa_messages(estado);

-- ============= MONTHLY DOCS / GESTORIA =============
CREATE TABLE public.monthly_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  mes INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  mes_listo BOOLEAN NOT NULL DEFAULT false,
  trimestre_listo BOOLEAN NOT NULL DEFAULT false,
  enviado_gestoria_en TIMESTAMPTZ,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, anio, mes)
);
CREATE TRIGGER trg_closures_updated BEFORE UPDATE ON public.monthly_closures
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============= AUDIT LOG =============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  accion TEXT NOT NULL,
  entidad TEXT,
  entidad_id UUID,
  detalle JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_company ON public.audit_log(company_id);

-- ============= HANDLE NEW USER (auto profile) =============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= ENABLE RLS =============
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============= POLICIES =============
-- companies
CREATE POLICY "staff ve todas las empresas" ON public.companies FOR SELECT
USING (public.is_staff(auth.uid()) OR public.user_has_company(auth.uid(), id));
CREATE POLICY "staff gestiona empresas" ON public.companies FOR ALL
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- user_roles
CREATE POLICY "ver propios roles" ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "staff gestiona roles" ON public.user_roles FOR ALL
USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- profiles
CREATE POLICY "ver propio profile" ON public.profiles FOR SELECT
USING (auth.uid() = user_id OR public.is_staff(auth.uid()));
CREATE POLICY "actualizar propio profile" ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);
CREATE POLICY "insertar propio profile" ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- clients
CREATE POLICY "ver clientes empresa" ON public.clients FOR SELECT
USING (public.user_has_company(auth.uid(), company_id));
CREATE POLICY "gestionar clientes empresa" ON public.clients FOR ALL
USING (public.user_has_company(auth.uid(), company_id))
WITH CHECK (public.user_has_company(auth.uid(), company_id));

-- invoices
CREATE POLICY "ver facturas empresa" ON public.invoices FOR SELECT
USING (public.user_has_company(auth.uid(), company_id));
CREATE POLICY "gestionar facturas empresa" ON public.invoices FOR ALL
USING (public.user_has_company(auth.uid(), company_id))
WITH CHECK (public.user_has_company(auth.uid(), company_id));

-- expenses
CREATE POLICY "ver gastos empresa" ON public.expenses FOR SELECT
USING (public.user_has_company(auth.uid(), company_id));
CREATE POLICY "gestionar gastos empresa" ON public.expenses FOR ALL
USING (public.user_has_company(auth.uid(), company_id))
WITH CHECK (public.user_has_company(auth.uid(), company_id));

-- wa_messages
CREATE POLICY "ver mensajes empresa" ON public.wa_messages FOR SELECT
USING (public.user_has_company(auth.uid(), company_id) OR public.is_staff(auth.uid()));
CREATE POLICY "gestionar mensajes empresa" ON public.wa_messages FOR ALL
USING (public.user_has_company(auth.uid(), company_id) OR public.is_staff(auth.uid()))
WITH CHECK (public.user_has_company(auth.uid(), company_id) OR public.is_staff(auth.uid()));

-- monthly_closures
CREATE POLICY "ver cierres empresa" ON public.monthly_closures FOR SELECT
USING (public.user_has_company(auth.uid(), company_id));
CREATE POLICY "gestionar cierres empresa" ON public.monthly_closures FOR ALL
USING (public.user_has_company(auth.uid(), company_id))
WITH CHECK (public.user_has_company(auth.uid(), company_id));

-- audit_log
CREATE POLICY "ver audit empresa" ON public.audit_log FOR SELECT
USING (public.user_has_company(auth.uid(), company_id) OR public.is_staff(auth.uid()));
CREATE POLICY "insertar audit" ON public.audit_log FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_staff(auth.uid()));

-- ============= STORAGE BUCKETS =============
INSERT INTO storage.buckets (id, name, public) VALUES ('expenses', 'expenses', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('wa-attachments', 'wa-attachments', false) ON CONFLICT DO NOTHING;

CREATE POLICY "lectura archivos expenses propios" ON storage.objects FOR SELECT
USING (bucket_id = 'expenses' AND (
  public.is_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id::text = (storage.foldername(name))[1])
));
CREATE POLICY "subir archivos expenses propios" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'expenses' AND (
  public.is_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id::text = (storage.foldername(name))[1])
));

CREATE POLICY "lectura archivos invoices propios" ON storage.objects FOR SELECT
USING (bucket_id = 'invoices' AND (
  public.is_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id::text = (storage.foldername(name))[1])
));
CREATE POLICY "subir archivos invoices propios" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoices' AND (
  public.is_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id::text = (storage.foldername(name))[1])
));

CREATE POLICY "lectura wa attachments staff/empresa" ON storage.objects FOR SELECT
USING (bucket_id = 'wa-attachments' AND (
  public.is_staff(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.company_id::text = (storage.foldername(name))[1])
));