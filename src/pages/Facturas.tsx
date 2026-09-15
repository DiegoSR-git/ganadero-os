import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Download, Search, CheckCircle2, FileSpreadsheet, Trash2, FileWarning, Lock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { eur, fechaCorta } from "@/lib/format";
import { generarFacturaPDF } from "@/lib/pdf";
import { invoiceSchema, firstError } from "@/lib/validation";
import { downloadCSV } from "@/lib/csv";

type Inv = any;
type Linea = {
  id?: string;
  concepto: string;
  cantidad: number;
  precio_unitario: number;
  descuento_porcentaje: number;
  iva_porcentaje: number;
};

const TIPOS_IVA = [0, 4, 10, 21];

const lineaVacia = (ivaDef = 21): Linea => ({
  concepto: "", cantidad: 1, precio_unitario: 0, descuento_porcentaje: 0, iva_porcentaje: ivaDef,
});

const empty: any = {
  fecha: new Date().toISOString().slice(0, 10),
  fecha_operacion: "",
  iva_porcentaje: 21,
  irpf_porcentaje: 0,
  base_imponible: 0,
  estado: "borrador",
  tipo: "ordinaria",
  serie: "A",
  mencion_legal: "",
  lineas: [lineaVacia()] as Linea[],
};

const baseLineaImporte = (l: Linea) =>
  +(Number(l.cantidad || 0) * Number(l.precio_unitario || 0) * (1 - Number(l.descuento_porcentaje || 0) / 100)).toFixed(2);

async function fetchLogoDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

