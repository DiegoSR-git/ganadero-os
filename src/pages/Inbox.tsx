import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { MessageCircle, Search, Sparkles, Image, FileText, Mic } from "lucide-react";
import { fechaCorta } from "@/lib/format";
import { toast } from "@/hooks/use-toast";

const tipoIcon = (t: string) => t === "imagen" ? Image : t === "documento" ? FileText : t === "audio" ? Mic : MessageCircle;

export default function Inbox() {
  const { currentCompanyId, isStaff } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState("todos");

  async function load() {
    let q1 = supabase.from("wa_messages").select("*, companies(nombre_comercial)").order("recibido_en", { ascending: false }).limit(200);
    if (currentCompanyId) q1 = q1.eq("company_id", currentCompanyId);
    const { data } = await q1;
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, [currentCompanyId]);

  async function reprocesar(id: string) {
    const { error } = await supabase.functions.invoke("wa-process-message", { body: { messageId: id } });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Mensaje procesado" }); load(); }
  }

  async function marcar(id: string, estado: string) {
    await supabase.from("wa_messages").update({ estado: estado as any }).eq("id", id);
    load();
  }

  const filtered = rows.filter((r) => {
    if (fEstado !== "todos" && r.estado !== fEstado) return false;
    if (q && !`${r.texto ?? ""} ${r.remitente} ${r.comando ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <PageHeader title="Inbox WhatsApp" description="Mensajes entrantes. La integración real requiere credenciales de WhatsApp Cloud API." />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar texto, número, comando…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={fEstado} onValueChange={setFEstado}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="procesado">Procesado</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {filtered.map((m) => {
          const Icon = tipoIcon(m.tipo);
          return (
            <Card key={m.id} className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{m.remitente}</div>
                      <div className="text-xs text-muted-foreground">
                        {fechaCorta(m.recibido_en)} · {new Date(m.recibido_en).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        {isStaff && m.companies?.nombre_comercial && <> · {m.companies.nombre_comercial}</>}
                      </div>
                    </div>
                  </div>
                  <StatusBadge value={m.estado} />
                </div>
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap">{m.texto ?? <em className="text-muted-foreground">[adjunto: {m.tipo}]</em>}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {m.comando && <Badge variant="outline" className="font-mono"><Sparkles className="mr-1 h-3 w-3" />{m.comando}</Badge>}
                  {m.estado !== "procesado" && <Button size="sm" variant="outline" onClick={() => reprocesar(m.id)}>Procesar</Button>}
                  {m.estado !== "procesado" && <Button size="sm" variant="ghost" onClick={() => marcar(m.id, "procesado")}>Marcar manual</Button>}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {!filtered.length && <div className="col-span-full rounded-lg border bg-card p-8 text-center text-muted-foreground">Sin mensajes</div>}
      </div>
    </>
  );
}
