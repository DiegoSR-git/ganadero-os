import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { toast } from "@/hooks/use-toast";
import { Plus, Map } from "lucide-react";

type Finca = { id: string; nombre: string; superficie: number | null; ubicacion: string | null; referencia: string | null; observaciones: string | null };
type Parcela = { id: string; finca_id: string | null; nombre: string; superficie: number | null; referencia_sigpac: string | null; uso: string | null; estado: string };

export default function Fincas() {
  const { explotacionId } = useExplotacion();
  const [fincas, setFincas] = useState<Finca[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [openFinca, setOpenFinca] = useState(false);
  const [openParcela, setOpenParcela] = useState<string | null>(null);
  const [fFinca, setFFinca] = useState({ nombre: "", superficie: "", ubicacion: "", referencia: "", observaciones: "" });
  const [fParcela, setFParcela] = useState({ nombre: "", superficie: "", referencia_sigpac: "", uso: "pasto", estado: "disponible" });

  const cargar = useCallback(async () => {
    if (!explotacionId) { setFincas([]); setParcelas([]); return; }
    const [f, p] = await Promise.all([
      supabase.from("fincas").select("*").eq("explotacion_id", explotacionId).order("nombre"),
      supabase.from("parcelas").select("*").eq("explotacion_id", explotacionId).order("nombre"),
    ]);
    setFincas((f.data ?? []) as Finca[]);
    setParcelas((p.data ?? []) as Parcela[]);
  }, [explotacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crearFinca = async () => {
    if (!explotacionId || !fFinca.nombre.trim()) return;
    const { error } = await supabase.from("fincas").insert({
      explotacion_id: explotacionId,
      nombre: fFinca.nombre.trim(),
      superficie: fFinca.superficie ? Number(fFinca.superficie) : null,
      ubicacion: fFinca.ubicacion || null,
      referencia: fFinca.referencia || null,
      observaciones: fFinca.observaciones || null,
    });
    if (error) { toast({ title: "No se pudo crear", description: error.message, variant: "destructive" }); return; }
    setOpenFinca(false);
    setFFinca({ nombre: "", superficie: "", ubicacion: "", referencia: "", observaciones: "" });
    cargar();
  };

  const crearParcela = async () => {
    if (!explotacionId || !openParcela || !fParcela.nombre.trim()) return;
    const { error } = await supabase.from("parcelas").insert({
      explotacion_id: explotacionId,
      finca_id: openParcela,
      nombre: fParcela.nombre.trim(),
      superficie: fParcela.superficie ? Number(fParcela.superficie) : null,
      referencia_sigpac: fParcela.referencia_sigpac || null,
      uso: fParcela.uso,
      estado: fParcela.estado,
    });
    if (error) { toast({ title: "No se pudo crear", description: error.message, variant: "destructive" }); return; }
    setOpenParcela(null);
    setFParcela({ nombre: "", superficie: "", referencia_sigpac: "", uso: "pasto", estado: "disponible" });
    cargar();
  };

  return (
    <>
      <PageHeader
        title="Fincas"
        description="Tus fincas y sus parcelas."
        actions={<Button disabled={!explotacionId} onClick={() => setOpenFinca(true)}><Plus className="mr-1 h-4 w-4" /> Nueva finca</Button>}
      />

      <div className="space-y-4">
        {fincas.map((f) => {
          const ps = parcelas.filter((p) => p.finca_id === f.id);
          return (
            <Card key={f.id} className="shadow-card">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary"><Map className="h-5 w-5" /></span>
                    <div>
                      <div className="text-lg font-semibold">{f.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.superficie ? `${f.superficie} ha` : "Sin superficie"}{f.ubicacion ? ` · ${f.ubicacion}` : ""}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setOpenParcela(f.id)}>
                    <Plus className="mr-1 h-4 w-4" /> Parcela
                  </Button>
                </div>

                {ps.length > 0 && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {ps.map((p) => (
                      <div key={p.id} className="rounded-lg border bg-muted/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{p.nombre}</span>
                          <Badge variant="secondary">{p.estado}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {p.superficie ? `${p.superficie} ha` : "—"}{p.uso ? ` · ${p.uso}` : ""}
                          {p.referencia_sigpac ? ` · SIGPAC ${p.referencia_sigpac}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {fincas.length === 0 && <p className="text-sm text-muted-foreground">Aún no has creado fincas.</p>}
      </div>

      <Dialog open={openFinca} onOpenChange={setOpenFinca}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva finca</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre *</Label>
              <Input value={fFinca.nombre} onChange={(e) => setFFinca({ ...fFinca, nombre: e.target.value })} placeholder="La Umbría" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Superficie (ha)</Label>
                <Input type="number" inputMode="decimal" value={fFinca.superficie} onChange={(e) => setFFinca({ ...fFinca, superficie: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Referencia</Label>
                <Input value={fFinca.referencia} onChange={(e) => setFFinca({ ...fFinca, referencia: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Ubicación</Label>
              <Input value={fFinca.ubicacion} onChange={(e) => setFFinca({ ...fFinca, ubicacion: e.target.value })} placeholder="Herguijuela (Cáceres)" /></div>
            <div className="space-y-1.5"><Label>Observaciones</Label>
              <Textarea rows={2} value={fFinca.observaciones} onChange={(e) => setFFinca({ ...fFinca, observaciones: e.target.value })} /></div>
            <Button className="w-full" onClick={crearFinca}>Crear finca</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openParcela} onOpenChange={(v) => !v && setOpenParcela(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva parcela</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre *</Label>
              <Input value={fParcela.nombre} onChange={(e) => setFParcela({ ...fParcela, nombre: e.target.value })} placeholder="Dehesilla" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Superficie (ha)</Label>
                <Input type="number" inputMode="decimal" value={fParcela.superficie} onChange={(e) => setFParcela({ ...fParcela, superficie: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Referencia SIGPAC</Label>
                <Input value={fParcela.referencia_sigpac} onChange={(e) => setFParcela({ ...fParcela, referencia_sigpac: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Uso</Label>
                <Select value={fParcela.uso} onValueChange={(v) => setFParcela({ ...fParcela, uso: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pasto">Pasto</SelectItem>
                    <SelectItem value="dehesa">Dehesa</SelectItem>
                    <SelectItem value="cultivo">Cultivo</SelectItem>
                    <SelectItem value="cercado">Cercado</SelectItem>
                    <SelectItem value="otros">Otros</SelectItem>
                  </SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Estado</Label>
                <Select value={fParcela.estado} onValueChange={(v) => setFParcela({ ...fParcela, estado: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponible">Disponible</SelectItem>
                    <SelectItem value="ocupada">Ocupada</SelectItem>
                    <SelectItem value="descanso">En descanso</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            <Button className="w-full" onClick={crearParcela}>Crear parcela</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
