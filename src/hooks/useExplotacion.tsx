import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Explotacion = {
  id: string;
  user_id: string;
  nombre: string;
  codigo_rega: string | null;
  especie_principal: string;
  tipo_ganaderia: string;
  municipio: string | null;
  provincia: string | null;
  superficie_total: number | null;
  numero_animales_estimado: number | null;
};

interface Ctx {
  explotaciones: Explotacion[];
  explotacion: Explotacion | null;
  explotacionId: string | null;
  setExplotacionId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ExplCtx = createContext<Ctx | undefined>(undefined);
const KEY = "gos_explotacion_id";

export function ExplotacionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [explotaciones, setExplotaciones] = useState<Explotacion[]>([]);
  const [explotacionId, setId] = useState<string | null>(() => localStorage.getItem(KEY));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setExplotaciones([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("explotaciones")
      .select("*")
      .order("created_at", { ascending: true });
    const list = (data ?? []) as Explotacion[];
    setExplotaciones(list);
    setId((prev) => (prev && list.some((e) => e.id === prev) ? prev : list[0]?.id ?? null));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  const setExplotacionId = (id: string) => {
    setId(id);
    localStorage.setItem(KEY, id);
  };

  const explotacion = explotaciones.find((e) => e.id === explotacionId) ?? null;

  return (
    <ExplCtx.Provider value={{ explotaciones, explotacion, explotacionId, setExplotacionId, loading, refresh }}>
      {children}
    </ExplCtx.Provider>
  );
}

export const useExplotacion = () => {
  const c = useContext(ExplCtx);
  if (!c) throw new Error("useExplotacion dentro de ExplotacionProvider");
  return c;
};
