-- Auditoría GanaderOS · Integridad, atomicidad e idempotencia (aditivo; CHECK NOT VALID)

ALTER TABLE public.animales DROP CONSTRAINT IF EXISTS animales_no_autoprogenitor_chk;
ALTER TABLE public.animales ADD CONSTRAINT animales_no_autoprogenitor_chk
  CHECK (madre_id IS DISTINCT FROM id AND padre_id IS DISTINCT FROM id) NOT VALID;

ALTER TABLE public.animales DROP CONSTRAINT IF EXISTS animales_peso_chk;
ALTER TABLE public.animales ADD CONSTRAINT animales_peso_chk
  CHECK (peso_actual IS NULL OR (peso_actual > 0 AND peso_actual <= 3000)) NOT VALID;

ALTER TABLE public.animales DROP CONSTRAINT IF EXISTS animales_fechas_chk;
ALTER TABLE public.animales ADD CONSTRAINT animales_fechas_chk
  CHECK (fecha_baja IS NULL OR fecha_nacimiento IS NULL OR fecha_baja >= fecha_nacimiento) NOT VALID;

ALTER TABLE public.animales DROP CONSTRAINT IF EXISTS animales_estado_baja_chk;
ALTER TABLE public.animales ADD CONSTRAINT animales_estado_baja_chk
  CHECK (estado <> 'baja' OR fecha_baja IS NOT NULL) NOT VALID;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_total_chk;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_total_chk CHECK (total >= 0) NOT VALID;

ALTER TABLE public.ingresos DROP CONSTRAINT IF EXISTS ingresos_importe_chk;
ALTER TABLE public.ingresos ADD CONSTRAINT ingresos_importe_chk CHECK (importe >= 0) NOT VALID;

ALTER TABLE public.fincas DROP CONSTRAINT IF EXISTS fincas_superficie_chk;
ALTER TABLE public.fincas ADD CONSTRAINT fincas_superficie_chk
  CHECK (superficie IS NULL OR superficie >= 0) NOT VALID;

