import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useExplotacion } from "@/hooks/useExplotacion";
import { categoriaAnimal } from "@/lib/ganado";
import { eur } from "@/lib/format";
import {
  AlertTriangle, HeartPulse, ListChecks, Beef, Baby, Euro, ArrowRight, Plus,
} from "lucide-react";

type Resumen = {
  total: number; vacas: number; terneros: number; novillas: number; toros: number;
  incidencias: number; tratamientos: number; tareas: number;
  partosMes: number; gestaciones: number;
  gastosMes: number; ingresosMes: number;
};

const cero: Resumen = {
  total: 0, vacas: 0, terneros: 0, novillas: 0, toros: 0, incidencias: 0,
  tratamientos: 0, tareas: 0, partosMes: 0, gestaciones: 0, gastosMes: 0, ingresosMes: 0,
};

export default function Inicio() {
  const { user } = useAuth();
  const { explotacion, explotacionId, loading } = useExplotacion();
  const [r, setR] = useState<Resumen>(cero);

  useEffect(() => {
    if (!explotacionId) { setR(cero); return; }
    (async () => {
      const inicioMes = new Date(); inicioMes.setDate(1);
      const desde = inicioMes.toISOString().slice(0, 10);

      const [animales, incidencias, tratamientos, tareas, partos, gastos, ingresos] = await Promise.all([
        supabase.from("animales").select("sexo, fecha_nacimiento, estado_reproductivo").eq("explotacion_id", explotacionId).eq("estado", "activo"),
        supabase.from("eventos_animales").select("id", { count: "exact", head: true }).eq("explotacion_id", explotacionId).eq("tipo_evento", "incidencia").eq("estado", "abierto"),
        supabase.from("eventos_animales").select("id", { count: "exact", head: true }).eq("explotacion_id", explotacionId).eq("tipo_evento", "tratamiento").eq("estado", "activo"),
        supabase.from("tareas").select("id", { count: "exact", head: true }).eq("explotacion_id", explotacionId).eq("estado", "pendiente"),
        supabase.from("eventos_animales").select("id", { count: "exact", head: true }).eq("explotacion_id", explotacionId).eq("tipo_evento", "parto").gte("fecha", desde),
        supabase.from("expenses").select("total").eq("explotacion_id", explotacionId).gte("fecha", desde),
        supabase.from("ingresos").select("importe").eq("explotacion_id", explotacionId).gte("fecha", desde),
      ]);

      const list = animales.data ?? [];
      const cuenta = { vaca: 0, novilla: 0, ternero: 0, toro: 0 };
      let gestaciones = 0;
      list.forEach((a) => {
        cuenta[categoriaAnimal(a)] += 1;
        if (a.estado_reproductivo === "gestante") gestaciones += 1;
      });

      setR({
        total: list.length,
        vacas: cuenta.vaca, terneros: cuenta.ternero, novillas: cuenta.novilla, toros: cuenta.toro,
        incidencias: incidencias.count ?? 0,
        tratamientos: tratamientos.count ?? 0,
        tareas: tareas.count ?? 0,
        partosMes: partos.count ?? 0,
        gestaciones,
        gastosMes: (gastos.data ?? []).reduce((a, x) => a + Number(x.total ?? 0), 0),
        ingresosMes: (ingresos.data ?? []).reduce((a, x) => a + Number(x.importe ?? 0), 0),
      });
    })();
  }, [explotacionId]);

  const saludo = (() => {
    const h = new Date().getHours();
    if (h < 6) return "Buenas noches";
    if (h < 14) return "Buenos días";
    if (h < 21) return "Buenas tardes";
    return "Buenas noches";
  })();

  const nombre = user?.email?.split("@")[0] ?? "";

  if (!loading && !explotacion) {
    return (
      <Card className="mx-auto max-w-lg shadow-card">
        <CardHeader><CardTitle>Empieza por tu explotación</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Crea tu explotación para registrar fincas, lotes y animales.
          </p>
          <Button asChild><Link to="/configuracion"><Plus className="mr-1 h-4 w-4" /> Crear explotación</Link></Button>
        </CardContent>
      </Card>
    );
  }

  const atencion = [
    { n: r.incidencias, label: "incidencias abiertas", color: "bg-destructive", to: "/animales", icon: AlertTriangle },
    { n: r.tratamientos, label: "tratamientos activos", color: "bg-warning", to: "/animales", icon: HeartPulse },
    { n: r.tareas, label: "tareas pendientes", color: "bg-olive", to: "/tareas", icon: ListChecks },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{saludo}, {nombre}</h1>
        <p className="text-sm text-muted-foreground">{explotacion?.nombre}</p>
      </div>

      {/* Hoy / atención */}
      <Card className="border-primary/20 shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Qué necesita tu atención</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {atencion.every((a) => a.n === 0) ? (
            <p className="text-sm text-muted-foreground">Todo en orden. No hay avisos pendientes.</p>
          ) : (
            atencion.filter((a) => a.n > 0).map((a) => (
              <Link key={a.label} to={a.to}
                className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 transition hover:border-primary">
                <span className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${a.color} text-white`}>
                    <a.icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm"><strong className="text-base">{a.n}</strong> {a.label}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {/* Ganado */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ganado</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { t: "Total", v: r.total, icon: Beef },
            { t: "Vacas", v: r.vacas },
            { t: "Terneros", v: r.terneros },
            { t: "Novillas", v: r.novillas },
            { t: "Toros", v: r.toros },
          ].map((c) => (
            <Card key={c.t} className="shadow-card">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{c.t}</div>
                <div className="text-2xl font-bold">{c.v}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Reproducción y economía */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Baby className="h-4 w-4 text-primary" /> Reproducción</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div><div className="text-xs text-muted-foreground">Partos este mes</div><div className="text-2xl font-bold">{r.partosMes}</div></div>
            <div><div className="text-xs text-muted-foreground">Gestaciones</div><div className="text-2xl font-bold">{r.gestaciones}</div></div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Euro className="h-4 w-4 text-primary" /> Economía del mes</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div><div className="text-xs text-muted-foreground">Ingresos</div><div className="text-lg font-bold">{eur(r.ingresosMes)}</div></div>
            <div><div className="text-xs text-muted-foreground">Gastos</div><div className="text-lg font-bold">{eur(r.gastosMes)}</div></div>
            <div><div className="text-xs text-muted-foreground">Balance</div>
              <div className={`text-lg font-bold ${r.ingresosMes - r.gastosMes < 0 ? "text-destructive" : "text-success"}`}>
                {eur(r.ingresosMes - r.gastosMes)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
