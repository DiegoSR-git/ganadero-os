
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_factura_template_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_factura_template_check
  CHECK (factura_template = ANY (ARRAY['profesional','creativa','corporativa','elegante','personalizada']));
