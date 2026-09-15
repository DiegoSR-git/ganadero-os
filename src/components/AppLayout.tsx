import { ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Building2, Users, FileText, Receipt, Wallet,
  CalendarRange, FolderArchive, MessageCircle, LogOut, MessageSquareText, Briefcase, Menu, Landmark,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/facturacion", label: "Panel", icon: LayoutDashboard, end: true },
  { to: "/empresas", label: "Empresas", icon: Building2, staffOnly: true },
  { to: "/panel-gestoria", label: "Panel gestoría", icon: Landmark, gestoriaOnly: true },
  { to: "/mi-empresa", label: "Mi empresa", icon: Briefcase },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/facturas", label: "Facturas", icon: FileText },
  { to: "/gastos", label: "Gastos", icon: Receipt },
  { to: "/cobros", label: "Cobros", icon: Wallet },
  { to: "/resumen", label: "Resumen", icon: CalendarRange },
  { to: "/gestoria", label: "Gestoría", icon: FolderArchive },
  { to: "/inbox", label: "Inbox WhatsApp", icon: MessageCircle },
];

export default function AppLayout({ children }: { children?: ReactNode }) {
  const { user, signOut, currentCompanyId, setCurrentCompanyId, isStaff, isGestoria, roles } = useAuth();
  const [companies, setCompanies] = useState<{ id: string; nombre_comercial: string }[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    (async () => {
      // Con la RLS actualizada, basta con SELECT y las políticas filtran.
      const q = supabase.from("companies").select("id, nombre_comercial").order("nombre_comercial");
      const { data } = await q;
      setCompanies(data ?? []);
      if (!currentCompanyId && data && data.length) setCurrentCompanyId(data[0].id);
    })();
  }, [user, isStaff, isGestoria]);

  const navItems = nav.filter((n) => {
    if ((n as any).staffOnly && !isStaff) return false;
    if ((n as any).gestoriaOnly && !isGestoria) return false;
    return true;
  });

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navItems.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )
          }
        >
          <n.icon className="h-4 w-4" />
          {n.label}
        </NavLink>
      ))}
    </>
  );

  return (
    <div className="flex min-h-screen bg-gradient-soft">
      <aside className="hidden w-64 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">GanaderOS</div>
            <div className="text-[11px] text-sidebar-foreground/70">WhatsApp · España</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavList />
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 truncate text-xs text-sidebar-foreground/70">{user?.email}</div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-3 py-3 md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
              <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <MessageSquareText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold leading-tight">GanaderOS</div>
                  <div className="text-[11px] text-sidebar-foreground/70">WhatsApp · España</div>
                </div>
              </div>
              <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
                <NavList onNavigate={() => setMobileOpen(false)} />
              </nav>
              <div className="border-t border-sidebar-border p-3">
                <div className="mb-2 truncate text-xs text-sidebar-foreground/70">{user?.email}</div>
                <button
                  onClick={() => { setMobileOpen(false); signOut(); }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex flex-1 items-center gap-2 min-w-0 md:gap-3">
            <div className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:block">Empresa</div>
            <Select value={currentCompanyId ?? ""} onValueChange={setCurrentCompanyId}>
              <SelectTrigger className="w-full max-w-[240px] md:w-[240px]">
                <SelectValue placeholder="Selecciona empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre_comercial}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="hidden text-xs text-muted-foreground md:block">
            Los cálculos son orientativos. La presentación fiscal corresponde a tu gestoría.
          </div>
        </header>
        <main className="flex-1 p-3 sm:p-4 md:p-6 min-w-0 overflow-x-hidden">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  );
}