export default function Facturas() {
  const { currentCompanyId } = useAuth();
  const [rows, setRows] = useState<Inv[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [q, setQ] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [filterMes, setFilterMes] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  const isLocked = !!form.id && form.estado && form.estado !== "borrador";

  async function load() {
    if (!currentCompanyId) return;
    const [{ data: invs }, { data: cls }, { data: co }] = await Promise.all([
      supabase.from("invoices").select("*, clients(nombre)").eq("company_id", currentCompanyId).order("fecha", { ascending: false }),
      supabase.from("clients").select("id, nombre, nif, direccion, codigo_postal, ciudad, provincia").eq("company_id", currentCompanyId).order("nombre"),
      supabase.from("companies").select("*").eq("id", currentCompanyId).maybeSingle(),
    ]);
    setRows(invs ?? []); setClients(cls ?? []); setCompany(co);
  }
  useEffect(() => { load(); }, [currentCompanyId]);

  async function nextNumero(serie: string) {
    const year = new Date().getFullYear();
    const prefix = `${serie}${year}-`;
    const { data } = await supabase.from("invoices")
      .select("numero").eq("company_id", currentCompanyId)
      .like("numero", `${prefix}%`).order("numero", { ascending: false }).limit(1);
    const last = data?.[0]?.numero?.split("-").pop();
    const next = last ? Number(last) + 1 : 1;
    return `${prefix}${String(next).padStart(4, "0")}`;
  }

  async function openNew() {
    const serie = company?.serie_facturacion ?? "A";
    const numero = await nextNumero(serie);
    setForm({
      ...empty,
      numero, serie,
      iva_porcentaje: company?.iva_default ?? 21,
      irpf_porcentaje: company?.irpf_default ?? 0,
      lineas: [lineaVacia(company?.iva_default ?? 21)],
    });
    setOpen(true);
  }

  async function openExisting(r: any) {
    const { data: lns } = await supabase.from("invoice_lines")
      .select("id, concepto, cantidad, precio_unitario, descuento_porcentaje, iva_porcentaje, importe, orden")
      .eq("invoice_id", r.id).order("orden", { ascending: true });
    const lineas: Linea[] = (lns && lns.length)
      ? lns.map((l: any) => ({
          id: l.id, concepto: l.concepto,
          cantidad: Number(l.cantidad ?? 1),
          precio_unitario: Number(l.precio_unitario ?? l.importe ?? 0),
          descuento_porcentaje: Number(l.descuento_porcentaje ?? 0),
          iva_porcentaje: Number(l.iva_porcentaje ?? r.iva_porcentaje ?? 21),
        }))
      : [{ concepto: r.concepto, cantidad: 1, precio_unitario: Number(r.base_imponible), descuento_porcentaje: 0, iva_porcentaje: Number(r.iva_porcentaje ?? 21) }];
    setForm({ ...r, lineas });
    setOpen(true);
  }

  async function abrirRectificativa(r: any) {
    const serie = company?.serie_facturacion ?? "A";
    const numero = await nextNumero(`R${serie}`);
    const { data: lns } = await supabase.from("invoice_lines")
      .select("concepto, cantidad, precio_unitario, descuento_porcentaje, iva_porcentaje, orden")
      .eq("invoice_id", r.id).order("orden", { ascending: true });
    const lineas: Linea[] = (lns ?? []).map((l: any) => ({
      concepto: l.concepto,
      cantidad: -Math.abs(Number(l.cantidad ?? 1)),
      precio_unitario: Number(l.precio_unitario ?? 0),
      descuento_porcentaje: Number(l.descuento_porcentaje ?? 0),
      iva_porcentaje: Number(l.iva_porcentaje ?? r.iva_porcentaje ?? 21),
    }));
    setForm({
      ...empty,
      numero, serie: `R${serie}`,
      tipo: "rectificativa",
      factura_rectificada_id: r.id,
      motivo_rectificacion: "",
      client_id: r.client_id,
      iva_porcentaje: r.iva_porcentaje,
      irpf_porcentaje: r.irpf_porcentaje ?? 0,
      mencion_legal: `Factura rectificativa de la factura ${r.numero} (${r.fecha}).`,
      lineas: lineas.length ? lineas : [lineaVacia(company?.iva_default ?? 21)],
    });
    setOpen(true);
  }

  function addLinea() {
    setForm((f: any) => ({ ...f, lineas: [...(f.lineas ?? []), lineaVacia(company?.iva_default ?? 21)] }));
  }
  function removeLinea(idx: number) {
    setForm((f: any) => {
      const arr = [...(f.lineas ?? [])];
      arr.splice(idx, 1);
      return { ...f, lineas: arr.length ? arr : [lineaVacia(company?.iva_default ?? 21)] };
    });
  }
  function updateLinea(idx: number, patch: Partial<Linea>) {
    setForm((f: any) => {
      const arr = [...(f.lineas ?? [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...f, lineas: arr };
    });
  }

  const totales = useMemo(() => {
    const lns: Linea[] = form.lineas ?? [];
    const desg = new Map<number, { base: number; cuota: number }>();
    let base = 0;
    for (const l of lns) {
      const b = baseLineaImporte(l);
      base += b;
      const tipo = Number(l.iva_porcentaje) || 0;
      const cuota = +(b * tipo / 100).toFixed(2);
      const acc = desg.get(tipo) ?? { base: 0, cuota: 0 };
      desg.set(tipo, { base: +(acc.base + b).toFixed(2), cuota: +(acc.cuota + cuota).toFixed(2) });
    }
    base = +base.toFixed(2);
    const ivaTotal = +Array.from(desg.values()).reduce((s, d) => s + d.cuota, 0).toFixed(2);
    const irpfPct = Number(form.irpf_porcentaje || 0);
    const irpf = +(base * irpfPct / 100).toFixed(2);
    const total = +(base + ivaTotal - irpf).toFixed(2);
    return { base, ivaTotal, irpf, total, desglose: Array.from(desg.entries()).sort((a,b)=>a[0]-b[0]) };
  }, [form.lineas, form.irpf_porcentaje]);

  async function save() {
    if (!currentCompanyId) return;
    if (isLocked) {
      toast({ title: "Factura bloqueada", description: "Una factura emitida no se puede modificar. Crea una rectificativa.", variant: "destructive" });
      return;
    }
    const lineasFiltradas: Linea[] = (form.lineas ?? [])
      .map((l: Linea) => ({ ...l, concepto: String(l.concepto ?? "").trim() }))
      .filter((l: Linea) => l.concepto && (Number(l.cantidad) !== 0) && Number(l.precio_unitario) !== 0);
    if (!lineasFiltradas.length) {
      toast({ title: "Faltan líneas", description: "Añade al menos una línea con concepto, cantidad y precio.", variant: "destructive" });
      return;
    }
    if (form.tipo === "rectificativa" && !form.motivo_rectificacion?.trim()) {
      toast({ title: "Motivo obligatorio", description: "Indica el motivo de la rectificación.", variant: "destructive" });
      return;
    }
    const conceptoResumen = lineasFiltradas.length === 1
      ? lineasFiltradas[0].concepto
      : lineasFiltradas.map((l, i) => `${i + 1}. ${l.concepto}`).join(" · ");
    // Tipo de IVA dominante (el de mayor base) para el campo legacy
    const ivaDominante = (() => {
      const map = new Map<number, number>();
      for (const l of lineasFiltradas) {
        map.set(l.iva_porcentaje, (map.get(l.iva_porcentaje) ?? 0) + baseLineaImporte(l));
      }
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 21;
    })();

    const formForSchema = { ...form, base_imponible: totales.base, concepto: conceptoResumen, iva_porcentaje: ivaDominante };
    const parsed = invoiceSchema.safeParse(formForSchema);
    if (!parsed.success) { toast({ title: "Datos inválidos", description: firstError(parsed.error), variant: "destructive" }); return; }

    const payload: any = {
      ...parsed.data,
      base_imponible: totales.base,
      iva_importe: totales.ivaTotal,
      irpf_importe: totales.irpf,
      total: totales.total,
      company_id: currentCompanyId,
    };
    if (!payload.client_id) delete payload.client_id;
    if (!payload.factura_rectificada_id) delete payload.factura_rectificada_id;
    if (!payload.fecha_operacion) delete payload.fecha_operacion;

    let invoiceId = form.id as string | undefined;
    if (invoiceId) {
      const { error } = await supabase.from("invoices").update(payload).eq("id", invoiceId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    } else {
      const { data: ins, error } = await supabase.from("invoices").insert(payload).select("id").single();
      if (error || !ins) { toast({ title: "Error", description: error?.message ?? "", variant: "destructive" }); return; }
      invoiceId = ins.id;
    }
    // Reemplazar líneas (solo permitido en borrador)
    await supabase.from("invoice_lines").delete().eq("invoice_id", invoiceId!);
    const linesPayload = lineasFiltradas.map((l, i) => {
      const baseLn = baseLineaImporte(l);
      const ivaLn = +(baseLn * Number(l.iva_porcentaje || 0) / 100).toFixed(2);
      return {
        invoice_id: invoiceId!, company_id: currentCompanyId,
        orden: i, concepto: l.concepto,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
        descuento_porcentaje: l.descuento_porcentaje,
        iva_porcentaje: l.iva_porcentaje,
        importe: baseLn,
        iva_importe: ivaLn,
        total: +(baseLn + ivaLn).toFixed(2),
      };
    });
    const { error: errLines } = await supabase.from("invoice_lines").insert(linesPayload);
    if (errLines) { toast({ title: "Error en líneas", description: errLines.message, variant: "destructive" }); return; }
    await supabase.from("invoices").update({ pdf_path: null }).eq("id", invoiceId!);
    toast({ title: form.id ? "Factura guardada" : "Factura creada" });
    setOpen(false); setForm(empty); load();
  }

  function exportarCSV() {
    if (!filtered.length) { toast({ title: "Nada que exportar" }); return; }
    downloadCSV(`facturas-${new Date().toISOString().slice(0,10)}.csv`,
      filtered.map((r) => ({
        numero: r.numero, serie: r.serie ?? "", tipo: r.tipo ?? "ordinaria",
        fecha: r.fecha, fecha_operacion: r.fecha_operacion ?? "",
        cliente: r.clients?.nombre ?? "",
        concepto: r.concepto, base: r.base_imponible, iva_porcentaje: r.iva_porcentaje,
        iva_importe: r.iva_importe, irpf_porcentaje: r.irpf_porcentaje ?? 0,
        irpf_importe: r.irpf_importe ?? 0, total: r.total, estado: r.estado,
        metodo_pago: r.metodo_pago ?? "", fecha_cobro: r.fecha_cobro ?? "",
      })));
  }

  async function descargarPDF(inv: any) {
    const cliente = clients.find((c) => c.id === inv.client_id) ?? null;
    const { data: lns } = await supabase.from("invoice_lines")
      .select("concepto, cantidad, precio_unitario, descuento_porcentaje, iva_porcentaje, importe, orden")
      .eq("invoice_id", inv.id).order("orden", { ascending: true });
    let rect: { numero: string; fecha: string } | null = null;
    if (inv.factura_rectificada_id) {
      const { data } = await supabase.from("invoices").select("numero, fecha").eq("id", inv.factura_rectificada_id).maybeSingle();
      if (data) rect = { numero: data.numero, fecha: data.fecha };
    }
    const doc = generarFacturaPDF({
      numero: inv.numero, serie: inv.serie,
      fecha: inv.fecha, fecha_operacion: inv.fecha_operacion, fecha_vencimiento: inv.fecha_vencimiento,
      concepto: inv.concepto,
      base_imponible: Number(inv.base_imponible), iva_porcentaje: Number(inv.iva_porcentaje),
      iva_importe: Number(inv.iva_importe),
      irpf_porcentaje: Number(inv.irpf_porcentaje ?? 0),
      irpf_importe: Number(inv.irpf_importe ?? 0),
      total: Number(inv.total), notas: inv.notas,
      lineas: (lns ?? []).map((l: any) => ({
        concepto: l.concepto, cantidad: Number(l.cantidad ?? 1),
        precio_unitario: Number(l.precio_unitario ?? 0),
        descuento_porcentaje: Number(l.descuento_porcentaje ?? 0),
        iva_porcentaje: Number(l.iva_porcentaje ?? inv.iva_porcentaje ?? 21),
        importe: Number(l.importe),
      })),
      emisor: {
        nombre: company?.nombre_comercial, nif: company?.nif,
        direccion: company?.direccion, codigo_postal: company?.codigo_postal,
        ciudad: company?.ciudad, provincia: company?.provincia,
        email: company?.email, telefono: company?.telefono,
      },
      cliente: cliente ? {
        nombre: cliente.nombre, nif: cliente.nif,
        direccion: cliente.direccion, codigo_postal: cliente.codigo_postal,
        ciudad: cliente.ciudad, provincia: cliente.provincia,
      } : null,
      template: company?.factura_template ?? "profesional",
      custom: company?.factura_template === "personalizada" ? {
        color_primario: company?.factura_color_primario,
        color_acento: company?.factura_color_acento,
        encabezado: company?.factura_encabezado,
        pie: company?.factura_pie,
        logo_data_url: await fetchLogoDataUrl(company?.factura_logo_url),
      } : null,
      metodo_pago: inv.metodo_pago,
      tipo: inv.tipo,
      factura_rectificada: rect,
      motivo_rectificacion: inv.motivo_rectificacion,
      mencion_legal: inv.mencion_legal,
    });
    doc.save(`factura-${inv.numero}.pdf`);
  }

  async function marcarCobrada(inv: any) {
    const { error } = await supabase.from("invoices").update({ estado: "cobrada", fecha_cobro: new Date().toISOString().slice(0,10) }).eq("id", inv.id);
    if (error) toast({ title: "Error", variant: "destructive" }); else { toast({ title: "Marcada como cobrada" }); load(); }
  }

  async function emitir() {
    // Pasa de borrador a "enviada" (queda inmutable)
    if (!form.id) {
      toast({ title: "Guarda primero el borrador", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("invoices").update({ estado: "enviada" }).eq("id", form.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Factura emitida", description: "Queda bloqueada. Solo se puede corregir mediante rectificativa." });
    setOpen(false); setForm(empty); load();
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (filterEstado !== "todos" && r.estado !== filterEstado) return false;
    if (filterMes !== "todos" && r.fecha?.slice(0,7) !== filterMes) return false;
    if (q && !`${r.numero} ${r.concepto} ${r.clients?.nombre ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, filterEstado, filterMes, q]);

  const meses = Array.from(new Set(rows.map((r) => r.fecha?.slice(0,7)).filter(Boolean))).sort().reverse();

  return (
    <>
      <PageHeader title="Facturas" description="Conformes al RD 1619/2012. Las facturas emitidas son inmutables: corrígelas con una factura rectificativa."
        actions={<>
          <Button variant="outline" onClick={exportarCSV}><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</Button>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />Nueva factura</Button>
        </>} />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar nº, concepto, cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="enviada">Enviada</SelectItem>
            <SelectItem value="cobrada">Cobrada</SelectItem>
            <SelectItem value="vencida">Vencida</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMes} onValueChange={setFilterMes}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los meses</SelectItem>
            {meses.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nº</TableHead>
            <TableHead className="hidden sm:table-cell">Tipo</TableHead>
            <TableHead className="hidden sm:table-cell">Fecha</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="hidden md:table-cell">Concepto</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell className="font-mono text-sm cursor-pointer" onClick={() => openExisting(r)}>{r.numero}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs">
                  {r.tipo === "rectificativa"
                    ? <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800"><FileWarning className="h-3 w-3" />Rect.</span>
                    : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell">{fechaCorta(r.fecha)}</TableCell>
                <TableCell className="max-w-[140px] sm:max-w-none truncate">{r.clients?.nombre ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell max-w-[280px] truncate">{r.concepto}</TableCell>
                <TableCell className="text-right font-medium">{eur(r.total)}</TableCell>
                <TableCell><StatusBadge value={r.estado} /></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="sm" variant="ghost" onClick={() => descargarPDF(r)} title="Descargar PDF">
                    <Download className="h-4 w-4" />
                  </Button>
                  {r.estado !== "cobrada" && (
                    <Button size="sm" variant="ghost" onClick={() => marcarCobrada(r)} title="Marcar cobrada">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    </Button>
                  )}
                  {r.estado !== "borrador" && r.tipo !== "rectificativa" && (
                    <Button size="sm" variant="ghost" onClick={() => abrirRectificativa(r)} title="Crear factura rectificativa">
                      <FileWarning className="h-4 w-4 text-amber-600" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin facturas</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {form.tipo === "rectificativa" && <FileWarning className="h-4 w-4 text-amber-600" />}
              {form.id
                ? (form.tipo === "rectificativa" ? "Factura rectificativa" : "Editar factura")
                : (form.tipo === "rectificativa" ? "Nueva factura rectificativa" : "Nueva factura")}
              {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
            </DialogTitle>
          </DialogHeader>

          {isLocked && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Esta factura ya está emitida y no se puede modificar (RD 1619/2012). Para corregirla, cierra este diálogo y pulsa el icono de rectificativa.
            </div>
          )}

          <fieldset disabled={isLocked} className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="space-y-1.5"><Label>Serie</Label><Input value={form.serie ?? "A"} onChange={(e) => setForm({ ...form, serie: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Número</Label><Input value={form.numero ?? ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2 md:col-span-1"><Label>Fecha de expedición</Label><Input type="date" value={form.fecha ?? ""} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
            <div className="space-y-1.5 col-span-2 md:col-span-1"><Label>Fecha de operación <span className="text-xs text-muted-foreground">(si difiere)</span></Label>
              <Input type="date" value={form.fecha_operacion ?? ""} onChange={(e) => setForm({ ...form, fecha_operacion: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2 md:col-span-1"><Label>Vencimiento</Label>
              <Input type="date" value={form.fecha_vencimiento ?? ""} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2 md:col-span-3"><Label>Cliente</Label>
              <Select value={form.client_id ?? ""} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {form.tipo === "rectificativa" && (
            <div className="space-y-1.5">
              <Label>Motivo de la rectificación *</Label>
              <Textarea value={form.motivo_rectificacion ?? ""} onChange={(e) => setForm({ ...form, motivo_rectificacion: e.target.value })}
                placeholder="Ej.: Error en la base imponible, devolución parcial, etc." />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Líneas de la factura</Label>
              <Button type="button" size="sm" variant="outline" onClick={addLinea}>
                <Plus className="mr-1 h-3.5 w-3.5" />Añadir línea
              </Button>
            </div>
            <div className="space-y-3 rounded-md border p-2">
              <div className="hidden md:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                <div className="col-span-5">Concepto</div>
                <div className="col-span-1 text-right">Cant.</div>
                <div className="col-span-2 text-right">Precio (€)</div>
                <div className="col-span-1 text-right">Dto%</div>
                <div className="col-span-1 text-right">IVA%</div>
                <div className="col-span-1 text-right">Importe</div>
                <div className="col-span-1" />
              </div>
              {(form.lineas ?? []).map((ln: Linea, idx: number) => {
                const importe = baseLineaImporte(ln);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-md border bg-muted/20 p-2 md:border-0 md:bg-transparent md:p-0">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="md:hidden text-xs text-muted-foreground">Concepto</Label>
                      <Input placeholder="Concepto" value={ln.concepto} onChange={(e) => updateLinea(idx, { concepto: e.target.value })} />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <Label className="md:hidden text-xs text-muted-foreground">Cant.</Label>
                      <Input type="number" step="0.01" inputMode="decimal" value={ln.cantidad} onChange={(e) => updateLinea(idx, { cantidad: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-8 md:col-span-2">
                      <Label className="md:hidden text-xs text-muted-foreground">Precio (€)</Label>
                      <Input type="number" step="0.01" inputMode="decimal" value={ln.precio_unitario} onChange={(e) => updateLinea(idx, { precio_unitario: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <Label className="md:hidden text-xs text-muted-foreground">Dto%</Label>
                      <Input type="number" step="0.01" inputMode="decimal" value={ln.descuento_porcentaje} onChange={(e) => updateLinea(idx, { descuento_porcentaje: Number(e.target.value) })} />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <Label className="md:hidden text-xs text-muted-foreground">IVA%</Label>
                      <Select value={String(ln.iva_porcentaje)} onValueChange={(v) => updateLinea(idx, { iva_porcentaje: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_IVA.map((t) => <SelectItem key={t} value={String(t)}>{t}%</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3 md:col-span-1 text-right text-sm font-medium self-end pb-2 md:pb-0">{eur(importe)}</div>
                    <Button type="button" size="icon" variant="ghost" className="col-span-1 self-end" onClick={() => removeLinea(idx)} disabled={(form.lineas ?? []).length <= 1} title="Eliminar línea">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1.5"><Label>IRPF (%)</Label>
              <Input type="number" step="0.01" value={form.irpf_porcentaje ?? 0} onChange={(e) => setForm({ ...form, irpf_porcentaje: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5"><Label>Estado</Label>
              <Select value={form.estado ?? "borrador"} onValueChange={(v) => setForm({ ...form, estado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="enviada">Enviada</SelectItem>
                  <SelectItem value="cobrada">Cobrada</SelectItem>
                  <SelectItem value="vencida">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Método de pago</Label>
              <Select value={form.metodo_pago ?? ""} onValueChange={(v) => setForm({ ...form, metodo_pago: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="bizum">Bizum</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Mención legal <span className="text-xs text-muted-foreground">(p.ej. "Operación exenta de IVA art. 20.Uno LIVA", "Inversión del sujeto pasivo art. 84")</span></Label>
            <Textarea value={form.mencion_legal ?? ""} onChange={(e) => setForm({ ...form, mencion_legal: e.target.value })} rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={form.notas ?? ""} onChange={(e) => setForm({ ...form, notas: e.target.value })} rows={2} />
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span>Base imponible:</span><span>{eur(totales.base)}</span></div>
            {totales.desglose.map(([tipo, v]) => (
              <div key={tipo} className="flex justify-between text-muted-foreground">
                <span>{tipo === 0 ? "IVA exento (0%)" : `IVA ${tipo}% s/ ${eur(v.base)}`}:</span>
                <span>{eur(v.cuota)}</span>
              </div>
            ))}
            {Number(form.irpf_porcentaje) > 0 && (
              <div className="flex justify-between text-destructive"><span>Retención IRPF ({form.irpf_porcentaje}%):</span><span>-{eur(totales.irpf)}</span></div>
            )}
            <div className="flex justify-between font-semibold pt-1 border-t"><span>Total:</span><span>{eur(totales.total)}</span></div>
          </div>
          </fieldset>

          <DialogFooter className="gap-2">
            {form.id && form.estado === "borrador" && (
              <Button variant="outline" onClick={emitir} title="Emitir queda inmutable">
                <Lock className="mr-2 h-4 w-4" />Emitir factura
              </Button>
            )}
            <Button onClick={save} disabled={isLocked}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}