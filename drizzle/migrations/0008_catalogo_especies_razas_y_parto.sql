-- 1. Catálogo de especies
CREATE TABLE IF NOT EXISTS public.especies (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  dias_gestacion integer NOT NULL DEFAULT 283,
  orden integer NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.especies TO authenticated;
GRANT ALL ON public.especies TO service_role;
ALTER TABLE public.especies ENABLE ROW LEVEL SECURITY;
CREATE POLICY especies_select ON public.especies FOR SELECT TO authenticated USING (true);
CREATE POLICY especies_admin ON public.especies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'superadmin')) WITH CHECK (public.has_role(auth.uid(),'superadmin'));

-- 2. Catálogo de razas
CREATE TABLE IF NOT EXISTS public.razas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  especie_codigo text NOT NULL REFERENCES public.especies(codigo) ON DELETE CASCADE,
  nombre text NOT NULL,
  categoria text,
  autoctona boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS razas_especie_nombre_idx ON public.razas (especie_codigo, lower(nombre));
CREATE INDEX IF NOT EXISTS razas_especie_idx ON public.razas (especie_codigo) WHERE activa;
GRANT SELECT ON public.razas TO authenticated;
GRANT ALL ON public.razas TO service_role;
ALTER TABLE public.razas ENABLE ROW LEVEL SECURITY;
CREATE POLICY razas_select ON public.razas FOR SELECT TO authenticated USING (true);
CREATE POLICY razas_admin ON public.razas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'superadmin')) WITH CHECK (public.has_role(auth.uid(),'superadmin'));

-- 3. Identificación pendiente y datos reproductivos en animales
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS crotal_pendiente boolean NOT NULL DEFAULT false;
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS codigo_temporal text;
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS ultimo_parto date;
ALTER TABLE public.animales ADD COLUMN IF NOT EXISTS raza_id uuid REFERENCES public.razas(id);
CREATE INDEX IF NOT EXISTS animales_crotal_pendiente_idx ON public.animales (explotacion_id) WHERE crotal_pendiente;

-- 4. Configuración ganadera por explotación
ALTER TABLE public.explotaciones ADD COLUMN IF NOT EXISTS lote_crias_id uuid REFERENCES public.lotes(id);
ALTER TABLE public.explotaciones ADD COLUMN IF NOT EXISTS tareas_automaticas boolean NOT NULL DEFAULT true;
ALTER TABLE public.explotaciones ADD COLUMN IF NOT EXISTS dias_gestacion integer;

-- 5. Secuencia para identificadores temporales de crías
CREATE SEQUENCE IF NOT EXISTS public.cria_temp_seq;

-- 6. Servicio de dominio compartido: registrar parto (web, IA y WhatsApp)
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
  SELECT * INTO _madre FROM public.animales WHERE id = _madre_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Animal no encontrado'; END IF;
  IF _uid IS NOT NULL AND NOT public.user_in_explotacion(_uid, _madre.explotacion_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta explotación';
  END IF;
  IF _madre.estado <> 'activo' THEN RAISE EXCEPTION 'El animal % no está activo', _madre.crotal; END IF;
  IF _fecha > (now() AT TIME ZONE 'Europe/Madrid')::date THEN RAISE EXCEPTION 'La fecha del parto no puede ser futura'; END IF;

  -- Idempotencia: si ya existe un evento con la misma clave, devolverlo sin duplicar
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

  RETURN jsonb_build_object('ok', true, 'evento_id', _evento_id, 'vivas', _vivas, 'crias', _creadas);
END; $$;

-- 7. Asignar crotal definitivo a una cría con identificación pendiente
CREATE OR REPLACE FUNCTION public.asignar_crotal(_animal_id uuid, _crotal text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _a record;
  _nuevo text := trim(COALESCE(_crotal,''));
BEGIN
  IF _nuevo = '' THEN RAISE EXCEPTION 'El crotal no puede estar vacío'; END IF;
  SELECT * INTO _a FROM public.animales WHERE id = _animal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Animal no encontrado'; END IF;
  IF _uid IS NOT NULL AND NOT public.user_in_explotacion(_uid, _a.explotacion_id) THEN
    RAISE EXCEPTION 'Sin permiso sobre esta explotación';
  END IF;
  IF EXISTS (SELECT 1 FROM public.animales WHERE explotacion_id = _a.explotacion_id AND id <> _animal_id AND lower(crotal) = lower(_nuevo) AND estado = 'activo') THEN
    RAISE EXCEPTION 'Ya existe un animal activo con el crotal %', _nuevo;
  END IF;

  UPDATE public.animales
     SET crotal = _nuevo, crotal_pendiente = false
   WHERE id = _animal_id;

  INSERT INTO public.eventos_animales (explotacion_id, animal_id, tipo_evento, fecha, descripcion, metadata, estado, created_by)
  VALUES (_a.explotacion_id, _animal_id, 'observacion', (now() AT TIME ZONE 'Europe/Madrid')::date,
          'Crotal asignado: ' || _nuevo,
          jsonb_build_object('identificador_anterior', _a.crotal, 'codigo_temporal', _a.codigo_temporal), 'cerrado', _uid);

  UPDATE public.tareas SET estado = 'hecha'
   WHERE animal_id = _animal_id AND estado <> 'hecha' AND titulo LIKE 'Asignar crotal%';

  RETURN jsonb_build_object('ok', true, 'crotal', _nuevo);
END; $$;

GRANT EXECUTE ON FUNCTION public.registrar_parto(uuid, date, jsonb, uuid, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_crotal(uuid, text) TO authenticated, service_role;