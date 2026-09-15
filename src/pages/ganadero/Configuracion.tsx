import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useExplotacion } from "@/hooks/useExplotacion";
import { toast } from "@/hooks/use-toast";

const vacio = {
  nombre: "", codigo_rega: "", especie_principal: "bovino", tipo_ganaderia: "extensiva",
  municipio: "", provincia: "", superficie_total: "", numero_animales_estimado: "",
  whatsapp_number: "",
};

export default function Configuracion() {
  const { user } = useAuth();
  const { explotacion, refresh, setExplotacionId } = useExplotacion();
  const [form, setForm] = useState(vacio);
  const [busy, setBusy] = useState(false);
  const [waMensajes, setWaMensajes] = useState(0);
  const waActivo = !!(explotacion as any)?.whatsapp_number;

  useEffect(() => {
    const numero = (explotacion as any)?.whatsapp_number;
    if (!numero) { setWaMensajes(0); return; }
    const desde = new Date(Date.now() - 7 * 86400_000).toISOString();
    supabase
      .from("wa_messages")
      .select("id", { count: "exact", head: true })
      .eq("remitente", numero)
      .gte("created_at", desde)
      .then(({ count }) => setWaMensajes(count ?? 0));
  }, [explotacion]);

  useEffect(() => {
    if (!explotacion) { setForm(vacio); return; }
    setForm({
      nombre: explotacion.nombre ?? "",
      codigo_rega: explotacion.codigo_rega ?? "",
      especie_principal: explotacion.especie_principal ?? "bovino",
      tipo_ganaderia: explotacion.tipo_ganaderia ?? "extensiva",
      municipio: explotacion.municipio ?? "",
      provincia: explotacion.provincia ?? "",
      superficie_total: explotacion.superficie_total?.toString() ?? "",
      numero_animales_estimado: explotacion.numero_animales_estimado?.toString() ?? "",
      whatsapp_number: (explotacion as any).whatsapp_number ?? "",
    });
  }, [explotacion]);

  const guardar = async () => {
    if (!user) return;
    if (!form.nombre.trim()) { toast({ title: "El nombre es obligatorio", variant: "destructive" }); return; }
    setBusy(true);
    const payload = {
      nombre: form.nombre.trim(),
      codigo_rega: form.codigo_rega.trim() || null,
      especie_principal: form.especie_principal,
      tipo_ganaderia: form.tipo_ganaderia,
      municipio: form.municipio.trim() || null,
      provincia: form.provincia.trim() || null,
      superficie_total: form.superficie_total ? Number(form.superficie_total) : null,
      numero_animales_estimado: form.numero_animales_estimado ? Number(form.numero_animales_estimado) : null,
      whatsapp_number: form.whatsapp_number.trim() || null,
    };
    let error;
    if (explotacion) {
      ({ error } = await supabase.from("explotaciones").update(payload).eq("id", explotacion.id));
    } else {
      const res = await supabase.from("explotaciones").insert({ ...payload, user_id: user.id }).select("id").single();
      error = res.error;
      if (res.data) setExplotacionId(res.data.id);
    }
    setBusy(false);
    if (error) { toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" }); return; }
    await refresh();
    toast({ title: "Explotación guardada" });
  };

  return (
    <>
      <PageHeader
        title="Configuración"
        description={explotacion ? "Datos de tu explotación ganadera." : "Crea tu explotación para empezar."}
      />
      <Card className="max-w-3xl shadow-card">
        <CardHeader><CardTitle className="text-base">Explotación</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nombre *</Label>
            <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Dehesa La Herguijuela" />
          </div>
          <div className="space-y-1.5">
            <Label>Código REGA</Label>
            <Input value={form.codigo_rega} onChange={(e) => setForm({ ...form, codigo_rega: e.target.value })} placeholder="ES100000000000" />
          </div>
          <div className="space-y-1.5">
            <Label>Especie principal</Label>
            <Select value={form.especie_principal} onValueChange={(v) => setForm({ ...form, especie_principal: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bovino">Bovino</SelectItem>
                <SelectItem value="ovino">Ovino</SelectItem>
                <SelectItem value="caprino">Caprino</SelectItem>
                <SelectItem value="porcino">Porcino</SelectItem>
                <SelectItem value="equino">Equino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de ganadería</Label>
            <Select value={form.tipo_ganaderia} onValueChange={(v) => setForm({ ...form, tipo_ganaderia: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="extensiva">Extensiva</SelectItem>
                <SelectItem value="intensiva">Intensiva</SelectItem>
                <SelectItem value="mixta">Mixta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Municipio</Label>
            <Input value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Provincia</Label>
            <Input value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Superficie total (ha)</Label>
            <Input type="number" inputMode="decimal" value={form.superficie_total} onChange={(e) => setForm({ ...form, superficie_total: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Nº de animales estimado</Label>
            <Input type="number" value={form.numero_animales_estimado} onChange={(e) => setForm({ ...form, numero_animales_estimado: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>WhatsApp del ganadero</Label>
            <Input
              value={form.whatsapp_number}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
              placeholder="+34 600 000 000"
            />
            <p className="text-xs text-muted-foreground">
              Añade aquí tu número para poder gestionar la explotación por WhatsApp (texto, audios y fotos de crotales).
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={guardar} disabled={busy}>{explotacion ? "Guardar cambios" : "Crear explotación"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 max-w-3xl shadow-card">
        <CardHeader><CardTitle className="text-base">WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${waActivo ? "bg-primary" : "bg-muted-foreground/40"}`} />
            {waActivo
              ? <span>Listo: los mensajes de <strong>{form.whatsapp_number}</strong> entran en esta explotación.</span>
              : <span className="text-muted-foreground">Añade tu número arriba y guarda para activarlo.</span>}
          </div>
          {waActivo && (
            <p className="text-sm text-muted-foreground">
              Mensajes recibidos en los últimos 7 días: <strong>{waMensajes}</strong>
            </p>
          )}
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="mb-1 font-medium">Pruébalo escribiendo:</p>
            <p className="text-muted-foreground">“Ha parido la 7843, ternera” · “Pesa 340 la 1122” · “¿Cuántas vacas tengo?”</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Antes de guardar nada te pedirá confirmación. Escribe AYUDA para ver ejemplos y CANCELAR para empezar de nuevo.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
