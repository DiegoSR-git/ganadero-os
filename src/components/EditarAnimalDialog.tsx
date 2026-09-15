import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ESTADOS_REPRODUCTIVOS, REPRO_LABEL } from "@/lib/ganado";
import { useCatalogoGanado } from "@/hooks/useCatalogoGanado";
import { Trash2 } from "lucide-react";

export type AnimalEditable = {
  id: string;
  crotal: string;
  especie?: string | null;
  sexo: string;
  raza: string | null;
  estado: string;
  estado_reproductivo: string | null;
  fecha_nacimiento: string | null;
  peso_actual?: number | null;
  lote_id: string | null;
  observaciones?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  animal: AnimalEditable | null;
  lotes: { id: string; nombre: string }[];
  onSaved?: () => void;
  onDeleted?: () => void;
};

const SIN_LOTE = "__sin_lote__";
const SIN_REPRO = "__sin_repro__";

export default function EditarAnimalDialog({ open, onOpenChange, animal, lotes, onSaved, onDeleted }: Props) {
  const { razasDe } = useCatalogoGanado();
  const [form, setForm] = useState<AnimalEditable | null>(animal);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);

  useEffect(() => { setForm(animal); }, [animal]);

  if (!form) return null;

  const guardar = async () => {
    if (!form.crotal.trim()) {
      toast({ title: "El crotal es obligatorio", variant: "destructive" });
      return;
    }
    setGuardando(true);
    const { error } = await supabase.from("animales").update({
      crotal: form.crotal.trim(),
      sexo: form.sexo,
      raza: form.raza || null,
      estado: form.estado,
      estado_reproductivo: form.estado_reproductivo || null,
      fecha_nacimiento: form.fecha_nacimiento || null,
      peso_actual: form.peso_actual ?? null,
      lote_id: form.lote_id || null,
      observaciones: form.observaciones || null,
    }).eq("id", form.id);
    setGuardando(false);
    if (error) {
      toast({
        title: "No se pudo guardar",
        description: error.message.includes("duplicate") ? "Ya existe un animal con ese crotal." : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Animal actualizado" });
    onOpenChange(false);
    onSaved?.();
  };

  const darDeBaja = async () => {
    const { error } = await supabase.from("animales")
      .update({ estado: "baja", fecha_baja: new Date().toISOString().slice(0, 10) })
      .eq("id", form.id);
    if (error) { toast({ title: "No se pudo dar de baja", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Animal dado de baja" });
    onOpenChange(false);
    onSaved?.();
  };

  const borrar = async () => {
    const { error } = await supabase.from("animales").delete().eq("id", form.id);
    if (error) {
      toast({
        title: "No se pudo eliminar",
        description: "El animal tiene registros asociados (eventos, gastos o documentos). Puedes darlo de baja en su lugar.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Animal eliminado" });
    setConfirmarBorrado(false);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar animal</DialogTitle>
            <DialogDescription>Modifica los datos de {form.crotal}.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Crotal *</Label>
              <Input value={form.crotal} onChange={(e) => setForm({ ...form, crotal: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Sexo</Label>
              <Select value={form.sexo} onValueChange={(v) => setForm({ ...form, sexo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hembra">Hembra</SelectItem>
                  <SelectItem value="macho">Macho</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Raza</Label>
              <Select value={form.raza ?? ""} onValueChange={(v) => setForm({ ...form, raza: v })}>
                <SelectTrigger><SelectValue placeholder="Sin raza" /></SelectTrigger>
                <SelectContent>
                  {razasDe(form.especie ?? "bovino").map((r) => (
                    <SelectItem key={r.id} value={r.nombre}>{r.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de nacimiento</Label>
              <Input type="date" value={form.fecha_nacimiento ?? ""} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Lote</Label>
              <Select
                value={form.lote_id ?? SIN_LOTE}
                onValueChange={(v) => setForm({ ...form, lote_id: v === SIN_LOTE ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Sin lote" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_LOTE}>Sin lote</SelectItem>
                  {lotes.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado reproductivo</Label>
              <Select
                value={form.estado_reproductivo ?? SIN_REPRO}
                onValueChange={(v) => setForm({ ...form, estado_reproductivo: v === SIN_REPRO ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_REPRO}>Sin definir</SelectItem>
                  {ESTADOS_REPRODUCTIVOS.map((e) => <SelectItem key={e} value={e}>{REPRO_LABEL[e]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Peso actual (kg)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.peso_actual ?? ""}
                onChange={(e) => setForm({ ...form, peso_actual: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observaciones</Label>
              <Textarea
                rows={3}
                value={form.observaciones ?? ""}
                onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <div className="flex gap-2">
              {form.estado === "activo" && (
                <Button variant="outline" onClick={darDeBaja}>Dar de baja</Button>
              )}
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmarBorrado(true)}>
                <Trash2 className="mr-1 h-4 w-4" /> Eliminar
              </Button>
            </div>
            <Button onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el animal {form.crotal}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el animal ya no está en la explotación, es preferible darlo de baja
              para conservar su historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={borrar}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
