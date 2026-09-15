import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useCatalogoGanado } from "@/hooks/useCatalogoGanado";
import { ESTADOS_REPRODUCTIVOS, REPRO_LABEL, mesesEdad, categoriaLabel } from "@/lib/ganado";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  explotacionId: string | null;
  especiePorDefecto?: string | null;
  lotes: { id: string; nombre: string }[];
  onSaved?: () => void;
};

const hoy = () => new Date().toISOString().slice(0, 10);
const SIN = "__sin__";

export default function NuevoAnimalDialog({ open, onOpenChange, explotacionId, especiePorDefecto, lotes, onSaved }: Props) {
  const { especies, razasDe } = useCatalogoGanado();
  const [modo, setModo] = useState<"rapida" | "completa">("rapida");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    crotal: "", especie: especiePorDefecto || "bovino", sexo: "hembra", raza_id: "", raza_libre: "",
    fecha_nacimiento: "", lote_id: "", estado_reproductivo: "", origen: "nacido",
    identificador_secundario: "", peso_actual: "", observaciones: "", fecha_alta: hoy(),
  });

  useEffect(() => {
    if (!open) return;
    setModo("rapida");
    setF({
      crotal: "", especie: especiePorDefecto || "bovino", sexo: "hembra", raza_id: "", raza_libre: "",
      fecha_nacimiento: "", lote_id: "", estado_reproductivo: "", origen: "nacido",
      identificador_secundario: "", peso_actual: "", observaciones: "", fecha_alta: hoy(),
    });
  }, [open, especiePorDefecto]);

  const razas = razasDe(f.especie);
  const razaSel = razas.find((r) => r.id === f.raza_id);
  const razaLibreVisible = !!razaSel && /otra|cruce/i.test(razaSel.nombre);
  const meses = mesesEdad(f.fecha_nacimiento || null);
  // Reproducción solo tiene sentido en hembras con edad suficiente (o sin fecha conocida)
  const mostrarRepro = f.sexo === "hembra" && (meses === null || meses >= 12);
  const categoria = useMemo(
    () => categoriaLabel({ especie: f.especie, sexo: f.sexo, fecha_nacimiento: f.fecha_nacimiento || null }),
    [f.especie, f.sexo, f.fecha_nacimiento],
  );

  const guardar = async () => {
    if (!explotacionId) return;
    if (!f.crotal.trim()) { toast({ title: "El crotal es obligatorio", variant: "destructive" }); return; }
    if (f.fecha_nacimiento && f.fecha_nacimiento > hoy()) {
      toast({ title: "La fecha de nacimiento no puede ser futura", variant: "destructive" }); return;
    }
    if (f.peso_actual && Number(f.peso_actual) <= 0) {
      toast({ title: "El peso debe ser mayor que 0", variant: "destructive" }); return;
    }
    setBusy(true);
    const { error } = await supabase.from("animales").insert({
      explotacion_id: explotacionId,
      crotal: f.crotal.trim(),
      especie: f.especie,
      sexo: f.sexo,
      raza_id: f.raza_id || null,
      raza: razaLibreVisible && f.raza_libre.trim() ? f.raza_libre.trim() : (razaSel?.nombre ?? null),
      fecha_nacimiento: f.fecha_nacimiento || null,
      fecha_alta: f.fecha_alta || hoy(),
      lote_id: f.lote_id || null,
      estado_reproductivo: mostrarRepro ? (f.estado_reproductivo || null) : null,
      origen: f.origen,
      identificador_secundario: f.identificador_secundario || null,
      peso_actual: f.peso_actual ? Number(f.peso_actual) : null,
      observaciones: f.observaciones || null,
    });
    setBusy(false);
    if (error) {
      toast({
        title: "No se pudo añadir",
        description: error.message.includes("duplicate") ? "Ya existe un animal con ese crotal." : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Animal añadido", description: categoria });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo animal</DialogTitle>
          <DialogDescription>
            Alta rápida para el campo o alta completa con todos los datos. Categoría estimada: {categoria}.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={modo} onValueChange={(v) => setModo(v as "rapida" | "completa")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="rapida">Alta rápida</TabsTrigger>
            <TabsTrigger value="completa">Alta completa</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Crotal *</Label>
            <Input value={f.crotal} onChange={(e) => setF({ ...f, crotal: e.target.value })} placeholder="ES0123456789" />
          </div>
          <div className="space-y-1.5">
            <Label>Especie</Label>
            <Select value={f.especie} onValueChange={(v) => setF({ ...f, especie: v, raza_id: "", raza_libre: "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{especies.map((e) => <SelectItem key={e.codigo} value={e.codigo}>{e.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sexo</Label>
            <Select value={f.sexo} onValueChange={(v) => setF({ ...f, sexo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hembra">Hembra</SelectItem>
                <SelectItem value="macho">Macho</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de nacimiento</Label>
            <Input type="date" max={hoy()} value={f.fecha_nacimiento} onChange={(e) => setF({ ...f, fecha_nacimiento: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Raza</Label>
            <Select value={f.raza_id || SIN} onValueChange={(v) => setF({ ...f, raza_id: v === SIN ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Sin raza" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN}>Sin raza</SelectItem>
                {razas.map((r) => <SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {razaLibreVisible && (
            <div className="space-y-1.5">
              <Label>Detalle de la raza</Label>
              <Input placeholder="Ej. Limusina x Retinta" value={f.raza_libre} onChange={(e) => setF({ ...f, raza_libre: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Lote</Label>
            <Select value={f.lote_id || SIN} onValueChange={(v) => setF({ ...f, lote_id: v === SIN ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Sin lote" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN}>Sin lote</SelectItem>
                {lotes.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {modo === "completa" && (
            <>
              <div className="space-y-1.5">
                <Label>Origen</Label>
                <Select value={f.origen} onValueChange={(v) => setF({ ...f, origen: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nacido">Nacido en la explotación</SelectItem>
                    <SelectItem value="comprado">Comprado</SelectItem>
                    <SelectItem value="traslado">Traslado de otra explotación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de alta</Label>
                <Input type="date" max={hoy()} value={f.fecha_alta} onChange={(e) => setF({ ...f, fecha_alta: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Identificador secundario</Label>
                <Input value={f.identificador_secundario} onChange={(e) => setF({ ...f, identificador_secundario: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Peso actual (kg)</Label>
                <Input type="number" inputMode="decimal" value={f.peso_actual} onChange={(e) => setF({ ...f, peso_actual: e.target.value })} />
              </div>
              {mostrarRepro && (
                <div className="space-y-1.5">
                  <Label>Estado reproductivo</Label>
                  <Select value={f.estado_reproductivo || SIN} onValueChange={(v) => setF({ ...f, estado_reproductivo: v === SIN ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN}>Sin definir</SelectItem>
                      {ESTADOS_REPRODUCTIVOS.map((e) => <SelectItem key={e} value={e}>{REPRO_LABEL[e]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observaciones</Label>
                <Textarea rows={2} value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
              </div>
            </>
          )}

          <div className="sm:col-span-2">
            <Button className="w-full" disabled={busy || !explotacionId} onClick={guardar}>
              {busy ? "Guardando…" : "Guardar animal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
