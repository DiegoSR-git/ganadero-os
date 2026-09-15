import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

type Metrica = {
  explotacion_id: string; nombre: string; pilot_status: string;
  animales: number; eventos_7d: number; acciones_ia_7d: number; mensajes_wa_7d: number; ultimo_uso: string;
};

const ESTADOS = ["candidata", "activa", "pausada", "finalizada"];

export default function PanelPiloto() {
  const { user } = useAuth();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [filas, setFilas] = useState<Metrica[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [errores, setErrores] = useState<any[]>([]);

  const cargar = useCallback(async () => {
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
    const esAdmin = (roles ?? []).some((r: any) => r.role === "superadmin");
    setAdmin(esAdmin);
    if (!esAdmin) return;
    const [m, f, e] = await Promise.all([
      supabase.rpc("pilot_metrics"),
      supabase.from("feedback").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("ai_action_log").select("created_at, canal, tool, error, intencion").eq("ok", false).order("created_at", { ascending: false }).limit(50),
    ]);
    setFilas((m.data ?? []) as Metrica[]);
    setFeedback(f.data ?? []);
    setErrores(e.data ?? []);
  }, [user]);

  useEffect(() => { if (user) cargar(); }, [user, cargar]);

  const cambiarEstado = async (id: string, estado: string) => {
    const patch: { pilot_status: string; pilot_started_at?: string } = { pilot_status: estado };
    if (estado === "activa") patch.pilot_started_at = new Date().toISOString();
    const { error } = await supabase.from("explotaciones").update(patch).eq("id", id);
    if (error) { toast({ title: "No se ha podido cambiar", description: error.message, variant: "destructive" }); return; }
    cargar();
  };

  if (admin === false) {
    return <p className="p-6 text-sm text-muted-foreground">Esta página es sólo para el equipo de GanaderOS.</p>;
  }

  const activas7d = filas.filter((f) => f.eventos_7d + f.acciones_ia_7d > 0).length;

  return (
    <>
      <PageHeader title="Panel del piloto" description="Uso real de las explotaciones del piloto" />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="shadow-card"><CardContent className="p-4">
          <div className="text-2xl font-semibold">{filas.length}</div>
          <div className="text-xs text-muted-foreground">Explotaciones</div>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4">
          <div className="text-2xl font-semibold">{activas7d}</div>
          <div className="text-xs text-muted-foreground">Activas esta semana</div>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-4">
          <div className="text-2xl font-semibold">{filas.reduce((s, f) => s + Number(f.acciones_ia_7d), 0)}</div>
          <div className="text-xs text-muted-foreground">Acciones con el asistente (7 días)</div>
        </CardContent></Card>
      </div>

      <Card className="mb-4 shadow-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">Explotaciones</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Explotación</TableHead><TableHead>Estado</TableHead><TableHead>Animales</TableHead>
              <TableHead>Eventos 7d</TableHead><TableHead>IA 7d</TableHead><TableHead>WhatsApp 7d</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.explotacion_id}>
                  <TableCell className="font-medium">{f.nombre}</TableCell>
                  <TableCell>
                    <Select value={f.pilot_status} onValueChange={(v) => cambiarEstado(f.explotacion_id, v)}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{f.animales}</TableCell>
                  <TableCell>{f.eventos_7d}</TableCell>
                  <TableCell>{f.acciones_ia_7d}</TableCell>
                  <TableCell>{f.mensajes_wa_7d}</TableCell>
                </TableRow>
              ))}
              {!filas.length && <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Sin datos.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Opiniones recibidas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {feedback.map((f) => (
              <div key={f.id} className="rounded-md border p-2.5 text-sm">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{f.canal}</Badge>
                  {f.valoracion ? <span>{f.valoracion}★</span> : null}
                  <span>{new Date(f.created_at).toLocaleDateString("es-ES")}</span>
                </div>
                {f.mensaje}
              </div>
            ))}
            {!feedback.length && <p className="text-sm text-muted-foreground">Todavía no hay opiniones.</p>}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Fallos del asistente</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {errores.map((e, i) => (
              <div key={i} className="rounded-md border p-2.5 text-xs">
                <div className="text-muted-foreground">{new Date(e.created_at).toLocaleString("es-ES")} · {e.canal} · {e.tool ?? "—"}</div>
                <div className="text-destructive">{e.error ?? "sin detalle"}</div>
              </div>
            ))}
            {!errores.length && <p className="text-sm text-muted-foreground">Sin fallos registrados.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
