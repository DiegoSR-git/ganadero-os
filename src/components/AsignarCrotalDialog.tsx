import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  animal: { id: string; crotal: string; codigo_temporal?: string | null } | null;
  onSaved?: () => void;
};

export default function AsignarCrotalDialog({ open, onOpenChange, animal, onSaved }: Props) {
  const [crotal, setCrotal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setCrotal(""); }, [open]);

  if (!animal) return null;

  const guardar = async () => {
    if (!crotal.trim()) { toast({ title: "Escribe el crotal", variant: "destructive" }); return; }
    setBusy(true);
    const { error } = await supabase.rpc("asignar_crotal", { _animal_id: animal.id, _crotal: crotal.trim() });
    setBusy(false);
    if (error) { toast({ title: "No se pudo asignar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Crotal asignado", description: "Se conserva todo el historial del animal." });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar crotal</DialogTitle>
          <DialogDescription>
            Identificación actual: {animal.codigo_temporal ?? animal.crotal}. El historial y las relaciones se mantienen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Crotal definitivo</Label>
            <Input placeholder="ES0123456789" value={crotal} onChange={(e) => setCrotal(e.target.value)} />
          </div>
          <Button className="w-full" disabled={busy} onClick={guardar}>{busy ? "Guardando…" : "Asignar crotal"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
