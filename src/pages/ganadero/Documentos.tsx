import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { useAuth } from "@/hooks/useAuth";
import { fechaCorta } from "@/lib/format";
import { CATEGORIAS_DOCUMENTO, DOCUMENTO_LABEL } from "@/lib/ganado";
import { toast } from "@/hooks/use-toast";
import { Plus, FileText, Download } from "lucide-react";

type Doc = {
  id: string; nombre: string; categoria: string; archivo_path: string | null;
  fecha: string; animal_id: string | null;
};

export default function Documentos() {
  const { explotacionId } = useExplotacion();
  const { user } = useAuth();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [animales, setAnimales] = useState<{ id: string; crotal: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nombre: "", categoria: "factura", fecha: new Date().toISOString().slice(0, 10), animal_id: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    if (!explotacionId) { setDocs([]); return; }
    const [d, a] = await Promise.all([
      supabase.from("documentos").select("id, nombre, categoria, archivo_path, fecha, animal_id")
        .eq("explotacion_id", explotacionId).order("fecha", { ascending: false }),
      supabase.from("animales").select("id, crotal").eq("explotacion_id", explotacionId).order("crotal").limit(1000),
    ]);
    setDocs((d.data ?? []) as Doc[]);
    setAnimales(a.data ?? []);
  }, [explotacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = async () => {
    const file = fileRef.current?.files?.[0];
    if (!explotacionId || !file) { toast({ title: "Selecciona un archivo", variant: "destructive" }); return; }
    setBusy(true);
    const ext = file.name.split(".").pop();
    const path = `${explotacionId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("documentos").upload(path, file);
    if (up.error) {
      setBusy(false);
      toast({ title: "No se pudo subir el archivo", description: up.error.message, variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("documentos").insert({
      explotacion_id: explotacionId,
      nombre: form.nombre.trim() || file.name,
      categoria: form.categoria,
      fecha: form.fecha,
      archivo_path: path,
      bucket: "documentos",
      animal_id: form.animal_id || null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    setForm({ ...form, nombre: "", animal_id: "" });
    if (fileRef.current) fileRef.current.value = "";
    cargar();
  };

  const abrir = async (d: Doc) => {
    if (!d.archivo_path) return;
    const { data, error } = await supabase.storage.from("documentos").createSignedUrl(d.archivo_path, 120);
    if (error || !data) { toast({ title: "No se pudo abrir", variant: "destructive" }); return; }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Facturas, guías, recetas y documentación sanitaria."
        actions={<Button disabled={!explotacionId} onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Subir documento</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((d) => (
          <Card key={d.id} className="shadow-card">
            <CardContent className="flex items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.nombre}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{DOCUMENTO_LABEL[d.categoria] ?? d.categoria}</Badge>
                  {fechaCorta(d.fecha)}
                </div>
                {animales.find((a) => a.id === d.animal_id) && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Animal {animales.find((a) => a.id === d.animal_id)?.crotal}
                  </div>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => abrir(d)} aria-label="Abrir documento">
                <Download className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {docs.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay documentos.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Subir documento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Archivo *</Label>
              <Input ref={fileRef} type="file" accept="image/*,application/pdf" /></div>
            <div className="space-y-1.5"><Label>Nombre</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Se usará el del archivo si lo dejas vacío" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Categoría</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS_DOCUMENTO.map((c) => <SelectItem key={c} value={c}>{DOCUMENTO_LABEL[c]}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Animal relacionado</Label>
              <Select value={form.animal_id} onValueChange={(v) => setForm({ ...form, animal_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sin animal" /></SelectTrigger>
                <SelectContent>{animales.map((a) => <SelectItem key={a.id} value={a.id}>{a.crotal}</SelectItem>)}</SelectContent>
              </Select></div>
            <Button className="w-full" onClick={subir} disabled={busy}>{busy ? "Subiendo…" : "Guardar documento"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
