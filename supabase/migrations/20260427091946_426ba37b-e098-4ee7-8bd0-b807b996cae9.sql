-- 1) COMPANIES: dirección fiscal completa + IRPF por defecto
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS provincia text,
  ADD COLUMN IF NOT EXISTS irpf_default numeric NOT NULL DEFAULT 0;

-- 2) CLIENTS: dirección fiscal completa
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS ciudad text,
  ADD COLUMN IF NOT EXISTS provincia text;

-- 3) INVOICES: fecha de operación, IRPF, rectificativas, mención legal, serie
DO $$ BEGIN
  CREATE TYPE public.invoice_tipo AS ENUM ('ordinaria','rectificativa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS fecha_operacion date,
  ADD COLUMN IF NOT EXISTS irpf_porcentaje numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS irpf_importe numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo public.invoice_tipo NOT NULL DEFAULT 'ordinaria',
  ADD COLUMN IF NOT EXISTS factura_rectificada_id uuid,
  ADD COLUMN IF NOT EXISTS motivo_rectificacion text,
  ADD COLUMN IF NOT EXISTS mencion_legal text,
  ADD COLUMN IF NOT EXISTS serie text NOT NULL DEFAULT 'A';

-- 4) INVOICE_LINES: cantidad/precio/IVA/descuento por línea
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS iva_porcentaje numeric NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS descuento_porcentaje numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_importe numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric NOT NULL DEFAULT 0;

-- 5) Inmutabilidad: bloquear UPDATE/DELETE en facturas no-borrador
CREATE OR REPLACE FUNCTION public.invoices_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION 'No se puede eliminar una factura emitida (%). Emite una factura rectificativa.', OLD.numero;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE
  IF OLD.estado = 'borrador' THEN
    RETURN NEW;
  END IF;

  -- Si ya estaba emitida: solo se permite cambiar estado/fecha_cobro/pdf_path/updated_at
  IF NEW.numero IS DISTINCT FROM OLD.numero
     OR NEW.serie IS DISTINCT FROM OLD.serie
     OR NEW.fecha IS DISTINCT FROM OLD.fecha
     OR NEW.fecha_operacion IS DISTINCT FROM OLD.fecha_operacion
     OR NEW.fecha_vencimiento IS DISTINCT FROM OLD.fecha_vencimiento
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.concepto IS DISTINCT FROM OLD.concepto
     OR NEW.base_imponible IS DISTINCT FROM OLD.base_imponible
     OR NEW.iva_porcentaje IS DISTINCT FROM OLD.iva_porcentaje
     OR NEW.iva_importe IS DISTINCT FROM OLD.iva_importe
     OR NEW.irpf_porcentaje IS DISTINCT FROM OLD.irpf_porcentaje
     OR NEW.irpf_importe IS DISTINCT FROM OLD.irpf_importe
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.factura_rectificada_id IS DISTINCT FROM OLD.factura_rectificada_id
     OR NEW.motivo_rectificacion IS DISTINCT FROM OLD.motivo_rectificacion
     OR NEW.mencion_legal IS DISTINCT FROM OLD.mencion_legal
     OR NEW.notas IS DISTINCT FROM OLD.notas
     OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
  THEN
    RAISE EXCEPTION 'Factura % ya emitida: solo se puede modificar el cobro. Para corregirla, emite una factura rectificativa.', OLD.numero;
  END IF;

  -- No permitir volver a "borrador" desde un estado emitido
  IF NEW.estado = 'borrador' AND OLD.estado <> 'borrador' THEN
    RAISE EXCEPTION 'No se puede revertir una factura emitida a borrador.';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_invoices_immutability ON public.invoices;
CREATE TRIGGER trg_invoices_immutability
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_enforce_immutability();

-- 6) Inmutabilidad de líneas: si la factura no está en borrador, no se modifican ni borran
CREATE OR REPLACE FUNCTION public.invoice_lines_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _estado text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT estado::text INTO _estado FROM public.invoices WHERE id = OLD.invoice_id;
    IF _estado IS NOT NULL AND _estado <> 'borrador' THEN
      RAISE EXCEPTION 'No se pueden eliminar líneas de una factura emitida. Emite una factura rectificativa.';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT estado::text INTO _estado FROM public.invoices WHERE id = OLD.invoice_id;
    IF _estado IS NOT NULL AND _estado <> 'borrador' THEN
      RAISE EXCEPTION 'No se pueden modificar líneas de una factura emitida. Emite una factura rectificativa.';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    SELECT estado::text INTO _estado FROM public.invoices WHERE id = NEW.invoice_id;
    IF _estado IS NOT NULL AND _estado <> 'borrador' THEN
      RAISE EXCEPTION 'No se pueden añadir líneas a una factura emitida. Emite una factura rectificativa.';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_invoice_lines_immutability ON public.invoice_lines;
CREATE TRIGGER trg_invoice_lines_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.invoice_lines_enforce_immutability();

-- 7) Índice para búsqueda de rectificativas
CREATE INDEX IF NOT EXISTS idx_invoices_factura_rectificada ON public.invoices(factura_rectificada_id);