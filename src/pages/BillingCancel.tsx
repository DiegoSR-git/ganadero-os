import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`;

export default function BillingCancel() {
  const [params] = useSearchParams();
  const pendingId = params.get("pending_id");
  const [loading, setLoading] = useState(false);

  async function retry() {
    if (!pendingId) return;
    setLoading(true);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_id: pendingId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "No se pudo reintentar");
      window.location.href = json.url;
    } catch (e) {
      setLoading(false);
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>Pago no completado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-muted-foreground">
            No se ha completado el pago, así que tu registro <strong>no se ha activado</strong>.
            Tus datos provisionales se borrarán automáticamente en 24 horas si no continúas.
          </p>
          {pendingId && (
            <Button onClick={retry} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirigiendo…</> : "Reintentar pago"}
            </Button>
          )}
          <Button asChild variant="outline" className="w-full"><Link to="/">Volver al inicio</Link></Button>
        </CardContent>
      </Card>
    </div>
  );
}