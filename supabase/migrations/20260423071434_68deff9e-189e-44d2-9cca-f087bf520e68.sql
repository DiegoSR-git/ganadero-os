ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS factura_template text NOT NULL DEFAULT 'profesional';

ALTER TABLE public.companies
DROP CONSTRAINT IF EXISTS companies_factura_template_check;

ALTER TABLE public.companies
ADD CONSTRAINT companies_factura_template_check
CHECK (factura_template IN ('profesional','creativa','corporativa','elegante'));