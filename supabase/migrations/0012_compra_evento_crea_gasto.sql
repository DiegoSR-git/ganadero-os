ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS explotacion_id uuid REFERENCES public.explotaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS animal_id uuid REFERENCES public.animales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.expenses ALTER COLUMN company_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expenses_idem_uidx
  ON public.expenses (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_evento_animal(
  _explotacion_id uuid,
  _tipo_evento text,
  _fecha date,
  _animal_id uuid DEFAULT NULL,
  _descripcion text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _lote_id uuid DEFAULT NULL,
  _peso numeric DEFAULT NULL,
  _importe numeric DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _origen text DEFAULT 'web'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _a record;
  _evento_id uuid;
  _existente uuid;
  _estado text;
  _ingreso_id uuid;
  _gasto_id uuid;
  _meta jsonb := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _explotacion_id IS NULL THEN RAISE EXCEPTION 'Falta la explotación'; END IF;
  IF _uid IS NOT NULL AND NOT public.user_in_explotacion(_uid, _explotacion_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta explotación';
  END IF;
  IF _tipo_evento = 'parto' THEN
    RAISE EXCEPTION 'Los partos se registran con registrar_parto para crear también las crías';
  END IF;
  IF _fecha IS NULL THEN _fecha := (now() AT TIME ZONE 'Europe/Madrid')::date; END IF;
  IF _fecha > (now() AT TIME ZONE 'Europe/Madrid')::date THEN
    RAISE EXCEPTION 'La fecha no puede ser futura';
  END IF;
  IF _peso IS NOT NULL AND (_peso <= 0 OR _peso > 3000) THEN
    RAISE EXCEPTION 'Peso no válido';
  END IF;
  IF _importe IS NOT NULL AND _importe < 0 THEN
    RAISE EXCEPTION 'Importe no válido';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existente FROM public.eventos_animales
     WHERE explotacion_id = _explotacion_id AND idempotency_key = _idempotency_key LIMIT 1;
    IF _existente IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicado', true, 'evento_id', _existente);
    END IF;
  END IF;

  IF _animal_id IS NOT NULL THEN
    SELECT * INTO _a FROM public.animales
      WHERE id = _animal_id AND explotacion_id = _explotacion_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Animal no encontrado en esta explotación'; END IF;
    IF _tipo_evento IN ('venta','baja') AND _a.estado <> 'activo' THEN
      RAISE EXCEPTION 'El animal % ya está dado de baja', _a.crotal;
    END IF;
  END IF;

  IF _lote_id IS NOT NULL THEN
    PERFORM 1 FROM public.lotes WHERE id = _lote_id AND explotacion_id = _explotacion_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El lote no pertenece a esta explotación'; END IF;
  END IF;

  _estado := CASE _tipo_evento
    WHEN 'incidencia' THEN 'abierto'
    WHEN 'tratamiento' THEN 'activo'
    ELSE 'cerrado' END;

  IF _peso IS NOT NULL THEN _meta := _meta || jsonb_build_object('peso_kg', _peso); END IF;
  IF _importe IS NOT NULL THEN _meta := _meta || jsonb_build_object('importe', _importe); END IF;
  IF _lote_id IS NOT NULL THEN _meta := _meta || jsonb_build_object('lote_id', _lote_id); END IF;
  _meta := _meta || jsonb_build_object('origen', _origen);

  INSERT INTO public.eventos_animales (
    explotacion_id, animal_id, tipo_evento, fecha, descripcion, metadata, estado, created_by, idempotency_key
  ) VALUES (
    _explotacion_id, _animal_id, _tipo_evento, _fecha, _descripcion, _meta, _estado, _uid, _idempotency_key
  ) RETURNING id INTO _evento_id;

  IF _animal_id IS NOT NULL THEN
    IF _tipo_evento = 'pesaje' AND _peso IS NOT NULL THEN
      UPDATE public.animales SET peso_actual = _peso WHERE id = _animal_id;
    ELSIF _tipo_evento IN ('cambio_lote','movimiento') AND _lote_id IS NOT NULL THEN
      UPDATE public.animales SET lote_id = _lote_id WHERE id = _animal_id;
    ELSIF _tipo_evento IN ('venta','baja') THEN
      UPDATE public.animales
         SET estado = 'baja', fecha_baja = _fecha, motivo_baja = _tipo_evento,
             estado_reproductivo = 'no_aplica'
       WHERE id = _animal_id;
      IF _tipo_evento = 'venta' AND _importe IS NOT NULL AND _importe > 0 THEN
        INSERT INTO public.ingresos (
          explotacion_id, fecha, concepto, categoria, importe, animal_id, created_by, idempotency_key
        ) VALUES (
          _explotacion_id, _fecha, 'Venta de ' || _a.crotal, 'venta_animales', _importe,
          _animal_id, _uid,
          CASE WHEN _idempotency_key IS NULL THEN NULL ELSE _idempotency_key || ':ingreso' END
        ) RETURNING id INTO _ingreso_id;
      END IF;
    ELSIF _tipo_evento = 'compra' AND _importe IS NOT NULL AND _importe > 0 THEN
      INSERT INTO public.expenses (
        explotacion_id, fecha, proveedor, concepto, categoria,
        base_imponible, iva_porcentaje, iva_importe, total,
        origen, lote_id, animal_id, observaciones, idempotency_key
      ) VALUES (
        _explotacion_id, _fecha, NULL, 'Compra de ' || _a.crotal, 'compra_animales',
        round((_importe / 1.21)::numeric, 2), 21, round((_importe - (_importe / 1.21))::numeric, 2), _importe,
        _origen, COALESCE(_lote_id, _a.lote_id), _animal_id, _descripcion,
        CASE WHEN _idempotency_key IS NULL THEN NULL ELSE _idempotency_key || ':gasto' END
      ) RETURNING id INTO _gasto_id;
    END IF;
  ELSIF _tipo_evento = 'compra' AND _importe IS NOT NULL AND _importe > 0 THEN
    INSERT INTO public.expenses (
      explotacion_id, fecha, proveedor, concepto, categoria,
      base_imponible, iva_porcentaje, iva_importe, total,
      origen, lote_id, animal_id, observaciones, idempotency_key
    ) VALUES (
      _explotacion_id, _fecha, NULL, 'Compra de animal', 'compra_animales',
      round((_importe / 1.21)::numeric, 2), 21, round((_importe - (_importe / 1.21))::numeric, 2), _importe,
      _origen, _lote_id, NULL, _descripcion,
      CASE WHEN _idempotency_key IS NULL THEN NULL ELSE _idempotency_key || ':gasto' END
    ) RETURNING id INTO _gasto_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'duplicado', false, 'evento_id', _evento_id, 'ingreso_id', _ingreso_id, 'gasto_id', _gasto_id
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.registrar_evento_animal(uuid,text,date,uuid,text,jsonb,uuid,numeric,numeric,text,text) TO authenticated, service_role;

INSERT INTO public.expenses (
  explotacion_id, fecha, proveedor, concepto, categoria,
  base_imponible, iva_porcentaje, iva_importe, total,
  origen, lote_id, animal_id, observaciones, idempotency_key
)
SELECT
  e.explotacion_id,
  e.fecha,
  NULL,
  COALESCE('Compra de ' || a.crotal, 'Compra de animal'),
  'compra_animales',
  round(((e.metadata->>'importe')::numeric / 1.21)::numeric, 2),
  21,
  round(((e.metadata->>'importe')::numeric - ((e.metadata->>'importe')::numeric / 1.21))::numeric, 2),
  (e.metadata->>'importe')::numeric,
  COALESCE(e.metadata->>'origen', 'web'),
  COALESCE((e.metadata->>'lote_id')::uuid, a.lote_id),
  e.animal_id,
  e.descripcion,
  CASE WHEN e.idempotency_key IS NULL THEN 'evento:' || e.id::text || ':gasto' ELSE e.idempotency_key || ':gasto' END
FROM public.eventos_animales e
LEFT JOIN public.animales a ON a.id = e.animal_id
WHERE e.tipo_evento = 'compra'
  AND e.metadata ? 'importe'
  AND (e.metadata->>'importe')::numeric > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.expenses x
    WHERE x.explotacion_id = e.explotacion_id
      AND x.animal_id IS NOT DISTINCT FROM e.animal_id
      AND x.fecha = e.fecha
      AND x.total = (e.metadata->>'importe')::numeric
      AND x.categoria = 'compra_animales'
      AND x.concepto = COALESCE('Compra de ' || a.crotal, 'Compra de animal')
  )
ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