ALTER TABLE public.parcelas DROP CONSTRAINT IF EXISTS parcelas_superficie_chk;
ALTER TABLE public.parcelas ADD CONSTRAINT parcelas_superficie_chk
  CHECK (superficie IS NULL OR superficie >= 0) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ingresos_idem_uidx
  ON public.ingresos (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.animales_validar_coherencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _e uuid;
BEGIN
  IF NEW.lote_id IS NOT NULL THEN
    SELECT explotacion_id INTO _e FROM public.lotes WHERE id = NEW.lote_id;
    IF _e IS DISTINCT FROM NEW.explotacion_id THEN
      RAISE EXCEPTION 'El lote no pertenece a la explotación del animal';
    END IF;
  END IF;
  IF NEW.parcela_id IS NOT NULL THEN
    SELECT explotacion_id INTO _e FROM public.parcelas WHERE id = NEW.parcela_id;
    IF _e IS DISTINCT FROM NEW.explotacion_id THEN
      RAISE EXCEPTION 'La parcela no pertenece a la explotación del animal';
    END IF;
  END IF;
  IF NEW.madre_id IS NOT NULL THEN
    SELECT explotacion_id INTO _e FROM public.animales WHERE id = NEW.madre_id;
    IF _e IS DISTINCT FROM NEW.explotacion_id THEN
      RAISE EXCEPTION 'La madre pertenece a otra explotación';
    END IF;
  END IF;
  IF NEW.padre_id IS NOT NULL THEN
    SELECT explotacion_id INTO _e FROM public.animales WHERE id = NEW.padre_id;
    IF _e IS DISTINCT FROM NEW.explotacion_id THEN
      RAISE EXCEPTION 'El padre pertenece a otra explotación';
    END IF;
  END IF;
  IF NEW.fecha_nacimiento IS NOT NULL
     AND NEW.fecha_nacimiento > ((now() AT TIME ZONE 'Europe/Madrid')::date + 1) THEN
    RAISE EXCEPTION 'La fecha de nacimiento no puede ser futura';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_animales_coherencia ON public.animales;
CREATE TRIGGER trg_animales_coherencia
  BEFORE INSERT OR UPDATE ON public.animales
  FOR EACH ROW EXECUTE FUNCTION public.animales_validar_coherencia();

CREATE OR REPLACE FUNCTION public.eventos_validar_coherencia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE _e uuid;
BEGIN
  IF NEW.animal_id IS NOT NULL THEN
    SELECT explotacion_id INTO _e FROM public.animales WHERE id = NEW.animal_id;
    IF _e IS DISTINCT FROM NEW.explotacion_id THEN
      RAISE EXCEPTION 'El animal no pertenece a esta explotación';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_eventos_coherencia ON public.eventos_animales;
CREATE TRIGGER trg_eventos_coherencia
  BEFORE INSERT OR UPDATE ON public.eventos_animales
  FOR EACH ROW EXECUTE FUNCTION public.eventos_validar_coherencia();

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

CREATE OR REPLACE FUNCTION public.mover_animales_lote(
  _explotacion_id uuid,
  _animal_ids uuid[],
  _lote_id uuid,
  _fecha date DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _origen text DEFAULT 'web'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _fec date := COALESCE(_fecha, (now() AT TIME ZONE 'Europe/Madrid')::date);
  _n integer;
  _lote text;
  _existente uuid;
BEGIN
  IF _uid IS NOT NULL AND NOT public.user_in_explotacion(_uid, _explotacion_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta explotación';
  END IF;
  IF _animal_ids IS NULL OR array_length(_animal_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No has indicado animales';
  END IF;

  SELECT nombre INTO _lote FROM public.lotes WHERE id = _lote_id AND explotacion_id = _explotacion_id;
  IF _lote IS NULL THEN RAISE EXCEPTION 'El lote no pertenece a esta explotación'; END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existente FROM public.eventos_animales
     WHERE explotacion_id = _explotacion_id AND idempotency_key = _idempotency_key LIMIT 1;
    IF _existente IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicado', true, 'movidos', 0);
    END IF;
  END IF;

  PERFORM 1 FROM public.animales
    WHERE id = ANY(_animal_ids) AND explotacion_id = _explotacion_id AND estado = 'activo'
    ORDER BY id FOR UPDATE;

  SELECT count(*) INTO _n FROM public.animales
    WHERE id = ANY(_animal_ids) AND explotacion_id = _explotacion_id AND estado = 'activo';
  IF _n <> array_length(_animal_ids, 1) THEN
    RAISE EXCEPTION 'Alguno de los animales no existe, no está activo o no es de esta explotación';
  END IF;

  UPDATE public.animales SET lote_id = _lote_id
   WHERE id = ANY(_animal_ids) AND explotacion_id = _explotacion_id;

  INSERT INTO public.eventos_animales (
    explotacion_id, animal_id, tipo_evento, fecha, descripcion, metadata, estado, created_by, idempotency_key
  )
  SELECT _explotacion_id, a, 'cambio_lote', _fec, 'Movido al lote ' || _lote,
         jsonb_build_object('lote_id', _lote_id, 'origen', _origen), 'cerrado', _uid,
         CASE WHEN _idempotency_key IS NULL THEN NULL
              ELSE _idempotency_key || ':' || a::text END
    FROM unnest(_animal_ids) AS a;

  RETURN jsonb_build_object('ok', true, 'duplicado', false, 'movidos', _n, 'lote', _lote);
END; $$;

GRANT EXECUTE ON FUNCTION public.mover_animales_lote(uuid,uuid[],uuid,date,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_parto(
  _madre_id uuid,
  _fecha date,
  _crias jsonb DEFAULT '[]'::jsonb,
  _padre_id uuid DEFAULT NULL,
  _dificultad text DEFAULT NULL,
  _observaciones text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _origen text DEFAULT 'web'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _madre record;
  _cria jsonb;
  _crotal text;
  _codigo text;
  _cria_id uuid;
  _vivas integer := 0;
  _creadas jsonb := '[]'::jsonb;
  _evento_id uuid;
  _existente uuid;
BEGIN
  SELECT * INTO _madre FROM public.animales WHERE id = _madre_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Animal no encontrado'; END IF;
  IF _uid IS NOT NULL AND NOT public.user_in_explotacion(_uid, _madre.explotacion_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta explotación';
  END IF;
  IF _madre.estado <> 'activo' THEN RAISE EXCEPTION 'El animal % no está activo', _madre.crotal; END IF;
  IF _fecha IS NULL THEN _fecha := (now() AT TIME ZONE 'Europe/Madrid')::date; END IF;
  IF _fecha > (now() AT TIME ZONE 'Europe/Madrid')::date THEN RAISE EXCEPTION 'La fecha del parto no puede ser futura'; END IF;
  IF _padre_id IS NOT NULL THEN
    PERFORM 1 FROM public.animales WHERE id = _padre_id AND explotacion_id = _madre.explotacion_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El padre indicado no es de esta explotación'; END IF;
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _existente FROM public.eventos_animales
     WHERE explotacion_id = _madre.explotacion_id AND idempotency_key = _idempotency_key LIMIT 1;
    IF _existente IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicado', true, 'evento_id', _existente, 'crias', '[]'::jsonb);
    END IF;
  END IF;

  INSERT INTO public.eventos_animales (
    explotacion_id, animal_id, tipo_evento, fecha, descripcion, metadata, estado, created_by, idempotency_key
  ) VALUES (
    _madre.explotacion_id, _madre_id, 'parto', _fecha,
    COALESCE(_observaciones, 'Parto registrado'),
    jsonb_strip_nulls(jsonb_build_object(
      'numero_crias', jsonb_array_length(_crias),
      'dificultad', _dificultad,
      'padre_id', _padre_id,
      'origen', _origen
    )),
    'cerrado', _uid, _idempotency_key
  ) RETURNING id INTO _evento_id;

  FOR _cria IN SELECT * FROM jsonb_array_elements(_crias) LOOP
    IF COALESCE(_cria->>'estado', 'vivo') <> 'vivo' THEN
      INSERT INTO public.eventos_animales (explotacion_id, animal_id, tipo_evento, fecha, descripcion, metadata, estado, created_by)
      VALUES (_madre.explotacion_id, _madre_id, 'incidencia', _fecha,
              'Cría nacida ' || COALESCE(_cria->>'estado','muerta'),
              jsonb_build_object('parto_evento_id', _evento_id, 'sexo', _cria->>'sexo'), 'cerrado', _uid);
      CONTINUE;
    END IF;

    _vivas := _vivas + 1;
    _crotal := NULLIF(trim(COALESCE(_cria->>'crotal','')), '');
    _codigo := NULL;
    IF _crotal IS NULL THEN
      _codigo := 'TEMP-' || lpad(nextval('public.cria_temp_seq')::text, 5, '0');
      _crotal := 'CRÍA ' || _codigo;
    END IF;

    INSERT INTO public.animales (
      explotacion_id, crotal, codigo_temporal, crotal_pendiente, especie, sexo, raza, raza_id,
      fecha_nacimiento, fecha_alta, madre_id, padre_id, lote_id, parcela_id, origen, estado,
      peso_actual, estado_reproductivo
    ) VALUES (
      _madre.explotacion_id, _crotal, _codigo, _codigo IS NOT NULL,
      _madre.especie, COALESCE(_cria->>'sexo','hembra'), _madre.raza, _madre.raza_id,
      _fecha, _fecha, _madre_id, _padre_id,
      COALESCE((SELECT lote_crias_id FROM public.explotaciones WHERE id = _madre.explotacion_id), _madre.lote_id),
      _madre.parcela_id, 'nacido', 'activo',
      NULLIF(_cria->>'peso','')::numeric, 'no_aplica'
    ) RETURNING id INTO _cria_id;

    INSERT INTO public.eventos_animales (explotacion_id, animal_id, tipo_evento, fecha, descripcion, metadata, estado, created_by)
    VALUES (_madre.explotacion_id, _cria_id, 'nacimiento', _fecha,
            'Nacida de ' || _madre.crotal,
            jsonb_build_object('madre_id', _madre_id, 'parto_evento_id', _evento_id), 'cerrado', _uid);

    IF _codigo IS NOT NULL AND COALESCE((SELECT tareas_automaticas FROM public.explotaciones WHERE id = _madre.explotacion_id), true) THEN
      INSERT INTO public.tareas (explotacion_id, titulo, descripcion, fecha_limite, prioridad, estado, animal_id, created_by)
      VALUES (_madre.explotacion_id,
              'Asignar crotal a cría de ' || _madre.crotal,
              'Cría identificada temporalmente como ' || _codigo || '. Origen: ' || _origen,
              _fecha + 20, 'alta', 'pendiente', _cria_id, _uid);
    END IF;

    _creadas := _creadas || jsonb_build_object('id', _cria_id, 'crotal', _crotal, 'sexo', COALESCE(_cria->>'sexo','hembra'), 'temporal', _codigo IS NOT NULL);
  END LOOP;

  UPDATE public.animales
     SET ultimo_parto = _fecha,
         estado_reproductivo = CASE WHEN _vivas > 0 THEN 'lactante' ELSE 'vacia' END
   WHERE id = _madre_id;

  RETURN jsonb_build_object('ok', true, 'duplicado', false, 'evento_id', _evento_id, 'vivas', _vivas, 'crias', _creadas);
END; $$;

CREATE INDEX IF NOT EXISTS tareas_expl_estado_idx ON public.tareas (explotacion_id, estado, fecha_limite);
CREATE INDEX IF NOT EXISTS eventos_expl_estado_idx ON public.eventos_animales (explotacion_id, tipo_evento, estado);
CREATE INDEX IF NOT EXISTS ingresos_expl_fecha_idx ON public.ingresos (explotacion_id, fecha DESC);
CREATE INDEX IF NOT EXISTS animales_madre_idx ON public.animales (madre_id) WHERE madre_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS animales_padre_idx ON public.animales (padre_id) WHERE padre_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS explotaciones_whatsapp_idx ON public.explotaciones (whatsapp_number) WHERE whatsapp_number IS NOT NULL;
