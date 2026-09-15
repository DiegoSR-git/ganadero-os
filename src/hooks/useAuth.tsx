import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Role = "superadmin" | "gestor" | "cliente_empresa" | "gestoria";
type RoleRow = { role: Role; company_id: string | null };

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: RoleRow[];
  isStaff: boolean;
  isGestoria: boolean;
  gestoriaId: string | null;
  currentCompanyId: string | null;
  setCurrentCompanyId: (id: string | null) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [gestoriaId, setGestoriaId] = useState<string | null>(null);
  const [currentCompanyId, setCurrentCompanyIdState] = useState<string | null>(
    () => localStorage.getItem("pf_company_id")
  );

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) setTimeout(() => loadRoles(s.user.id), 0);
      else { setRoles([]); setGestoriaId(null); }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadRoles(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadRoles(uid: string) {
    const { data } = await supabase.from("user_roles").select("role, company_id").eq("user_id", uid);
    const list = (data ?? []) as RoleRow[];
    setRoles(list);
    // Cargar gestoría propia si la hay
    const { data: g } = await supabase.from("gestorias").select("id").eq("user_id", uid).maybeSingle();
    setGestoriaId(g?.id ?? null);
    // Si no hay empresa elegida, coger la primera de las que tiene
    if (!currentCompanyId) {
      const firstCompany = list.find((r) => r.company_id)?.company_id ?? null;
      if (firstCompany) setCurrentCompanyId(firstCompany);
    }
  }

  function setCurrentCompanyId(id: string | null) {
    setCurrentCompanyIdState(id);
    if (id) localStorage.setItem("pf_company_id", id);
    else localStorage.removeItem("pf_company_id");
  }

  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem("pf_company_id");
    setCurrentCompanyIdState(null);
    window.location.href = "/auth";
  }

  const isStaff = roles.some((r) => r.role === "superadmin" || r.role === "gestor");
  const isGestoria = roles.some((r) => r.role === "gestoria") || !!gestoriaId;

  return (
    <Ctx.Provider value={{ user, session, loading, roles, isStaff, isGestoria, gestoriaId, currentCompanyId, setCurrentCompanyId, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth dentro de AuthProvider");
  return c;
};
