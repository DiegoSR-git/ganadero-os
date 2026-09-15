import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home, Beef, Layers, Map, Euro, FolderOpen, ListChecks, Sparkles,
  Settings, LogOut, Plus, Menu, LifeBuoy, MessageSquarePlus,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useExplotacion } from "@/hooks/useExplotacion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import RegistrarEventoDialog from "@/components/RegistrarEventoDialog";
import OnboardingDialog from "@/components/OnboardingDialog";
import FeedbackDialog from "@/components/FeedbackDialog";

const nav = [
  { to: "/app", label: "Inicio", icon: Home, end: true },
  { to: "/animales", label: "Animales", icon: Beef },
  { to: "/lotes", label: "Lotes", icon: Layers },
  { to: "/fincas", label: "Fincas", icon: Map },
  { to: "/economia", label: "Economía", icon: Euro },
  { to: "/documentos", label: "Documentos", icon: FolderOpen },
  { to: "/tareas", label: "Tareas", icon: ListChecks },
  { to: "/asistente", label: "Asistente IA", icon: Sparkles },
  { to: "/configuracion", label: "Configuración", icon: Settings },
  { to: "/ayuda", label: "Ayuda", icon: LifeBuoy },
];

const mobileNav = [
  { to: "/app", label: "Inicio", icon: Home, end: true },
  { to: "/animales", label: "Animales", icon: Beef },
  { to: "/economia", label: "Economía", icon: Euro },
  { to: "/tareas", label: "Tareas", icon: ListChecks },
];

export default function GanaderoLayout() {
  const { user, signOut } = useAuth();
  const { explotaciones, explotacionId, setExplotacionId, explotacion } = useExplotacion();
  const [openMenu, setOpenMenu] = useState(false);
  const [openRegistrar, setOpenRegistrar] = useState(false);
  const [openFeedback, setOpenFeedback] = useState(false);
  const navigate = useNavigate();

  const NavList = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )
          }
        >
          <n.icon className="h-[18px] w-[18px]" />
          {n.label}
        </NavLink>
      ))}
    </>
  );

  const Brand = () => (
    <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <Beef className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight tracking-tight">GanaderOS</div>
        <div className="truncate text-[11px] text-sidebar-foreground/70">
          {explotacion?.nombre ?? "Sin explotación"}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Brand />
        <nav className="flex-1 space-y-1 p-3">
          <NavList />
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 truncate text-xs text-sidebar-foreground/70">{user?.email}</div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/95 px-3 py-3 backdrop-blur md:px-6">
          <Sheet open={openMenu} onOpenChange={setOpenMenu}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 md:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
              <Brand />
              <nav className="flex-1 space-y-1 overflow-y-auto p-3">
                <NavList onNavigate={() => setOpenMenu(false)} />
              </nav>
              <div className="border-t border-sidebar-border p-3">
                <button
                  onClick={() => { setOpenMenu(false); signOut(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
                >
                  <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            {explotaciones.length > 0 && (
              <Select value={explotacionId ?? ""} onValueChange={setExplotacionId}>
                <SelectTrigger className="w-full max-w-[220px]">
                  <SelectValue placeholder="Explotación" />
                </SelectTrigger>
                <SelectContent>
                  {explotaciones.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button variant="ghost" size="icon" className="shrink-0" aria-label="Enviar opinión" onClick={() => setOpenFeedback(true)}>
            <MessageSquarePlus className="h-5 w-5" />
          </Button>

          <Button onClick={() => setOpenRegistrar(true)} className="shrink-0" size="sm">
            <Plus className="mr-1 h-4 w-4" /> Registrar
          </Button>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-3 pb-24 sm:p-4 md:p-6 md:pb-6">
          <Outlet />
        </main>

        {/* Barra inferior móvil */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card/95 backdrop-blur md:hidden">
          {mobileNav.slice(0, 2).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-[11px]",
                isActive ? "text-primary" : "text-muted-foreground")}>
              <n.icon className="h-5 w-5" />{n.label}
            </NavLink>
          ))}
          <button onClick={() => setOpenRegistrar(true)} className="flex flex-col items-center justify-center" aria-label="Registrar">
            <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevated">
              <Plus className="h-6 w-6" />
            </span>
          </button>
          {mobileNav.slice(2).map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-[11px]",
                isActive ? "text-primary" : "text-muted-foreground")}>
              <n.icon className="h-5 w-5" />{n.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <OnboardingDialog />
      <FeedbackDialog open={openFeedback} onOpenChange={setOpenFeedback} />

      <RegistrarEventoDialog
        open={openRegistrar}
        onOpenChange={setOpenRegistrar}
        onSaved={() => navigate(0)}
      />
    </div>
  );
}
