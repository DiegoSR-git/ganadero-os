import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { track } from "@/lib/analytics";
import { Beef, MessageCircle, Sparkles } from "lucide-react";

const PASOS = [
  {
    icon: Beef,
    titulo: "Tus animales, en un sitio",
    texto: "Da de alta tus vacas una a una o sube el listado que ya tengas en Excel. Cada animal guarda su historial: partos, tratamientos, pesos e incidencias.",
  },
  {
    icon: Sparkles,
    titulo: "Habla, no rellenes formularios",
    texto: "Dile al asistente \"ha parido la 7843, ternera\" y él lo apunta. Antes de guardar nada te enseña lo que ha entendido y tú confirmas.",
  },
  {
    icon: MessageCircle,
    titulo: "También desde WhatsApp",
    texto: "Desde el campo, mándalo por WhatsApp: un mensaje, un audio o una foto del crotal. Se guarda en tu explotación igual que en la app.",
  },
];

export default function OnboardingDialog() {
  const { explotacion, explotacionId, refresh } = useExplotacion();
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (explotacion && !(explotacion as any).onboarding_completed_at) setOpen(true);
  }, [explotacion]);

  const terminar = async (ir?: string) => {
    setOpen(false);
    if (explotacionId) {
      await supabase.from("explotaciones").update({ onboarding_completed_at: new Date().toISOString() }).eq("id", explotacionId);
      track("onboarding_completado", {}, explotacionId);
      refresh();
    }
    if (ir) navigate(ir);
  };

  const P = PASOS[paso];
  const Icono = P.icon;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) terminar(); }}>
      <DialogContent className="sm:max-w-md">
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icono className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">{P.titulo}</h2>
          <p className="text-sm text-muted-foreground">{P.texto}</p>
          <div className="flex justify-center gap-1.5">
            {PASOS.map((_, i) => (
              <span key={i} className={`h-1.5 w-6 rounded-full ${i === paso ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => terminar()}>Saltar</Button>
            {paso < PASOS.length - 1 ? (
              <Button className="flex-1" onClick={() => setPaso(paso + 1)}>Siguiente</Button>
            ) : (
              <Button className="flex-1" onClick={() => terminar("/animales")}>Empezar</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
