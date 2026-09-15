import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { clientSchema, firstError } from "@/lib/validation";
import { downloadCSV } from "@/lib/csv";

type Client = {
  id: string; nombre: string; nif: string | null; telefono: string | null; email: string | null;
  direccion: string | null; codigo_postal: string | null; ciudad: string | null; provincia: string | null;
  observaciones: string | null;
};
const empty: Partial<Client> = {};

export default function Clientes() {
  const { currentCompanyId } = useAuth();
  const [rows, setRows] = useState<Client[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Client>>(empty);

  async function load() {
    if (!currentCompanyId) return;
    const { data } = await supabase.from("clients").select("*").eq("company_id", currentCompanyId).order("nombre");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, [currentCompanyId]);

  async function save() {
    if (!currentCompanyId) return;
    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) { toast({ title: "Datos inválidos", description: firstError(parsed.error), variant: "destructive" }); return; }
    const payload: any = parsed.data;
    const { error } = form.id
      ? await supabase.from("clients").update(payload).eq("id", form.id)
      : await supabase.from("clients").insert({ ...payload, company_id: currentCompanyId });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: form.id ? "Cliente actualizado" : "Cliente creado" });
    setOpen(false); setForm(empty); load();
  }

  function exportar() {
    if (!filtered.length) { toast({ title: "Nada que exportar" }); return; }
    downloadCSV(`clientes-${new Date().toISOString().slice(0,10)}.csv`,
      filtered.map((c) => ({ nombre: c.nombre, nif: c.nif, telefono: c.telefono, email: c.email, direccion: c.direccion })));
  }

  const filtered = rows.filter((r) => [r.nombre, r.nif, r.telefono, r.email].filter(Boolean).join(" ").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Clientes" description="Clientes de la empresa activa."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(empty); }}>
            <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Nuevo cliente</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="md:col-span-2 space-y-1.5"><Label>Nombre *</Label><Input value={form.nombre ?? ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>NIF/CIF</Label><Input value={form.nif ?? ""} onChange={(e) => setForm({ ...form, nif: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.telefono ?? ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="md:col-span-2 space-y-1.5"><Label>Dirección fiscal</Label><Input value={form.direccion ?? ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Código postal</Label><Input value={form.codigo_postal ?? ""} onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Ciudad</Label><Input value={form.ciudad ?? ""} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} /></div>
                <div className="md:col-span-2 space-y-1.5"><Label>Provincia</Label><Input value={form.provincia ?? ""} onChange={(e) => setForm({ ...form, provincia: e.target.value })} /></div>
                <div className="md:col-span-2 space-y-1.5"><Label>Observaciones</Label><Textarea value={form.observaciones ?? ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Guardar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button variant="outline" onClick={exportar}><Download className="mr-2 h-4 w-4" />CSV</Button>
      </div>
      <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead className="hidden sm:table-cell">NIF</TableHead>
            <TableHead className="hidden md:table-cell">Teléfono</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => { setForm(c); setOpen(true); }}>
                <TableCell className="font-medium">
                  <div>{c.nombre}</div>
                  <div className="text-xs text-muted-foreground sm:hidden">{c.nif ?? c.telefono ?? c.email ?? "—"}</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{c.nif ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{c.telefono ?? "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{c.email ?? "—"}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">Editar</TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin clientes</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
