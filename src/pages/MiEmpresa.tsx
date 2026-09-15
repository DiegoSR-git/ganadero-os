import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { companySchema, firstError } from "@/lib/validation";
import { FACTURA_TEMPLATES, type FacturaTemplate, generarFacturaPDF } from "@/lib/pdf";
import { Check, Eye, Upload, X } from "lucide-react";

export default function MiEmpresa() {
  const { currentCompanyId } = useAuth();
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [linkInfo, setLinkInfo] = useState<{ status: string; gestoria_nombre?: string } | null>(null);
  const [gestoriaEmailInput, setGestoriaEmailInput] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  async function load() {
    if (!currentCompanyId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.from("companies").select("*").eq("id", currentCompanyId).maybeSingle();
    setForm(data ?? {});
    setLoading(false);
    // Cargar vínculo de gestoría (si lo hay)
    const { data: link } = await supabase
      .from("gestoria_empresa_links")
      .select("status, gestoria_id, gestorias(nombre)")
      .eq("company_id", currentCompanyId)
      .in("status", ["pending","accepted"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLinkInfo(link ? { status: link.status, gestoria_nombre: (link as any).gestorias?.nombre } : null);
  }
  useEffect(() => { load(); }, [currentCompanyId]);

  async function solicitarVinculacion() {
    if (!currentCompanyId || !gestoriaEmailInput.trim()) return;
    setLinkBusy(true);
    const emailNorm = gestoriaEmailInput.trim().toLowerCase();
    const { error } = await supabase.rpc("request_gestoria_link", {
      _company_id: currentCompanyId,
      _gestoria_email: emailNorm,
    });
    if (error) {
      setLinkBusy(false);
      toast({ title: "No se pudo solicitar", description: error.message, variant: "destructive" });
      return;
    }
    // Actualizar también los datos de gestoría en la empresa
    const { data: g } = await supabase
      .from("gestorias")
      .select("nombre, email, telefono")
      .ilike("email", emailNorm)
      .maybeSingle();
    if (g) {
      await supabase.from("companies").update({
        gestoria_nombre: g.nombre,
        gestoria_email: g.email,
        gestoria_telefono: g.telefono,
      }).eq("id", currentCompanyId);
      setForm((f: any) => ({ ...f, gestoria_nombre: g.nombre, gestoria_email: g.email, gestoria_telefono: g.telefono }));
    }
    setLinkBusy(false);
    toast({ title: "Solicitud enviada", description: "Tu gestoría debe aceptarla en su panel." });
    setGestoriaEmailInput("");
    load();
  }

  async function save() {
    if (!currentCompanyId) return;
    const parsed = companySchema.safeParse(form);
    if (!parsed.success) { toast({ title: "Datos inválidos", description: firstError(parsed.error), variant: "destructive" }); return; }
    setSaving(true);
    const payload: any = { ...parsed.data, factura_template: form.factura_template ?? "profesional" };
    const { error } = await supabase.from("companies").update(payload).eq("id", currentCompanyId);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Datos actualizados" });
    load();
  }

  async function saveTemplate() {
    if (!currentCompanyId) return;
    const tpl = form.factura_template ?? "profesional";
    if (!["profesional","creativa","corporativa","elegante","personalizada"].includes(tpl)) {
      toast({ title: "Plantilla no válida", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload: any = {
      factura_template: tpl,
      factura_logo_url: form.factura_logo_url ?? null,
      factura_color_primario: form.factura_color_primario ?? null,
      factura_color_acento: form.factura_color_acento ?? null,
      factura_encabezado: form.factura_encabezado ?? null,
      factura_pie: form.factura_pie ?? null,
    };
    const { error } = await supabase.from("companies").update(payload).eq("id", currentCompanyId);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Plantilla guardada" });
  }

  async function fetchLogoDataUrl(url?: string | null): Promise<string | null> {
    if (!url) return null;
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function previewTemplate(tpl: FacturaTemplate) {
    let logoDataUrl: string | null = null;
    if (tpl === "personalizada" && form.factura_logo_url) {
      logoDataUrl = await fetchLogoDataUrl(form.factura_logo_url);
    }
    const doc = generarFacturaPDF({
      numero: `${form.serie_facturacion ?? "A"}-0001`,
      fecha: new Date().toISOString().slice(0, 10),
      concepto: "Servicios profesionales (ejemplo)",
      base_imponible: 1000,
      iva_porcentaje: Number(form.iva_default ?? 21),
      iva_importe: 1000 * (Number(form.iva_default ?? 21) / 100),
      total: 1000 + 1000 * (Number(form.iva_default ?? 21) / 100),
      notas: "Vista previa de plantilla",
      lineas: [
        { concepto: "Trabajo realizado en obra", importe: 700 },
        { concepto: "Materiales", importe: 300 },
      ],
      emisor: {
        nombre: form.nombre_comercial || "Mi empresa",
        nif: form.nif, direccion: form.direccion, email: form.email, telefono: form.telefono,
      },
      cliente: { nombre: "Cliente Ejemplo S.L.", nif: "B12345678", direccion: "Calle Mayor 1, Madrid" },
      template: tpl,
      custom: tpl === "personalizada" ? {
        color_primario: form.factura_color_primario,
        color_acento: form.factura_color_acento,
        encabezado: form.factura_encabezado,
        pie: form.factura_pie,
        logo_data_url: logoDataUrl,
      } : null,
    });
    window.open(doc.output("bloburl"), "_blank");
  }

  async function onLogoUpload(file: File) {
    if (!currentCompanyId) return;
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) {
      toast({ title: "Formato no soportado", description: "Usa PNG, JPG, WEBP o SVG.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagen demasiado grande", description: "Máximo 2 MB.", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${currentCompanyId}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploadingLogo(false);
      toast({ title: "Error subiendo logo", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
    setForm({ ...form, factura_logo_url: data.publicUrl });
    setUploadingLogo(false);
    toast({ title: "Logo subido", description: "Recuerda guardar la plantilla." });
  }

  if (!currentCompanyId) {
    return <PageHeader title="Mi empresa" description="Selecciona una empresa en la cabecera." />;
  }

  return (
    <>
      <PageHeader title="Mi empresa" description="Edita los datos de tu empresa, gestoría y facturación." />
      {!loading && (
        linkInfo?.status === "accepted" ? (
          <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm dark:border-green-700 dark:bg-green-950">
            <strong>Vinculada a la gestoría:</strong> {linkInfo.gestoria_nombre} · Descuento del 50% activo en tu suscripción.
          </div>
        ) : linkInfo?.status === "pending" ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
            Solicitud de vinculación enviada a <strong>{linkInfo.gestoria_nombre}</strong>. Esperando aprobación.
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="mb-2 text-sm">
              <strong>¿Tu gestoría usa GanaderOS?</strong> Vincúlate y obtén un <strong>50% de descuento</strong> en tu suscripción.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                placeholder="Email de tu gestoría"
                value={gestoriaEmailInput}
                onChange={(e) => setGestoriaEmailInput(e.target.value)}
              />
              <Button onClick={solicitarVinculacion} disabled={linkBusy || !gestoriaEmailInput.trim()}>
                {linkBusy ? "Enviando…" : "Solicitar vinculación"}
              </Button>
            </div>
          </div>
        )
      )}
      {loading ? (
        <div className="text-muted-foreground">Cargando…</div>
      ) : (
        <div className="rounded-lg border bg-card p-4 shadow-card md:p-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Nombre comercial *" v={form.nombre_comercial ?? ""} on={(v) => setForm({ ...form, nombre_comercial: v })} />
            <Field label="Razón social" v={form.razon_social ?? ""} on={(v) => setForm({ ...form, razon_social: v })} />
            <Field label="NIF/CIF" v={form.nif ?? ""} on={(v) => setForm({ ...form, nif: v })} />
            <Field label="Teléfono" v={form.telefono ?? ""} on={(v) => setForm({ ...form, telefono: v })} />
            <Field label="Email" v={form.email ?? ""} on={(v) => setForm({ ...form, email: v })} />
            <Field label="Nº WhatsApp" v={form.whatsapp_number ?? ""} on={(v) => setForm({ ...form, whatsapp_number: v })} />
            <Field label="Serie facturación" v={form.serie_facturacion ?? "A"} on={(v) => setForm({ ...form, serie_facturacion: v })} />
            <Field label="IVA por defecto (%)" v={String(form.iva_default ?? 21)} on={(v) => setForm({ ...form, iva_default: Number(v) })} />
            <Field label="IRPF por defecto (%)" v={String(form.irpf_default ?? 0)} on={(v) => setForm({ ...form, irpf_default: Number(v) })} />
            <Field label="Gestoría — nombre" v={form.gestoria_nombre ?? ""} on={(v) => setForm({ ...form, gestoria_nombre: v })} />
            <Field label="Gestoría — email" v={form.gestoria_email ?? ""} on={(v) => setForm({ ...form, gestoria_email: v })} />
            <div className="md:col-span-2 space-y-1.5">
              <Label>Dirección fiscal</Label>
              <Input value={form.direccion ?? ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
            <Field label="Código postal" v={form.codigo_postal ?? ""} on={(v) => setForm({ ...form, codigo_postal: v })} />
            <Field label="Ciudad" v={form.ciudad ?? ""} on={(v) => setForm({ ...form, ciudad: v })} />
            <Field label="Provincia" v={form.provincia ?? ""} on={(v) => setForm({ ...form, provincia: v })} />
            <div className="md:col-span-2 space-y-1.5">
              <Label>Notas internas</Label>
              <Textarea value={form.notas_internas ?? ""} onChange={(e) => setForm({ ...form, notas_internas: e.target.value })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
          </div>
        </div>
      )}
      {!loading && (
        <div className="mt-6 rounded-lg border bg-card p-4 shadow-card md:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Plantilla de factura</h2>
            <p className="text-sm text-muted-foreground">Elige el diseño con el que se generarán todas tus facturas. Todas son fiscalmente válidas.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FACTURA_TEMPLATES.map((t) => {
              const selected = (form.factura_template ?? "profesional") === t.id;
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setForm({ ...form, factura_template: t.id })}
                  className={`group relative flex flex-col rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${selected ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                >
                  {selected && (
                    <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </div>
                  )}
                  <TemplatePreview id={t.id} />
                  <div className="mt-3 font-semibold">{t.nombre}</div>
                  <div className="text-xs text-muted-foreground">{t.descripcion}</div>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="mt-3"
                    onClick={(e) => { e.stopPropagation(); previewTemplate(t.id); }}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Vista previa PDF
                  </Button>
                </button>
              );
            })}
          </div>
          {(form.factura_template ?? "profesional") === "personalizada" && (
            <div className="mt-6 rounded-lg border bg-muted/30 p-4">
              <div className="mb-3">
                <h3 className="font-semibold">Personalización</h3>
                <p className="text-xs text-muted-foreground">Sube tu logo, ajusta los colores y añade un encabezado y pie propios.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    {form.factura_logo_url ? (
                      <div className="relative">
                        <img src={form.factura_logo_url} alt="Logo" className="h-20 w-32 rounded border bg-white object-contain p-1" />
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, factura_logo_url: null })}
                          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                          aria-label="Quitar logo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-20 w-32 items-center justify-center rounded border bg-background text-xs text-muted-foreground">Sin logo</div>
                    )}
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
                      <Upload className="h-4 w-4" />
                      {uploadingLogo ? "Subiendo…" : "Subir logo"}
                      <input
                        type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoUpload(f); e.target.value = ""; }}
                        disabled={uploadingLogo}
                      />
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">PNG/JPG/WEBP/SVG · máx. 2 MB.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Color principal</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.factura_color_primario || "#1c4e91"}
                        onChange={(e) => setForm({ ...form, factura_color_primario: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded border"
                      />
                      <Input
                        value={form.factura_color_primario ?? ""}
                        placeholder="#1c4e91"
                        onChange={(e) => setForm({ ...form, factura_color_primario: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Color acento</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.factura_color_acento || "#1c4e91"}
                        onChange={(e) => setForm({ ...form, factura_color_acento: e.target.value })}
                        className="h-10 w-12 cursor-pointer rounded border"
                      />
                      <Input
                        value={form.factura_color_acento ?? ""}
                        placeholder="#1c4e91"
                        onChange={(e) => setForm({ ...form, factura_color_acento: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <Label>Encabezado (texto bajo el logo)</Label>
                  <Textarea
                    rows={2}
                    value={form.factura_encabezado ?? ""}
                    placeholder="Ej.: Servicios profesionales para el sector rural · Atención personalizada"
                    onChange={(e) => setForm({ ...form, factura_encabezado: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <Label>Pie de factura</Label>
                  <Textarea
                    rows={2}
                    value={form.factura_pie ?? ""}
                    placeholder="Ej.: Gracias por confiar en nosotros · IBAN ES12 ... · www.miempresa.com"
                    onChange={(e) => setForm({ ...form, factura_pie: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button onClick={saveTemplate} disabled={saving}>{saving ? "Guardando…" : "Guardar plantilla"}</Button>
          </div>
        </div>
      )}
    </>
  );
}

const Field = ({ label, v, on }: { label: string; v: string; on: (v: string) => void }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Input value={v} onChange={(e) => on(e.target.value)} />
  </div>
);

function TemplatePreview({ id }: { id: FacturaTemplate }) {
  // Mini-mockup CSS simulando cada plantilla
  const common = "h-32 w-full overflow-hidden rounded border bg-white relative";
  if (id === "profesional") {
    return (
      <div className={common}>
        <div className="absolute inset-x-0 top-0 h-6 bg-[hsl(214,67%,34%)]" />
        <div className="absolute left-1.5 top-1.5 text-[7px] font-bold text-white">FACTURA</div>
        <div className="absolute inset-x-1.5 top-9 h-4 rounded bg-[hsl(214,67%,95%)]" />
        <div className="absolute inset-x-1.5 top-15 mt-1 space-y-1">
          <div className="h-1 w-3/4 rounded bg-slate-300" />
          <div className="h-1 w-2/3 rounded bg-slate-300" />
          <div className="h-1 w-4/5 rounded bg-slate-300" />
        </div>
        <div className="absolute inset-x-1.5 bottom-1.5 h-3 rounded bg-[hsl(214,67%,34%)]" />
      </div>
    );
  }
  if (id === "creativa") {
    return (
      <div className={common}>
        <div className="absolute inset-y-0 left-0 w-1.5 bg-[hsl(22,100%,58%)]" />
        <div className="absolute inset-y-0 left-1.5 w-0.5 bg-[hsl(22,100%,90%)]" />
        <div className="absolute left-3 top-2 text-[9px] font-bold text-slate-800">Factura</div>
        <div className="absolute left-3 top-7 text-[6px] font-bold text-[hsl(22,100%,58%)]">#A-0001</div>
        <div className="absolute inset-x-3 top-12 h-6 rounded border-2 border-[hsl(22,100%,58%)]" />
        <div className="absolute inset-x-3 top-20 space-y-1">
          <div className="h-1 w-3/4 rounded bg-slate-300" />
          <div className="h-1 w-2/3 rounded bg-slate-300" />
        </div>
        <div className="absolute bottom-1 right-2 text-[8px] font-bold text-[hsl(22,100%,58%)]">TOTAL</div>
      </div>
    );
  }
  if (id === "corporativa") {
    return (
      <div className={common}>
        <div className="absolute inset-x-0 top-0 h-0.5 bg-slate-900" />
        <div className="absolute left-1.5 top-2 text-[7px] font-bold text-slate-900">EMPRESA</div>
        <div className="absolute right-1.5 top-2 h-8 w-12 border border-slate-900" />
        <div className="absolute inset-x-1.5 top-14 h-px bg-slate-300" />
        <div className="absolute inset-x-1.5 top-16 space-y-1">
          <div className="h-1 w-1/4 rounded bg-slate-400" />
          <div className="h-1 w-3/4 rounded bg-slate-300" />
          <div className="h-1 w-2/3 rounded bg-slate-300" />
        </div>
        <div className="absolute inset-x-1.5 bottom-3 h-px bg-slate-900" />
        <div className="absolute bottom-1 right-2 text-[7px] font-bold text-slate-900">TOTAL</div>
      </div>
    );
  }
  if (id === "elegante") {
    return (
    <div className={common}>
      <div className="absolute left-2 top-3 font-serif italic text-[10px] text-amber-900">Factura</div>
      <div className="absolute right-2 top-3 font-serif text-[6px] text-slate-500">Nº A-0001</div>
      <div className="absolute inset-x-2 top-9 h-px bg-amber-700/40" />
      <div className="absolute inset-x-2 top-12 space-y-1">
        <div className="h-1 w-1/3 rounded bg-amber-700/30" />
        <div className="h-1 w-3/4 rounded bg-slate-300" />
        <div className="h-1 w-2/3 rounded bg-slate-300" />
      </div>
      <div className="absolute inset-x-2 bottom-3 h-px bg-amber-700/60" />
      <div className="absolute bottom-1 right-2 font-serif text-[8px] italic text-amber-900">Total</div>
    </div>
    );
  }
  // personalizada
  return (
    <div className={common}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-accent" />
      <div className="absolute left-1.5 top-2 h-7 w-10 rounded border-2 border-dashed border-slate-400 flex items-center justify-center text-[6px] text-slate-500">LOGO</div>
      <div className="absolute right-2 top-2 text-[6px] font-bold text-slate-700 text-right">Tu empresa<br/>NIF · contacto</div>
      <div className="absolute inset-x-2 top-12 h-px bg-slate-400" />
      <div className="absolute inset-x-2 top-14 space-y-1">
        <div className="h-1 w-2/3 rounded bg-slate-300" />
        <div className="h-1 w-3/4 rounded bg-slate-300" />
      </div>
      <div className="absolute inset-x-2 bottom-4 h-px bg-slate-300" />
      <div className="absolute bottom-0.5 left-2 right-2 text-[5px] italic text-slate-500 truncate">Tu pie de factura personalizable</div>
    </div>
  );
}