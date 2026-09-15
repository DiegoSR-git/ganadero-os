import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { toast } from "@/hooks/use-toast";
import { Plus, Layers } from "lucide-react";

type Lote = { id: string; nombre: string; descripcion: string | null; estado: string; finca_id: string | null; parcela_id: string | null };

export default function Lotes() {
  const { explotacionId } = useExplotacion();
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [fincas, setFincas] = useState<{ id: string; nombre: string }[]>([]);
  const [parcelas, setParcelas] = useState<{ id: string; nombre: string; finca_id: string | null }[]>([]);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", finca_id: "", parcela_id: "" });

  const cargar = useCallback(async () => {
    if (!explotacionId) { setLotes([]); return; }
    const [l, f, p, a] = await Promise.all([
      supabase.from("lotes").select("*").eq("explotacion_id", explotacionId).order("nombre"),
      supabase.from("fincas").select("id, nombre").eq("explotacion_id", explotacionId).order("nombre"),
      supabase.from("parcelas").select("id, nombre, finca_id").eq("explotacion_id", explotacionId).order("nombre"),
      supabase.from("animales").select("lote_id").eq("explotacion_id", explotacionId).eq("estado", "activo"),
    ]);
    setLotes((l.data ?? []) as Lote[]);
    setFincas(f.data ?? []);
    setParcelas(p.data ?? []);
    const c: Record<string, number> = {};
    (a.data ?? []).forEach((x) => { if (x.lote_id) c[x.lote_id] = (c[x.lote_id] ?? 0) + 1; });
    setConteo(c);
  }, [explotacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    if (!explotacionId || !form.nombre.trim()) return;
    const { error } = await supabase.from("lotes").insert({
      explotacion_id: explotacionId,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion || null,
      finca_id: form.finca_id || null,
      parcela_id: form.parcela_id || null,
    });
    if (error) { toast({ title: "No se pudo crear", description: error.message, variant: "destructive" }); return; }
    setOpen(false); setForm({ nombre: "", descripcion: "", finca_id: "", parcela_id: "" }); cargar();
  };

  return (
    <>
      <PageHeader
        title="Lotes"
        description="Agrupa tus animales por manejo: reproductoras, novillas, terneros…"
        actions={<Button disabled={!explotacionId} onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Nuevo lote</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lotes.map((l) => (
          <Card key={l.id} className="shadow-card transition hover:shadow-elevated">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><Layers className="h-4 w-4" /></span>
                  <div>
                    <div className="font-semibold">{l.nombre}</div>
                    <div className="text-xs text-muted-foreground">{fincas.find((f) => f.id === l.finca_id)?.nombre ?? "Sin finca"}</div>
                  </div>
                </div>
                <Badge variant="secondary">{conteo[l.id] ?? 0} animales</Badge>
              </div>
              {l.descripcion && <p className="mt-3 text-sm text-muted-foreground">{l.descripcion}</p>}
              <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                <Link to="/animales">Ver animales</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {lotes.length === 0 && <p className="text-sm text-muted-foreground">Aún no has creado lotes.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo lote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre *</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Vacas reproductoras" /></div>
            <div className="space-y-1.5"><Label>Descripción</Label>
              <Textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Finca</Label>
              <Select value={form.finca_id} onValueChange={(v) => setForm({ ...form, finca_id: v, parcela_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Sin finca" /></SelectTrigger>
                <SelectContent>{fincas.map((f) => <SelectItem key={f.id} value={f.id}>{f.nombre}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>Parcela</Label>
              <Select value={form.parcela_id} onValueChange={(v) => setForm({ ...form, parcela_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sin parcela" /></SelectTrigger>
                <SelectContent>
                  {parcelas.filter((p) => !form.finca_id || p.finca_id === form.finca_id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select></div>
            <Button className="w-full" onClick={crear}>Crear lote</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
