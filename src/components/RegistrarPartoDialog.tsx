import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { toast } from "@/hooks/use-toast";
import { Baby, Plus, Trash2 } from "lucide-react";

type Cria = { sexo: string; estado: string; crotal: string; peso: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  madreId?: string;
  onSaved?: () => void;
};

const hoy = () => new Date().toISOString().slice(0, 10);
const criaVacia = (): Cria => ({ sexo: "hembra", estado: "vivo", crotal: "", peso: "" });

export default function RegistrarPartoDialog({ open, onOpenChange, madreId, onSaved }: Props) {
  const { explotacionId } = useExplotacion();
  const [hembras, setHembras] = useState<{ id: string; crotal: string }[]>([]);
  const [machos, setMachos] = useState<{ id: string; crotal: string }[]>([]);
  const [madre, setMadre] = useState(madreId ?? "");
  const [padre, setPadre] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [dificultad, setDificultad] = useState("normal");
  const [observaciones, setObservaciones] = useState("");
  const [crias, setCrias] = useState<Cria[]>([criaVacia()]);
  const [busy, setBusy] = useState(false);
  const [clave] = useState(() => crypto.randomUUID());
  const [claveEnvio, setClaveEnvio] = useState(clave);

  useEffect(() => {
    if (!open || !explotacionId) return;
    setMadre(madreId ?? "");
    setPadre(""); setFecha(hoy()); setDificultad("normal"); setObservaciones("");
    setCrias([criaVacia()]);
    setClaveEnvio(crypto.randomUUID());
    (async () => {
      const { data } = await supabase.from("animales").select("id, crotal, sexo")
        .eq("explotacion_id", explotacionId).eq("estado", "activo").order("crotal").limit(2000);
      setHembras((data ?? []).filter((a) => a.sexo !== "macho"));
      setMachos((data ?? []).filter((a) => a.sexo === "macho"));
    })();
  }, [open, explotacionId, madreId]);

  const vivas = useMemo(() => crias.filter((c) => c.estado === "vivo").length, [crias]);

  const guardar = async () => {
    if (!madre) { toast({ title: "Selecciona la madre", variant: "destructive" }); return; }
    if (fecha > hoy()) { toast({ title: "La fecha no puede ser futura", variant: "destructive" }); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc("registrar_parto", {
      _madre_id: madre,
      _fecha: fecha,
      _crias: crias.map((c) => ({
        sexo: c.sexo,
        estado: c.estado,
        crotal: c.crotal.trim() || null,
        peso: c.peso ? Number(c.peso) : null,
      })) as never,
      _padre_id: padre || null,
      _dificultad: dificultad,
      _observaciones: observaciones || null,
      _idempotency_key: claveEnvio,
      _origen: "web",
    });
    setBusy(false);
    if (error) { toast({ title: "No se pudo registrar el parto", description: error.message, variant: "destructive" }); return; }
    const res = data as { vivas?: number; duplicado?: boolean } | null;
    toast({
      title: res?.duplicado ? "El parto ya estaba registrado" : "Parto registrado",
      description: res?.duplicado ? undefined : `${res?.vivas ?? 0} cría(s) creada(s) y relacionada(s) con la madre.`,
    });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Baby className="h-5 w-5 text-primary" /> Registrar parto</DialogTitle>
          <DialogDescription>
            Se crean automáticamente las crías vivas, se relacionan con la madre y se genera la tarea de crotal si hace falta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {!madreId && (
              <div className="space-y-1.5">
                <Label>Madre *</Label>
                <Select value={madre} onValueChange={setMadre}>
                  <SelectTrigger><SelectValue placeholder="Selecciona la madre" /></SelectTrigger>
                  <SelectContent>{hembras.map((a) => <SelectItem key={a.id} value={a.id}>{a.crotal}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Fecha del parto</Label>
              <Input type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Padre (opcional)</Label>
              <Select value={padre} onValueChange={setPadre}>
                <SelectTrigger><SelectValue placeholder="Sin indicar" /></SelectTrigger>
                <SelectContent>{machos.map((a) => <SelectItem key={a.id} value={a.id}>{a.crotal}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dificultad</Label>
              <Select value={dificultad} onValueChange={setDificultad}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="asistido">Asistido</SelectItem>
                  <SelectItem value="cesarea">Cesárea</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Crías ({crias.length}) · {vivas} viva(s)</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => setCrias([...crias, criaVacia()])}>
                <Plus className="mr-1 h-4 w-4" /> Añadir cría
              </Button>
            </div>
            {crias.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Sexo</Label>
                  <Select value={c.sexo} onValueChange={(v) => setCrias(crias.map((x, j) => j === i ? { ...x, sexo: v } : x))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hembra">Hembra</SelectItem>
                      <SelectItem value="macho">Macho</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Estado</Label>
                  <Select value={c.estado} onValueChange={(v) => setCrias(crias.map((x, j) => j === i ? { ...x, estado: v } : x))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vivo">Nacida viva</SelectItem>
                      <SelectItem value="muerto">Nacida muerta</SelectItem>
                      <SelectItem value="aborto">Aborto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Crotal (si se conoce)</Label>
                  <Input
                    placeholder="Pendiente"
                    value={c.crotal}
                    disabled={c.estado !== "vivo"}
                    onChange={(e) => setCrias(crias.map((x, j) => j === i ? { ...x, crotal: e.target.value } : x))}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">Peso (kg)</Label>
                    <Input
                      type="number" inputMode="decimal" value={c.peso} disabled={c.estado !== "vivo"}
                      onChange={(e) => setCrias(crias.map((x, j) => j === i ? { ...x, peso: e.target.value } : x))}
                    />
                  </div>
                  {crias.length > 1 && (
                    <Button type="button" size="icon" variant="ghost" aria-label="Quitar cría"
                      onClick={() => setCrias(crias.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>

          <Button className="w-full" disabled={busy} onClick={guardar}>
            {busy ? "Guardando…" : "Registrar parto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
