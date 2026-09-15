import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { eur, mesNombre, trimestreDeMes } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Send, FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generarResumenMensualPDF } from "@/lib/pdf";

export default function Resumen() {
  const { currentCompanyId } = useAuth();
  const today = new Date();
  const [anio, setAnio] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [data, setData] = useState({ ingresos: 0, gastos: 0, ivaRep: 0, ivaSop: 0, cobrosPend: 0, gastosPend: 0 });
  const [trimData, setTrimData] = useState({ ingresos: 0, gastos: 0, ivaRep: 0, ivaSop: 0 });

  useEffect(() => {
    if (!currentCompanyId) return;
    (async () => {
      const ini = `${anio}-${String(mes).padStart(2,"0")}-01`;
      const fin = new Date(anio, mes, 0).toISOString().slice(0,10);
      const trimMesIni = (trimestreDeMes(mes) - 1) * 3 + 1;
      const trimIni = `${anio}-${String(trimMesIni).padStart(2,"0")}-01`;
      const trimFin = new Date(anio, trimMesIni + 2, 0).toISOString().slice(0,10);

      const [{ data: invMes }, { data: gMes }, { data: invTrim }, { data: gTrim }, { data: cobros }, { data: gPend }] = await Promise.all([
        supabase.from("invoices").select("base_imponible, iva_importe, total").eq("company_id", currentCompanyId).gte("fecha", ini).lte("fecha", fin),
        supabase.from("expenses").select("base_imponible, iva_importe, total").eq("company_id", currentCompanyId).gte("fecha", ini).lte("fecha", fin),
        supabase.from("invoices").select("base_imponible, iva_importe").eq("company_id", currentCompanyId).gte("fecha", trimIni).lte("fecha", trimFin),
        supabase.from("expenses").select("base_imponible, iva_importe").eq("company_id", currentCompanyId).gte("fecha", trimIni).lte("fecha", trimFin),
        supabase.from("invoices").select("total").eq("company_id", currentCompanyId).in("estado", ["enviada","vencida"]),
        supabase.from("expenses").select("id", { count: "exact", head: true }).eq("company_id", currentCompanyId).eq("estado", "pendiente"),
      ]);

      const sum = (arr: any[], k: string) => (arr ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);
      setData({
        ingresos: sum(invMes ?? [], "total"),
        gastos: sum(gMes ?? [], "total"),
        ivaRep: sum(invMes ?? [], "iva_importe"),
        ivaSop: sum(gMes ?? [], "iva_importe"),
        cobrosPend: sum(cobros ?? [], "total"),
        gastosPend: gPend?.length ?? 0,
      });
      setTrimData({
        ingresos: sum(invTrim ?? [], "base_imponible"),
        gastos: sum(gTrim ?? [], "base_imponible"),
        ivaRep: sum(invTrim ?? [], "iva_importe"),
        ivaSop: sum(gTrim ?? [], "iva_importe"),
      });
    })();
  }, [currentCompanyId, anio, mes]);

  async function prepararEnvio() {
    if (!currentCompanyId) return;
    const { error } = await supabase.from("monthly_closures")
      .upsert({ company_id: currentCompanyId, anio, mes, mes_listo: true, enviado_gestoria_en: new Date().toISOString() }, { onConflict: "company_id,anio,mes" });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Mes marcado como enviado a gestoría" });
  }

  async function descargarPDF() {
    if (!currentCompanyId) return;
    const { data: co } = await supabase.from("companies").select("nombre_comercial, nif").eq("id", currentCompanyId).maybeSingle();
    const doc = generarResumenMensualPDF({
      empresa: co?.nombre_comercial ?? "Empresa",
      nif: co?.nif,
      anio, mes,
      ingresos: data.ingresos, gastos: data.gastos,
      ivaRep: data.ivaRep, ivaSop: data.ivaSop,
      cobrosPend: data.cobrosPend, gastosPend: data.gastosPend,
      facturasCount: 0, gastosCount: 0,
    });
    doc.save(`resumen-${anio}-${String(mes).padStart(2,"0")}.pdf`);
  }

  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const anios = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];
  const ivaTrimResultado = trimData.ivaRep - trimData.ivaSop;

  return (
    <>
      <PageHeader title="Resumen mensual y trimestral" description="Información orientativa preparada para enviar a la gestoría." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>{meses.map((m) => <SelectItem key={m} value={String(m)} className="capitalize">{mesNombre(m)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>{anios.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={descargarPDF}><FileDown className="mr-2 h-4 w-4" />PDF resumen</Button>
        <Button onClick={prepararEnvio}><Send className="mr-2 h-4 w-4" />Preparar envío a gestoría</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Stat title="Ingresos del mes" value={eur(data.ingresos)} />
        <Stat title="Gastos del mes" value={eur(data.gastos)} />
        <Stat title="Resultado bruto" value={eur(data.ingresos - data.gastos)} highlight />
        <Stat title="IVA repercutido (estimado)" value={eur(data.ivaRep)} />
        <Stat title="IVA soportado (estimado)" value={eur(data.ivaSop)} />
        <Stat title="Cobros pendientes" value={eur(data.cobrosPend)} />
      </div>

      <Card className="mt-6 shadow-card">
        <CardHeader><CardTitle>Resumen trimestre {trimestreDeMes(mes)} · {anio}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat title="Base ingresos" value={eur(trimData.ingresos)} flat />
            <Stat title="Base gastos" value={eur(trimData.gastos)} flat />
            <Stat title="IVA repercutido" value={eur(trimData.ivaRep)} flat />
            <Stat title="IVA soportado" value={eur(trimData.ivaSop)} flat />
          </div>
          <div className="mt-4 rounded-md bg-primary-soft p-4">
            <div className="text-xs uppercase tracking-wider text-primary-strong">Resultado IVA orientativo del trimestre</div>
            <div className={`mt-1 text-2xl font-bold ${ivaTrimResultado >= 0 ? "text-destructive" : "text-success"}`}>
              {ivaTrimResultado >= 0 ? "A pagar " : "A devolver "} {eur(Math.abs(ivaTrimResultado))}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Estimación. La presentación oficial corresponde a tu gestoría.</div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

const Stat = ({ title, value, highlight, flat }: { title: string; value: string; highlight?: boolean; flat?: boolean }) => (
  flat ? (
    <div><div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>
  ) : (
    <Card className={`shadow-card ${highlight ? "border-primary/40 bg-primary-soft" : ""}`}>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent><div className={`text-2xl font-bold ${highlight ? "text-primary-strong" : ""}`}>{value}</div></CardContent>
    </Card>
  )
);
