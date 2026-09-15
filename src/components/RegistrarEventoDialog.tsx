import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { toast } from "@/hooks/use-toast";
import { EVENTO_LABEL } from "@/lib/ganado";
import {
  Baby, HeartPulse, Syringe, Scale, MoveRight, Layers, ShoppingCart,
  Euro, AlertTriangle, NotebookPen,
} from "lucide-react";

const OPCIONES = [
  { tipo: "parto", icon: Baby },
  { tipo: "nacimiento", icon: Baby },
  { tipo: "incidencia", icon: AlertTriangle },
  { tipo: "tratamiento", icon: HeartPulse },
  { tipo: "vacuna", icon: Syringe },
  { tipo: "pesaje", icon: Scale },
  { tipo: "movimiento", icon: MoveRight },
  { tipo: "cambio_lote", icon: Layers },
  { tipo: "compra", icon: ShoppingCart },
  { tipo: "venta", icon: Euro },
  { tipo: "observacion", icon: NotebookPen },
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  animalId?: string;
  onSaved?: () => void;
};

const hoy = () => new Date().toISOString().slice(0, 10);

export default function RegistrarEventoDialog({ open, onOpenChange, animalId, onSaved }: Props) {
  const { explotacionId } = useExplotacion();
  
  const [tipo, setTipo] = useState<string | null>(null);
  const [animales, setAnimales] = useState<{ id: string; crotal: string }[]>([]);
  const [lotes, setLotes] = useState<{ id: string; nombre: string }[]>([]);
  const [busy, setBusy] = useState(false);
  // Identifica este envío concreto: protege contra dobles clics y reintentos de red.
  const [claveEnvio, setClaveEnvio] = useState(() => crypto.randomUUID());

  const [form, setForm] = useState({
    animal_id: animalId ?? "",
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: "",
    peso: "",
    lote_id: "",
    importe: "",
    busqueda: "",
  });

  useEffect(() => {
    if (!open || !explotacionId) return;
    setTipo(null);
    setClaveEnvio(crypto.randomUUID());
    setForm((f) => ({ ...f, animal_id: animalId ?? "", descripcion: "", peso: "", importe: "", busqueda: "" }));
    (async () => {
      const [a, l] = await Promise.all([
        supabase.from("animales").select("id, crotal").eq("explotacion_id", explotacionId).eq("estado", "activo").order("crotal").limit(1000),
        supabase.from("lotes").select("id, nombre").eq("explotacion_id", explotacionId).order("nombre"),
      ]);
      setAnimales(a.data ?? []);
      setLotes(l.data ?? []);
    })();
  }, [open, explotacionId, animalId]);

  const filtrados = useMemo(() => {
    const q = form.busqueda.trim().toLowerCase();
    const base = q ? animales.filter((a) => a.crotal.toLowerCase().includes(q)) : animales;
    return base.slice(0, 50);
  }, [animales, form.busqueda]);

  const guardar = async () => {
    if (!explotacionId || !tipo || busy) return;
    if (tipo === "parto") {
      toast({
        title: "Usa el registro de parto",
        description: "Así se crean también las crías y se relacionan con la madre.",
      });
      return;
    }
    if (form.fecha > hoy()) {
      toast({ title: "La fecha no puede ser futura", variant: "destructive" });
      return;
    }
    const peso = form.peso ? Number(form.peso) : null;
    if (peso !== null && (!isFinite(peso) || peso <= 0)) {
      toast({ title: "El peso no es válido", variant: "destructive" });
      return;
    }
    const importe = form.importe ? Number(form.importe) : null;
    if (importe !== null && (!isFinite(importe) || importe < 0)) {
      toast({ title: "El importe no es válido", variant: "destructive" });
      return;
    }

    setBusy(true);
    // Una sola transacción en el servidor: evento + peso / lote / baja + ingreso de la venta.
    // La clave evita que un doble clic o un reintento creen dos registros.
    const { data, error } = await supabase.rpc("registrar_evento_animal", {
      _explotacion_id: explotacionId,
      _tipo_evento: tipo,
      _fecha: form.fecha,
      _animal_id: form.animal_id || null,
      _descripcion: form.descripcion || null,
      _lote_id: form.lote_id || null,
      _peso: peso,
      _importe: importe,
      _idempotency_key: claveEnvio,
      _origen: "web",
    });
    setBusy(false);

    if (error) {
      toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
      return;
    }
    const res = data as { duplicado?: boolean; ingreso_id?: string | null } | null;
    toast({
      title: res?.duplicado ? "Ya estaba registrado" : "Evento registrado",
      description: res?.ingreso_id ? "Animal dado de baja e ingreso de la venta registrado." : EVENTO_LABEL[tipo] ?? tipo,
    });
    setClaveEnvio(crypto.randomUUID());
    onOpenChange(false);
    onSaved?.();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tipo ? EVENTO_LABEL[tipo] ?? tipo : "Registrar"}</DialogTitle>
        </DialogHeader>

        {!explotacionId ? (
          <p className="text-sm text-muted-foreground">Crea primero tu explotación en Configuración.</p>
        ) : !tipo ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {OPCIONES.map((o) => (
              <button
                key={o.tipo}
                onClick={() => setTipo(o.tipo)}
                className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center text-xs font-medium transition hover:border-primary hover:bg-primary-soft"
              >
                <o.icon className="h-5 w-5 text-primary" />
                {EVENTO_LABEL[o.tipo]}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {!animalId && (
              <div className="space-y-1.5">
                <Label>Animal (opcional)</Label>
                <Input
                  placeholder="Buscar por crotal…"
                  value={form.busqueda}
                  onChange={(e) => setForm({ ...form, busqueda: e.target.value })}
                />
                <Select value={form.animal_id} onValueChange={(v) => setForm({ ...form, animal_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Sin animal concreto" /></SelectTrigger>
                  <SelectContent>
                    {filtrados.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.crotal}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              {tipo === "pesaje" && (
                <div className="space-y-1.5">
                  <Label>Peso (kg)</Label>
                  <Input type="number" inputMode="decimal" value={form.peso} onChange={(e) => setForm({ ...form, peso: e.target.value })} />
                </div>
              )}
              {(tipo === "compra" || tipo === "venta") && (
                <div className="space-y-1.5">
                  <Label>Importe (€)</Label>
                  <Input type="number" inputMode="decimal" value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} />
                </div>
              )}
              {(tipo === "cambio_lote" || tipo === "movimiento") && (
                <div className="space-y-1.5">
                  <Label>Lote destino</Label>
                  <Select value={form.lote_id} onValueChange={(v) => setForm({ ...form, lote_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona lote" /></SelectTrigger>
                    <SelectContent>
                      {lotes.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Describe brevemente lo ocurrido" />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setTipo(null)}>Volver</Button>
              <Button className="flex-1" onClick={guardar} disabled={busy}>Guardar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
