import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Especie = { codigo: string; nombre: string; dias_gestacion: number; orden: number };
export type Raza = { id: string; especie_codigo: string; nombre: string; autoctona: boolean };

let cache: { especies: Especie[]; razas: Raza[] } | null = null;

/** Catálogo de especies y razas mantenible desde base de datos (sin razas hardcodeadas). */
export function useCatalogoGanado() {
  const [especies, setEspecies] = useState<Especie[]>(cache?.especies ?? []);
  const [razas, setRazas] = useState<Raza[]>(cache?.razas ?? []);
  const [cargando, setCargando] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let vivo = true;
    (async () => {
      const [e, r] = await Promise.all([
        supabase.from("especies").select("codigo, nombre, dias_gestacion, orden").eq("activa", true).order("orden"),
        supabase.from("razas").select("id, especie_codigo, nombre, autoctona").eq("activa", true).order("nombre"),
      ]);
      if (!vivo) return;
      cache = { especies: (e.data ?? []) as Especie[], razas: (r.data ?? []) as Raza[] };
      setEspecies(cache.especies);
      setRazas(cache.razas);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const razasDe = useCallback(
    (especie?: string | null) => (especie ? razas.filter((r) => r.especie_codigo === especie) : []),
    [razas],
  );

  const diasGestacion = useCallback(
    (especie?: string | null) => especies.find((e) => e.codigo === especie)?.dias_gestacion ?? null,
    [especies],
  );

  return { especies, razas, razasDe, diasGestacion, cargando };
}
