import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Search, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { eur, fechaCorta } from "@/lib/format";
import { expenseSchema, firstError } from "@/lib/validation";
import { downloadCSV } from "@/lib/csv";

const CATEGORIAS = ["combustible","material","herramienta","comida","alojamiento","transporte","suministros","otros"];
const empty: any = { fecha: new Date().toISOString().slice(0,10), categoria: "otros", iva_porcentaje: 21, base_imponible: 0, estado: "pendiente" };

export default function Gastos() {
  const { currentCompanyId } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState("todos");
  const [fCat, setFCat] = useState("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(empty);

  async function load() {
    if (!currentCompanyId) return;
    const { data } = await supabase.from("expenses").select("*").eq("company_id", currentCompanyId).order("fecha", { ascending: false });
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, [currentCompanyId]);

  function recalc(base: number, iva: number) {
    const bi = Number(base) || 0; const ip = Number(iva) || 0;
    const importe = +(bi * ip / 100).toFixed(2);
    return { iva_importe: importe, total: +(bi + importe).toFixed(2) };
  }

  async function save() {
    if (!currentCompanyId) return;
    const parsed = expenseSchema.safeParse(form);
    if (!parsed.success) { toast({ title: "Datos inválidos", description: firstError(parsed.error), variant: "destructive" }); return; }
    const calc = recalc(parsed.data.base_imponible, parsed.data.iva_porcentaje);
    const payload: any = { ...parsed.data, ...calc, company_id: currentCompanyId, proveedor: form.proveedor ?? null };
    const { error } = form.id
      ? await supabase.from("expenses").update(payload).eq("id", form.id)
      : await supabase.from("expenses").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Gasto guardado" });
    setOpen(false); setForm(empty); load();
  }

  function exportarCSV() {
    if (!filtered.length) { toast({ title: "Nada que exportar" }); return; }
    downloadCSV(`gastos-${new Date().toISOString().slice(0,10)}.csv`,
      filtered.map((g) => ({
        fecha: g.fecha, proveedor: g.proveedor ?? "", concepto: g.concepto, categoria: g.categoria,
        base: g.base_imponible, iva_porcentaje: g.iva_porcentaje, iva_importe: g.iva_importe,
        total: g.total, estado: g.estado, origen: g.origen,
      })));
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (fEstado !== "todos" && r.estado !== fEstado) return false;
    if (fCat !== "todos" && r.categoria !== fCat) return false;
    if (q && !`${r.proveedor ?? ""} ${r.concepto}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, fEstado, fCat, q]);

  return (
    <>
      <PageHeader title="Gastos y tickets" description="Registra los gastos del día a día. Los recibidos por WhatsApp aparecen aquí también."
        actions={<>
          <Button variant="outline" onClick={exportarCSV}><Download className="mr-2 h-4 w-4" />CSV</Button>
          <Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />Nuevo gasto</Button>
        </>} />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar proveedor o concepto…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={fEstado} onValueChange={setFEstado}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="revisado">Revisado</SelectItem>
            <SelectItem value="rechazado">Rechazado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fCat} onValueChange={setFCat}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las categorías</SelectItem>
            {CATEGORIAS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead className="hidden sm:table-cell">Proveedor</TableHead>
            <TableHead>Concepto</TableHead>
            <TableHead className="hidden md:table-cell">Categoría</TableHead>
            <TableHead className="hidden lg:table-cell">Origen</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="hidden sm:table-cell">Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setForm(r); setOpen(true); }}>
                <TableCell className="whitespace-nowrap">{fechaCorta(r.fecha)}</TableCell>
                <TableCell className="hidden sm:table-cell">{r.proveedor ?? "—"}</TableCell>
                <TableCell className="max-w-[160px] sm:max-w-[260px] truncate">
                  <div>{r.concepto}</div>
                  <div className="text-xs text-muted-foreground capitalize sm:hidden">{r.categoria} · {r.proveedor ?? "—"}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell capitalize">{r.categoria}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground capitalize">{r.origen}</TableCell>
                <TableCell className="text-right font-medium">{eur(r.total)}</TableCell>
                <TableCell className="hidden sm:table-cell"><StatusBadge value={r.estado} /></TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin gastos</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Editar gasto" : "Nuevo gasto"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={form.fecha ?? ""} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Proveedor</Label><Input value={form.proveedor ?? ""} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Concepto *</Label><Input value={form.concepto ?? ""} onChange={(e) => setForm({ ...form, concepto: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Categoría</Label>
              <Select value={form.categoria ?? "otros"} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Estado</Label>
              <Select value={form.estado ?? "pendiente"} onValueChange={(v) => setForm({ ...form, estado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="revisado">Revisado</SelectItem>
                  <SelectItem value="rechazado">Rechazado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Base (€)</Label><Input type="number" step="0.01" value={form.base_imponible ?? 0} onChange={(e) => setForm({ ...form, base_imponible: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>IVA (%)</Label><Input type="number" step="0.01" value={form.iva_porcentaje ?? 21} onChange={(e) => setForm({ ...form, iva_porcentaje: e.target.value })} /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>Observaciones</Label><Textarea value={form.observaciones ?? ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
            <div className="md:col-span-2 rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between"><span>Base:</span><span>{eur(Number(form.base_imponible) || 0)}</span></div>
              <div className="flex justify-between"><span>IVA ({form.iva_porcentaje || 0}%):</span><span>{eur(recalc(form.base_imponible, form.iva_porcentaje).iva_importe)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total:</span><span>{eur(recalc(form.base_imponible, form.iva_porcentaje).total)}</span></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
