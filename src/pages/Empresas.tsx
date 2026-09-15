import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Search, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { companySchema, firstError } from "@/lib/validation";
import { downloadCSV } from "@/lib/csv";

type Company = {
  id: string; nombre_comercial: string; razon_social: string | null; nif: string | null;
  whatsapp_number: string | null; estado_suscripcion: string; iva_default: number; serie_facturacion: string;
  telefono: string | null; email: string | null; direccion: string | null;
  gestoria_nombre: string | null; gestoria_email: string | null; notas_internas: string | null;
};
const empty: Partial<Company> = { iva_default: 21, serie_facturacion: "A", estado_suscripcion: "prueba" };

export default function Empresas() {
  const [rows, setRows] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Company>>(empty);

  async function load() {
    const { data } = await supabase.from("companies").select("*").order("nombre_comercial");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const parsed = companySchema.safeParse(form);
    if (!parsed.success) { toast({ title: "Datos inválidos", description: firstError(parsed.error), variant: "destructive" }); return; }
    const payload: any = { ...parsed.data };
    const { error } = form.id
      ? await supabase.from("companies").update(payload).eq("id", form.id)
      : await supabase.from("companies").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: form.id ? "Empresa actualizada" : "Empresa creada" });
    setOpen(false); setForm(empty); load();
  }

  function exportar() {
    if (!filtered.length) { toast({ title: "Nada que exportar" }); return; }
    downloadCSV(`empresas-${new Date().toISOString().slice(0,10)}.csv`,
      filtered.map((c) => ({
        nombre_comercial: c.nombre_comercial, razon_social: c.razon_social, nif: c.nif,
        whatsapp: c.whatsapp_number, telefono: c.telefono, email: c.email,
        serie: c.serie_facturacion, iva_default: c.iva_default, estado: c.estado_suscripcion,
      })));
  }

  const filtered = rows.filter((r) =>
    [r.nombre_comercial, r.razon_social, r.nif, r.whatsapp_number].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <PageHeader title="Empresas" description="Cada empresa tiene su número de WhatsApp y datos de gestoría."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nueva empresa</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{form.id ? "Editar empresa" : "Nueva empresa"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field label="Nombre comercial *" v={form.nombre_comercial} on={(v) => setForm({ ...form, nombre_comercial: v })} />
                <Field label="Razón social" v={form.razon_social ?? ""} on={(v) => setForm({ ...form, razon_social: v })} />
                <Field label="NIF/CIF" v={form.nif ?? ""} on={(v) => setForm({ ...form, nif: v })} />
                <Field label="Teléfono" v={form.telefono ?? ""} on={(v) => setForm({ ...form, telefono: v })} />
                <Field label="Email" v={form.email ?? ""} on={(v) => setForm({ ...form, email: v })} />
                <Field label="Nº WhatsApp (+34…)" v={form.whatsapp_number ?? ""} on={(v) => setForm({ ...form, whatsapp_number: v })} />
                <Field label="Serie facturación" v={form.serie_facturacion ?? "A"} on={(v) => setForm({ ...form, serie_facturacion: v })} />
                <Field label="IVA por defecto (%)" v={String(form.iva_default ?? 21)} on={(v) => setForm({ ...form, iva_default: Number(v) })} />
                <Field label="IRPF por defecto (%)" v={String((form as any).irpf_default ?? 0)} on={(v) => setForm({ ...form, ...(({ irpf_default: Number(v) }) as any) })} />
                <Field label="Gestoría — nombre" v={form.gestoria_nombre ?? ""} on={(v) => setForm({ ...form, gestoria_nombre: v })} />
                <Field label="Gestoría — email" v={form.gestoria_email ?? ""} on={(v) => setForm({ ...form, gestoria_email: v })} />
                <div className="md:col-span-2"><Label>Dirección fiscal</Label>
                  <Input value={form.direccion ?? ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
                <Field label="Código postal" v={(form as any).codigo_postal ?? ""} on={(v) => setForm({ ...form, ...(({ codigo_postal: v }) as any) })} />
                <Field label="Ciudad" v={(form as any).ciudad ?? ""} on={(v) => setForm({ ...form, ...(({ ciudad: v }) as any) })} />
                <Field label="Provincia" v={(form as any).provincia ?? ""} on={(v) => setForm({ ...form, ...(({ provincia: v }) as any) })} />
                <div className="md:col-span-2"><Label>Notas internas</Label>
                  <Textarea value={form.notas_internas ?? ""} onChange={(e) => setForm({ ...form, notas_internas: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Guardar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar empresa…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" onClick={exportar}><Download className="mr-2 h-4 w-4" />CSV</Button>
      </div>

      <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead className="hidden sm:table-cell">NIF</TableHead>
              <TableHead className="hidden md:table-cell">WhatsApp</TableHead>
              <TableHead className="hidden lg:table-cell">Serie</TableHead>
              <TableHead className="hidden lg:table-cell">IVA</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setForm(c); setOpen(true); }}>
                <TableCell className="font-medium">{c.nombre_comercial}</TableCell>
                <TableCell className="hidden sm:table-cell">{c.nif ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{c.whatsapp_number ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell">{c.serie_facturacion}</TableCell>
                <TableCell className="hidden lg:table-cell">{c.iva_default}%</TableCell>
                <TableCell><StatusBadge value={c.estado_suscripcion} /></TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">Editar</TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin empresas</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

const Field = ({ label, v, on }: { label: string; v: string; on: (v: string) => void }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Input value={v} onChange={(e) => on(e.target.value)} />
  </div>
);
