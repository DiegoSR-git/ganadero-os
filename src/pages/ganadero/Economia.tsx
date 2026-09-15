import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { useAuth } from "@/hooks/useAuth";
import { eur, fechaCorta } from "@/lib/format";
import {
  CATEGORIAS_GASTO, GASTO_LABEL, CATEGORIAS_INGRESO, INGRESO_LABEL,
} from "@/lib/ganado";
import { toast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

type Gasto = { id: string; fecha: string; proveedor: string | null; concepto: string; categoria: string; total: number; lote_id: string | null; animal_id: string | null };
type Ingreso = { id: string; fecha: string; concepto: string; categoria: string; importe: number; cliente: string | null };

const hoy = () => new Date().toISOString().slice(0, 10);

export default function Economia() {
  const { explotacionId } = useExplotacion();
  const { user } = useAuth();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [lotes, setLotes] = useState<{ id: string; nombre: string }[]>([]);
  const [animales, setAnimales] = useState<{ id: string; crotal: string }[]>([]);
  const [openG, setOpenG] = useState(false);
  const [openI, setOpenI] = useState(false);
  const [fG, setFG] = useState({ fecha: hoy(), proveedor: "", concepto: "", categoria: "alimentacion", total: "", iva: "21", lote_id: "", animal_id: "", observaciones: "" });
  const [fI, setFI] = useState({ fecha: hoy(), concepto: "", categoria: "venta_animales", importe: "", cliente: "", animal_id: "", observaciones: "" });

  const cargar = useCallback(async () => {
    if (!explotacionId) { setGastos([]); setIngresos([]); return; }
    const [g, i, l, a] = await Promise.all([
      supabase.from("expenses").select("id, fecha, proveedor, concepto, categoria, total, lote_id, animal_id")
        .eq("explotacion_id", explotacionId).order("fecha", { ascending: false }),
      supabase.from("ingresos").select("id, fecha, concepto, categoria, importe, cliente")
        .eq("explotacion_id", explotacionId).order("fecha", { ascending: false }),
      supabase.from("lotes").select("id, nombre").eq("explotacion_id", explotacionId).order("nombre"),
      supabase.from("animales").select("id, crotal").eq("explotacion_id", explotacionId).order("crotal").limit(1000),
    ]);
    setGastos((g.data ?? []) as Gasto[]);
    setIngresos((i.data ?? []) as Ingreso[]);
    setLotes(l.data ?? []);
    setAnimales(a.data ?? []);
  }, [explotacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const totales = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7);
    const g = gastos.filter((x) => x.fecha?.startsWith(mes)).reduce((a, x) => a + Number(x.total ?? 0), 0);
    const i = ingresos.filter((x) => x.fecha?.startsWith(mes)).reduce((a, x) => a + Number(x.importe ?? 0), 0);
    return { g, i, b: i - g };
  }, [gastos, ingresos]);

  const crearGasto = async () => {
    if (!explotacionId || !fG.concepto.trim() || !fG.total) { toast({ title: "Concepto e importe son obligatorios", variant: "destructive" }); return; }
    const total = Number(fG.total);
    const iva = Number(fG.iva);
    const base = Math.round((total / (1 + iva / 100)) * 100) / 100;
    const { error } = await supabase.from("expenses").insert({
      explotacion_id: explotacionId,
      fecha: fG.fecha,
      proveedor: fG.proveedor || null,
      concepto: fG.concepto.trim(),
      categoria: fG.categoria,
      base_imponible: base,
      iva_porcentaje: iva,
      iva_importe: Math.round((total - base) * 100) / 100,
      total,
      origen: "web",
      lote_id: fG.lote_id || null,
      animal_id: fG.animal_id || null,
      observaciones: fG.observaciones || null,
    });
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return; }
    setOpenG(false);
    setFG({ ...fG, concepto: "", total: "", proveedor: "", observaciones: "" });
    cargar();
  };

  const crearIngreso = async () => {
    if (!explotacionId || !fI.concepto.trim() || !fI.importe) { toast({ title: "Concepto e importe son obligatorios", variant: "destructive" }); return; }
    const { error } = await supabase.from("ingresos").insert({
      explotacion_id: explotacionId,
      fecha: fI.fecha,
      concepto: fI.concepto.trim(),
      categoria: fI.categoria,
      importe: Number(fI.importe),
      cliente: fI.cliente || null,
      animal_id: fI.animal_id || null,
      observaciones: fI.observaciones || null,
      created_by: user?.id ?? null,
    });
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return; }
    setOpenI(false);
    setFI({ ...fI, concepto: "", importe: "", cliente: "", observaciones: "" });
    cargar();
  };

  return (
    <>
      <PageHeader title="Economía" description="Gastos e ingresos de la explotación." />

      <div className="mb-4 grid grid-cols-3 gap-3">
        {[
          { t: "Ingresos del mes", v: eur(totales.i) },
          { t: "Gastos del mes", v: eur(totales.g) },
          { t: "Balance", v: eur(totales.b), neg: totales.b < 0 },
        ].map((c) => (
          <Card key={c.t} className="shadow-card">
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{c.t}</div>
              <div className={`text-lg font-bold sm:text-xl ${c.neg ? "text-destructive" : ""}`}>{c.v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="gastos">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="gastos">Gastos</TabsTrigger>
            <TabsTrigger value="ingresos">Ingresos</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!explotacionId} onClick={() => setOpenI(true)}><Plus className="mr-1 h-4 w-4" /> Ingreso</Button>
            <Button size="sm" disabled={!explotacionId} onClick={() => setOpenG(true)}><Plus className="mr-1 h-4 w-4" /> Gasto</Button>
          </div>
        </div>

        <TabsContent value="gastos">
          <Card className="shadow-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Concepto</TableHead>
                  <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                  <TableHead className="hidden md:table-cell">Proveedor</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {gastos.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell>{fechaCorta(g.fecha)}</TableCell>
                      <TableCell className="font-medium">{g.concepto}</TableCell>
                      <TableCell className="hidden sm:table-cell">{GASTO_LABEL[g.categoria] ?? g.categoria}</TableCell>
                      <TableCell className="hidden md:table-cell">{g.proveedor ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{eur(g.total)}</TableCell>
                    </TableRow>
                  ))}
                  {gastos.length === 0 && <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Sin gastos registrados.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ingresos">
          <Card className="shadow-card">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Concepto</TableHead>
                  <TableHead className="hidden sm:table-cell">Categoría</TableHead>
                  <TableHead className="hidden md:table-cell">Cliente</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ingresos.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{fechaCorta(i.fecha)}</TableCell>
                      <TableCell className="font-medium">{i.concepto}</TableCell>
                      <TableCell className="hidden sm:table-cell">{INGRESO_LABEL[i.categoria] ?? i.categoria}</TableCell>
                      <TableCell className="hidden md:table-cell">{i.cliente ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">{eur(i.importe)}</TableCell>
                    </TableRow>
                  ))}
                  {ingresos.length === 0 && <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Sin ingresos registrados.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openG} onOpenChange={setOpenG}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nuevo gasto</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Fecha</Label>
              <Input type="date" value={fG.fecha} onChange={(e) => setFG({ ...fG, fecha: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Categoría</Label>
              <Select value={fG.categoria} onValueChange={(v) => setFG({ ...fG, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_GASTO.map((c) => <SelectItem key={c} value={c}>{GASTO_LABEL[c]}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Concepto *</Label>
              <Input value={fG.concepto} onChange={(e) => setFG({ ...fG, concepto: e.target.value })} placeholder="Pienso, vacunas, gasoil…" /></div>
            <div className="space-y-1.5"><Label>Proveedor</Label>
              <Input value={fG.proveedor} onChange={(e) => setFG({ ...fG, proveedor: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Total (€) *</Label>
              <Input type="number" inputMode="decimal" value={fG.total} onChange={(e) => setFG({ ...fG, total: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>IVA %</Label>
              <Select value={fG.iva} onValueChange={(v) => setFG({ ...fG, iva: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["21", "10", "4", "0"].map((x) => <SelectItem key={x} value={x}>{x}%</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>Lote</Label>
              <Select value={fG.lote_id} onValueChange={(v) => setFG({ ...fG, lote_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sin lote" /></SelectTrigger>
                <SelectContent>{lotes.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Animal</Label>
              <Select value={fG.animal_id} onValueChange={(v) => setFG({ ...fG, animal_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sin animal" /></SelectTrigger>
                <SelectContent>{animales.map((a) => <SelectItem key={a.id} value={a.id}>{a.crotal}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Observaciones</Label>
              <Textarea rows={2} value={fG.observaciones} onChange={(e) => setFG({ ...fG, observaciones: e.target.value })} /></div>
            <div className="sm:col-span-2"><Button className="w-full" onClick={crearGasto}>Guardar gasto</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openI} onOpenChange={setOpenI}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nuevo ingreso</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Fecha</Label>
              <Input type="date" value={fI.fecha} onChange={(e) => setFI({ ...fI, fecha: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Categoría</Label>
              <Select value={fI.categoria} onValueChange={(v) => setFI({ ...fI, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS_INGRESO.map((c) => <SelectItem key={c} value={c}>{INGRESO_LABEL[c]}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Concepto *</Label>
              <Input value={fI.concepto} onChange={(e) => setFI({ ...fI, concepto: e.target.value })} placeholder="Venta de 5 terneros" /></div>
            <div className="space-y-1.5"><Label>Importe (€) *</Label>
              <Input type="number" inputMode="decimal" value={fI.importe} onChange={(e) => setFI({ ...fI, importe: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Cliente</Label>
              <Input value={fI.cliente} onChange={(e) => setFI({ ...fI, cliente: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Animal</Label>
              <Select value={fI.animal_id} onValueChange={(v) => setFI({ ...fI, animal_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sin animal" /></SelectTrigger>
                <SelectContent>{animales.map((a) => <SelectItem key={a.id} value={a.id}>{a.crotal}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Observaciones</Label>
              <Textarea rows={2} value={fI.observaciones} onChange={(e) => setFI({ ...fI, observaciones: e.target.value })} /></div>
            <div className="sm:col-span-2"><Button className="w-full" onClick={crearIngreso}>Guardar ingreso</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
