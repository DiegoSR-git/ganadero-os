-- Tabla de líneas de factura
CREATE TABLE public.invoice_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  orden int NOT NULL DEFAULT 0,
  concepto text NOT NULL,
  cantidad numeric NOT NULL DEFAULT 1,
  precio_unitario numeric NOT NULL DEFAULT 0,
  importe numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_lines_invoice ON public.invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_company ON public.invoice_lines(company_id);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver lineas factura empresa"
ON public.invoice_lines FOR SELECT
USING (public.user_has_company(auth.uid(), company_id));

CREATE POLICY "gestionar lineas factura empresa"
ON public.invoice_lines FOR ALL
USING (public.user_has_company(auth.uid(), company_id))
WITH CHECK (public.user_has_company(auth.uid(), company_id));

CREATE TRIGGER trg_invoice_lines_updated_at
BEFORE UPDATE ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();