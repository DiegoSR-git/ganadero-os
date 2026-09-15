import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, MailCheck, MessageSquareText } from "lucide-react";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/registration-status`;

export default function BillingSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<"checking" | "ready" | "pending">("checking");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) { setStatus("pending"); return; }
    let tries = 0;
    const tick = async () => {
      tries++;
      try {
        const res = await fetch(`${FN_URL}?session_id=${encodeURIComponent(sessionId)}`);
        const json = await res.json();
        const reg = json?.registration;
        if (reg?.email) setEmail(reg.email);
        if (reg?.status === "completed") { setStatus("ready"); return; }
      } catch {}
      if (tries < 20) setTimeout(tick, 1500);
      else setStatus("pending");
    };
    tick();
  }, [sessionId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            {status === "ready"
              ? <MailCheck className="h-8 w-8 text-primary" />
              : <Loader2 className="h-8 w-8 animate-spin text-primary" />}
          </div>
          <CardTitle>
            {status === "ready" ? "Confirma tu email" : "Pago recibido"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {status === "ready" ? (
            <>
              <p className="text-muted-foreground">
                Hemos enviado un correo de confirmación a{" "}
                <strong>{email}</strong>. Haz clic en el enlace del email
                para activar tu cuenta. <strong>No podrás iniciar sesión hasta
                que confirmes tu email.</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Revisa también la carpeta de spam o promociones.
              </p>
              <Button asChild className="w-full">
                <Link to="/auth">Ir al login</Link>
              </Button>
            </>
          ) : status === "checking" ? (
            <p className="text-muted-foreground">
              Estamos activando tu cuenta. Esto suele tardar pocos segundos…
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Tu pago se ha registrado, pero aún no hemos confirmado la activación.
                Recibirás un email cuando esté lista. Si pasados 5 minutos no puedes entrar, contáctanos.
              </p>
              <Button asChild variant="outline" className="w-full"><Link to="/auth">Ir al inicio de sesión</Link></Button>
            </>
          )}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-2">
            <MessageSquareText className="h-3 w-3" /> GanaderOS
          </div>
        </CardContent>
      </Card>
    </div>
  );
}