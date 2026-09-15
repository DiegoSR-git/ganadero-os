import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Send, MessageCircle, Sparkles } from "lucide-react";

const EJEMPLOS = [
  "FACTURA 350 reparar tejado a Juan Martínez",
  "GASTO gasoil 65",
  "GASTO material ferretería 128.50",
  "COBRO 2026-0014",
  "RESUMEN marzo",
  "GESTORIA trimestre 1",
  "AYUDA",
];

export default function DemoWebhook() {
  const { currentCompanyId, isStaff } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [remitente, setRemitente] = useState("+34699111222");
  const [texto, setTexto] = useState(EJEMPLOS[0]);
  const [resultado, setResultado] = useState<any>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("companies").select("id, nombre_comercial, whatsapp_number").order("nombre_comercial");
      setCompanies(data ?? []);
      if (currentCompanyId) setCompanyId(currentCompanyId);
      else if (data?.[0]) setCompanyId(data[0].id);
    })();
  }, [currentCompanyId]);

  async function enviar() {
    if (!companyId) { toast({ title: "Selecciona una empresa", variant: "destructive" }); return; }
    if (!texto.trim()) { toast({ title: "Escribe un mensaje", variant: "destructive" }); return; }
    setEnviando(true);
    setResultado(null);
    try {
      const company = companies.find((c) => c.id === companyId);
      const { data: inserted, error } = await supabase.from("wa_messages").insert({
        company_id: companyId,
        remitente,
        to_number: company?.whatsapp_number ?? null,
        texto,
        tipo: "texto" as const,
        estado: "pendiente" as const,
      }).select().single();
      if (error) throw error;
      const { data: proc, error: procErr } = await supabase.functions.invoke("wa-process-message", {
        body: { messageId: inserted.id },
      });
      if (procErr) throw procErr;
      setResultado({ inserted, proc });
      toast({ title: "Mensaje simulado y procesado", description: "Mira el Inbox para ver el resultado." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Simulador de webhook"
        description="Envía mensajes de prueba como si llegaran por WhatsApp Cloud API. Útil para demos y testing."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" /> Nuevo mensaje
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isStaff && (
              <div className="space-y-1.5">
                <Label>Empresa destino</Label>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre_comercial} {c.whatsapp_number ? `· ${c.whatsapp_number}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Remitente (número WhatsApp)</Label>
              <Input value={remitente} onChange={(e) => setRemitente(e.target.value)} placeholder="+34699111222" />
            </div>
            <div className="space-y-1.5">
              <Label>Texto del mensaje</Label>
              <Textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="FACTURA 200 reparar puerta a María" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EJEMPLOS.map((e) => (
                <Badge key={e} variant="outline" className="cursor-pointer hover:bg-primary-soft" onClick={() => setTexto(e)}>
                  <Sparkles className="mr-1 h-3 w-3" />{e.split(" ")[0]}
                </Badge>
              ))}
            </div>
            <Button className="w-full" onClick={enviar} disabled={enviando}>
              <Send className="mr-2 h-4 w-4" />{enviando ? "Procesando…" : "Simular mensaje"}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle>Resultado</CardTitle></CardHeader>
          <CardContent>
            {!resultado ? (
              <p className="text-sm text-muted-foreground">
                Aquí verás la respuesta del parser. Después puedes ir al <strong>Inbox</strong> o a <strong>Facturas/Gastos</strong> para confirmar que se ha creado el registro.
              </p>
            ) : (
              <pre className="overflow-x-auto rounded-md bg-muted/50 p-3 text-xs">{JSON.stringify(resultado, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 border-info/40 bg-info/5">
        <CardContent className="p-4 text-sm">
          <strong>¿Cómo conectar WhatsApp real?</strong> Configura el webhook de Meta apuntando a la edge function <code className="rounded bg-muted px-1">wa-webhook</code>.
          La URL completa está en el README. Mientras tanto, esta página simula exactamente el mismo flujo (insertar en <code className="rounded bg-muted px-1">wa_messages</code> + ejecutar parser).
        </CardContent>
      </Card>
    </>
  );
}
