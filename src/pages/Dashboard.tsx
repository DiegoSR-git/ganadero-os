import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, MessageCircle, Receipt, Wallet, AlertTriangle, CheckCircle2, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { eur, mesNombre } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "react-router-dom";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

type Stats = {
  empresas: number; msgsHoy: number; facturasMes: number; ingresosMes: number;
  gastosMes: number; gastosPendientes: number; cobrosPendientes: number;
  importeCobrosPendientes: number; mesesListos: number; clientesTotal: number;
  cobrosVencidos: number;
};

export default function Dashboard() {
  const { currentCompanyId, isStaff } = useAuth();
  const [s, setS] = useState<Stats>({
    empresas: 0, msgsHoy: 0, facturasMes: 0, ingresosMes: 0, gastosMes: 0,
    gastosPendientes: 0, cobrosPendientes: 0, importeCobrosPendientes: 0,
    mesesListos: 0, clientesTotal: 0, cobrosVencidos: 0,
  });
  const [serie, setSerie] = useState<{ mes: string; ingresos: number; gastos: number }[]>([]);
  const [topClientes, setTopClientes] = useState<{ nombre: string; total: number }[]>([]);

  useEffect(() => {
    (async () => {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const startISO = start.toISOString();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const compFilter = currentCompanyId ? { company_id: currentCompanyId } : null;

      const seisMesesAtras = new Date(); seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5); seisMesesAtras.setDate(1);
      const seisISO = seisMesesAtras.toISOString().slice(0, 10);

      const [emp, msgs, fact, gMes, gPend, cPend, mesesListos, cli, invSerie, gSerie, invTop] = await Promise.all([
        isStaff ? supabase.from("companies").select("id", { count: "exact", head: true }) : Promise.resolve({ count: 1 } as any),
        supabase.from("wa_messages").select("id, company_id", { count: "exact", head: true })
          .gte("recibido_en", todayISO).match(compFilter ?? {}),
        supabase.from("invoices").select("total").gte("fecha", startISO.slice(0, 10)).match(compFilter ?? {}),
        supabase.from("expenses").select("total").gte("fecha", startISO.slice(0, 10)).match(compFilter ?? {}),
        supabase.from("expenses").select("id", { count: "exact", head: true }).eq("estado", "pendiente").match(compFilter ?? {}),
        supabase.from("invoices").select("total, fecha").in("estado", ["enviada", "vencida"]).match(compFilter ?? {}),
        supabase.from("monthly_closures").select("id", { count: "exact", head: true }).eq("mes_listo", true).match(compFilter ?? {}),
        supabase.from("clients").select("id", { count: "exact", head: true }).match(compFilter ?? {}),
        supabase.from("invoices").select("fecha, total").gte("fecha", seisISO).match(compFilter ?? {}),
        supabase.from("expenses").select("fecha, total").gte("fecha", seisISO).match(compFilter ?? {}),
        supabase.from("invoices").select("total, clients(nombre)").match(compFilter ?? {}).limit(500),
      ]);

      const ingresosMes = (fact.data ?? []).reduce((a: number, r: any) => a + Number(r.total ?? 0), 0);
      const gastosMes = (gMes.data ?? []).reduce((a: number, r: any) => a + Number(r.total ?? 0), 0);
      const importeCobrosPendientes = (cPend.data ?? []).reduce((a: number, r: any) => a + Number(r.total ?? 0), 0);
      const cobrosVencidos = (cPend.data ?? []).filter((r: any) => {
        const dias = Math.floor((Date.now() - new Date(r.fecha).getTime()) / (1000 * 60 * 60 * 24));
        return dias > 30;
      }).length;

      setS({
        empresas: emp.count ?? 0,
        msgsHoy: msgs.count ?? 0,
        facturasMes: (fact.data ?? []).length,
        ingresosMes, gastosMes,
        gastosPendientes: gPend.count ?? 0,
        cobrosPendientes: (cPend.data ?? []).length,
        importeCobrosPendientes,
        mesesListos: mesesListos.count ?? 0,
        clientesTotal: cli.count ?? 0,
        cobrosVencidos,
      });

      // Serie 6 meses
      const mapa: Record<string, { ingresos: number; gastos: number }> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        mapa[key] = { ingresos: 0, gastos: 0 };
      }
      (invSerie.data ?? []).forEach((r: any) => {
        const k = r.fecha?.slice(0, 7); if (mapa[k]) mapa[k].ingresos += Number(r.total ?? 0);
      });
      (gSerie.data ?? []).forEach((r: any) => {
        const k = r.fecha?.slice(0, 7); if (mapa[k]) mapa[k].gastos += Number(r.total ?? 0);
      });
      setSerie(Object.entries(mapa).map(([k, v]) => ({
        mes: mesNombre(Number(k.split("-")[1])).slice(0, 3),
        ingresos: Math.round(v.ingresos),
        gastos: Math.round(v.gastos),
      })));

      // Top clientes
      const tot: Record<string, number> = {};
      (invTop.data ?? []).forEach((r: any) => {
        const n = r.clients?.nombre ?? "Sin asignar";
        tot[n] = (tot[n] ?? 0) + Number(r.total ?? 0);
      });
      setTopClientes(Object.entries(tot).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total).slice(0, 5));
    })();
  }, [currentCompanyId, isStaff]);

  const cards = [
    { t: "Empresas activas", v: s.empresas, icon: Building2, hide: !isStaff, to: "/empresas" },
    { t: "Mensajes WhatsApp hoy", v: s.msgsHoy, icon: MessageCircle, to: "/inbox" },
    { t: "Facturas este mes", v: s.facturasMes, icon: FileText, sub: eur(s.ingresosMes) + " ingresos", to: "/facturas" },
    { t: "Gastos este mes", v: eur(s.gastosMes), icon: Receipt, sub: `${s.gastosPendientes} pendientes`, to: "/gastos" },
    { t: "Cobros pendientes", v: eur(s.importeCobrosPendientes), icon: Wallet, sub: `${s.cobrosPendientes} facturas · ${s.cobrosVencidos} vencidas +30d`, to: "/cobros", urgent: s.cobrosVencidos > 0 },
    { t: "Beneficio bruto mes", v: eur(s.ingresosMes - s.gastosMes), icon: TrendingUp, sub: "ingresos − gastos" },
    { t: "Clientes registrados", v: s.clientesTotal, icon: Users, to: "/clientes" },
    { t: "Meses listos para gestoría", v: s.mesesListos, icon: CheckCircle2, to: "/gestoria" },
  ].filter((c) => !c.hide);

  return (
    <>
      <PageHeader title="Panel" description="Resumen del estado actual de la empresa." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Inner = (
            <Card className={`shadow-card transition hover:shadow-elevated ${c.urgent ? "border-destructive/50 bg-destructive/5" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.t}</CardTitle>
                <c.icon className={`h-4 w-4 ${c.urgent ? "text-destructive" : "text-primary"}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{c.v}</div>
                {c.sub && <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>}
              </CardContent>
            </Card>
          );
          return c.to ? <Link key={c.t} to={c.to}>{Inner}</Link> : <div key={c.t}>{Inner}</div>;
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="shadow-card lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ingresos vs gastos · últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(v: number) => eur(v)}
                  />
                  <Legend />
                  <Bar dataKey="ingresos" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="gastos" fill="hsl(var(--warning))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Top clientes</CardTitle></CardHeader>
          <CardContent>
            {topClientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos.</p>
            ) : (
              <ul className="space-y-3">
                {topClientes.map((c, i) => (
                  <li key={c.nombre} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-strong">{i + 1}</span>
                      <span className="truncate text-sm">{c.nombre}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{eur(c.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-warning/40 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-warning" />
          <div className="text-sm">
            <strong>Aviso legal:</strong> GanaderOS ordena tu papeleo y prepara los documentos del mes/trimestre.
            Los cálculos de IVA mostrados son orientativos. La presentación fiscal final corresponde a tu gestoría o asesor fiscal.
          </div>
        </CardContent>
      </Card>
    </>
  );
}
