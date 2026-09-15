import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export default function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { explotacionId } = useExplotacion();
  const [mensaje, setMensaje] = useState("");
  const [valoracion, setValoracion] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    const texto = mensaje.trim();
    if (!texto) { toast({ title: "Escribe tu comentario", variant: "destructive" }); return; }
    setEnviando(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("feedback").insert({
      user_id: u?.user?.id as string,
      explotacion_id: explotacionId,
      canal: "app",
      mensaje: texto.slice(0, 2000),
      valoracion: valoracion || null,
      contexto: { ruta: window.location.pathname } as never,
    });
    setEnviando(false);
    if (error) { toast({ title: "No se ha podido enviar", description: error.message, variant: "destructive" }); return; }
    track("feedback_enviado", { valoracion }, explotacionId);
    toast({ title: "Gracias", description: "Hemos recibido tu comentario." });
    setMensaje(""); setValoracion(0); onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Cuéntanos qué mejorarías</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setValoracion(n)} aria-label={`${n} estrellas`}>
                <Star className={cn("h-7 w-7", n <= valoracion ? "fill-primary text-primary" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
          <Textarea
            rows={5}
            placeholder="¿Qué te ha costado? ¿Qué echas en falta? Escríbelo como lo dirías tú."
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            maxLength={2000}
          />
          <Button className="w-full" onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
