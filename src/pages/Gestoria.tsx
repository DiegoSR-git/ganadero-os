import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, CheckCircle2, FileText, Receipt, Send } from "lucide-react";
import { eur, fechaCorta, mesNombre } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import JSZip from "jszip";
import { generarFacturaPDF } from "@/lib/pdf";

export default function Gestoria() {
  const { currentCompanyId } = useAuth();
  const today = new Date();
  const [anio, setAnio] = useState(today.getFullYear());
  const [mes, setMes] = useState(today.getMonth() + 1);
  const [invs, setInvs] = useState<any[]>([]);
  const [gastos, setGastos] = useState<any[]>([]);
  const [closure, setClosure] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [enviando, setEnviando] = useState(false);

  async function load() {
    if (!currentCompanyId) return;
    const ini = `${anio}-${String(mes).padStart(2,"0")}-01`;
    const fin = new Date(anio, mes, 0).toISOString().slice(0,10);
    const [a, b, c, co] = await Promise.all([
      supabase.from("invoices").select("*, clients(nombre, nif, direccion)").eq("company_id", currentCompanyId).gte("fecha", ini).lte("fecha", fin).order("fecha"),
      supabase.from("expenses").select("*").eq("company_id", currentCompanyId).gte("fecha", ini).lte("fecha", fin).order("fecha"),
      supabase.from("monthly_closures").select("*").eq("company_id", currentCompanyId).eq("anio", anio).eq("mes", mes).maybeSingle(),
      supabase.from("companies").select("*").eq("id", currentCompanyId).maybeSingle(),
    ]);
    setInvs(a.data ?? []); setGastos(b.data ?? []); setClosure(c.data); setCompany(co.data);
  }
  useEffect(() => { load(); }, [currentCompanyId, anio, mes]);

  async function construirZIP(): Promise<{ blob: Blob; filename: string; resumen: string }> {
    const zip = new JSZip();
    const carpeta = zip.folder(`${anio}-${String(mes).padStart(2,"0")}-${company?.nombre_comercial ?? "empresa"}`)!;
    const facturasFolder = carpeta.folder("facturas")!;
    // Pre-cargar logo (data URL) si la plantilla es personalizada
    let logoDataUrl: string | null = null;
    if (company?.factura_template === "personalizada" && company?.factura_logo_url) {
      try {
        const r = await fetch(company.factura_logo_url);
        const blob = await r.blob();
        logoDataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
      } catch { /* ignore */ }
    }
    invs.forEach((inv) => {
      const cliente = inv.clients;
      const doc = generarFacturaPDF({
        numero: inv.numero, fecha: inv.fecha, concepto: inv.concepto,
        base_imponible: Number(inv.base_imponible), iva_porcentaje: Number(inv.iva_porcentaje),
        iva_importe: Number(inv.iva_importe), total: Number(inv.total), notas: inv.notas,
        emisor: { nombre: company?.nombre_comercial, nif: company?.nif, direccion: company?.direccion, email: company?.email, telefono: company?.telefono },
        cliente: cliente ? { nombre: cliente.nombre, nif: cliente.nif, direccion: cliente.direccion } : null,
        template: company?.factura_template ?? "profesional",
        custom: company?.factura_template === "personalizada" ? {
          color_primario: company?.factura_color_primario,
          color_acento: company?.factura_color_acento,
          encabezado: company?.factura_encabezado,
          pie: company?.factura_pie,
          logo_data_url: logoDataUrl,
        } : null,
      });
      facturasFolder.file(`factura-${inv.numero}.pdf`, doc.output("blob"));
    });
    const sumIvaRep = invs.reduce((a, r) => a + Number(r.iva_importe ?? 0), 0);
    const sumIvaSop = gastos.reduce((a, r) => a + Number(r.iva_importe ?? 0), 0);
    const resumen = [
      `Resumen ${mesNombre(mes)} ${anio} - ${company?.nombre_comercial ?? ""}`,
      "",
      `Facturas emitidas: ${invs.length}`,
      `Total ingresos: ${eur(invs.reduce((a, r) => a + Number(r.total ?? 0), 0))}`,
      `IVA repercutido (estimado): ${eur(sumIvaRep)}`,
      "",
      `Gastos: ${gastos.length}`,
      `Total gastos: ${eur(gastos.reduce((a, r) => a + Number(r.total ?? 0), 0))}`,
      `IVA soportado (estimado): ${eur(sumIvaSop)}`,
      "",
      "DOCUMENTO ORIENTATIVO. La presentación fiscal corresponde a la gestoría.",
    ].join("\n");
    carpeta.file("resumen.txt", resumen);

    // CSV de facturas y gastos
    const csvFacturas = ["numero,fecha,cliente,base,iva,total,estado",
      ...invs.map((i) => `${i.numero},${i.fecha},"${i.clients?.nombre ?? ""}",${i.base_imponible},${i.iva_importe},${i.total},${i.estado}`)
    ].join("\n");
    const csvGastos = ["fecha,proveedor,concepto,categoria,base,iva,total,estado",
      ...gastos.map((g) => `${g.fecha},"${g.proveedor ?? ""}","${g.concepto.replace(/"/g,"'")}",${g.categoria},${g.base_imponible},${g.iva_importe},${g.total},${g.estado}`)
    ].join("\n");
    carpeta.file("facturas.csv", csvFacturas);
    carpeta.file("gastos.csv", csvGastos);

    const blob = await zip.generateAsync({ type: "blob" });
    const filename = `gestoria-${anio}-${String(mes).padStart(2,"0")}.zip`;
    return { blob, filename, resumen };
  }

  async function exportarZIP() {
    const { blob, filename } = await construirZIP();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async function enviarAGestoria() {
    if (!currentCompanyId) return;
    if (!company?.gestoria_email) {
      toast({ title: "Falta email de gestoría", description: "Configúralo en 'Mi empresa'.", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      const { blob, filename, resumen } = await construirZIP();
      const buf = await blob.arrayBuffer();
      // base64 en chunks para evitar problemas con stacks grandes
      let bin = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
      }
      const zipBase64 = btoa(bin);
      const { data, error } = await supabase.functions.invoke("send-gestoria-email", {
        body: { companyId: currentCompanyId, anio, mes, zipBase64, filename, resumenTexto: resumen },
      });
      if (error) throw error;
      toast({ title: "Enviado", description: `Correo enviado a ${data?.sentTo ?? company.gestoria_email}` });
    } catch (e: any) {
      toast({ title: "Error al enviar", description: e?.message ?? "Inténtalo de nuevo", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  async function marcarMesListo() {
    if (!currentCompanyId) return;
    const { error } = await supabase.from("monthly_closures")
      .upsert({ company_id: currentCompanyId, anio, mes, mes_listo: true }, { onConflict: "company_id,anio,mes" });
    if (error) toast({ title: "Error", variant: "destructive" }); else { toast({ title: "Mes marcado como listo" }); load(); }
  }
  async function marcarTrimListo() {
    if (!currentCompanyId) return;
    const { error } = await supabase.from("monthly_closures")
      .upsert({ company_id: currentCompanyId, anio, mes, trimestre_listo: true }, { onConflict: "company_id,anio,mes" });
    if (error) toast({ title: "Error", variant: "destructive" }); else { toast({ title: "Trimestre marcado como listo" }); load(); }
  }

  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const anios = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];

  return (
    <>
      <PageHeader title="Documentos para gestoría" description="Exporta el mes completo en un ZIP listo para enviar." />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>{meses.map((m) => <SelectItem key={m} value={String(m)} className="capitalize">{mesNombre(m)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>{anios.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={exportarZIP}><Download className="mr-2 h-4 w-4" />Exportar ZIP del mes</Button>
        <Button variant="outline" onClick={enviarAGestoria} disabled={enviando || !company?.gestoria_email}>
          <Send className="mr-2 h-4 w-4" />{enviando ? "Enviando…" : "Enviar a gestoría"}
        </Button>
        <Button variant={closure?.mes_listo ? "secondary" : "default"} onClick={marcarMesListo}>
          <CheckCircle2 className="mr-2 h-4 w-4" />{closure?.mes_listo ? "Mes listo ✓" : "Mes listo"}
        </Button>
        <Button variant={closure?.trimestre_listo ? "secondary" : "outline"} onClick={marcarTrimListo}>
          <CheckCircle2 className="mr-2 h-4 w-4" />{closure?.trimestre_listo ? "Trimestre listo ✓" : "Trimestre listo"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Facturas emitidas ({invs.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Nº</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {invs.map((i) => (
                  <TableRow key={i.id}><TableCell className="font-mono text-sm">{i.numero}</TableCell><TableCell>{fechaCorta(i.fecha)}</TableCell><TableCell className="text-right">{eur(i.total)}</TableCell></TableRow>
                ))}
                {!invs.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin facturas este mes</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Gastos ({gastos.length})</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {gastos.map((g) => (
                  <TableRow key={g.id}><TableCell>{fechaCorta(g.fecha)}</TableCell><TableCell>{g.proveedor ?? "—"}</TableCell><TableCell className="text-right">{eur(g.total)}</TableCell></TableRow>
                ))}
                {!gastos.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sin gastos este mes</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
