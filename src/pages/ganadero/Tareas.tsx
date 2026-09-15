import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { useAuth } from "@/hooks/useAuth";
import { fechaCorta } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

type Tarea = {
  id: string; titulo: string; descripcion: string | null; fecha_limite: string | null;
  prioridad: string; estado: string;
};

export default function Tareas() {
  const { explotacionId } = useExplotacion();
  const { user } = useAuth();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha_limite: "", prioridad: "normal" });

  const cargar = useCallback(async () => {
    if (!explotacionId) { setTareas([]); return; }
    const { data } = await supabase.from("tareas").select("*")
      .eq("explotacion_id", explotacionId).order("estado").order("fecha_limite", { nullsFirst: false });
    setTareas((data ?? []) as Tarea[]);
  }, [explotacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crear = async () => {
    if (!explotacionId || !form.titulo.trim()) return;
    const { error } = await supabase.from("tareas").insert({
      explotacion_id: explotacionId,
      titulo: form.titulo.trim(),
      descripcion: form.descripcion || null,
      fecha_limite: form.fecha_limite || null,
      prioridad: form.prioridad,
      created_by: user?.id ?? null,
    });
    if (error) { toast({ title: "No se pudo crear", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    setForm({ titulo: "", descripcion: "", fecha_limite: "", prioridad: "normal" });
    cargar();
  };

  const alternar = async (t: Tarea) => {
    await supabase.from("tareas").update({ estado: t.estado === "pendiente" ? "hecha" : "pendiente" }).eq("id", t.id);
    cargar();
  };

  return (
    <>
      <PageHeader
        title="Tareas"
        description="Lo que tienes pendiente en la explotación."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!explotacionId}><Plus className="mr-1 h-4 w-4" /> Nueva tarea</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label>Título *</Label>
                  <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Descripción</Label>
                  <Textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>Fecha límite</Label>
                    <Input type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Prioridad</Label>
                    <Select value={form.prioridad} onValueChange={(v) => setForm({ ...form, prioridad: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baja">Baja</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alta">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full" onClick={crear}>Crear tarea</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {tareas.length === 0 ? (
        <Card className="shadow-card"><CardContent className="p-6 text-sm text-muted-foreground">Sin tareas registradas.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tareas.map((t) => (
            <Card key={t.id} className="shadow-card">
              <CardContent className="flex items-start gap-3 p-4">
                <Checkbox checked={t.estado !== "pendiente"} onCheckedChange={() => alternar(t)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className={`font-medium ${t.estado !== "pendiente" ? "text-muted-foreground line-through" : ""}`}>{t.titulo}</div>
                  {t.descripcion && <p className="text-sm text-muted-foreground">{t.descripcion}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {t.fecha_limite && <span>Hasta {fechaCorta(t.fecha_limite)}</span>}
                    <Badge variant={t.prioridad === "alta" ? "destructive" : "secondary"}>{t.prioridad}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
