import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Search, AlertTriangle, Download } from "lucide-react";
import { eur, fechaCorta } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { downloadCSV } from "@/lib/csv";

export default function Cobros() {
  const { currentCompanyId } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [fCli, setFCli] = useState("todos");

  async function load() {
    if (!currentCompanyId) return;
    const { data } = await supabase.from("invoices").select("*, clients(nombre)")
      .eq("company_id", currentCompanyId).in("estado", ["enviada", "vencida"]).order("fecha");
    setRows(data ?? []);
  }
  useEffect(() => { load(); }, [currentCompanyId]);

  async function marcarCobrada(id: string) {
    const { error } = await supabase.from("invoices").update({ estado: "cobrada", fecha_cobro: new Date().toISOString().slice(0,10) }).eq("id", id);
    if (error) toast({ title: "Error", variant: "destructive" }); else { toast({ title: "Cobrada" }); load(); }
  }

  const today = new Date();
  const enrich = rows.map((r) => {
    const f = new Date(r.fecha); const dias = Math.floor((+today - +f) / (1000 * 60 * 60 * 24));
    return { ...r, dias_vencidos: dias };
  });
  const clientesUnicos = Array.from(new Set(enrich.map((r) => r.clients?.nombre).filter(Boolean)));
  const filtered = useMemo(() => enrich.filter((r) => {
    if (fCli !== "todos" && r.clients?.nombre !== fCli) return false;
    if (q && !`${r.numero} ${r.clients?.nombre ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [enrich, q, fCli]);

  const total = filtered.reduce((a, r) => a + Number(r.total ?? 0), 0);

  return (
    <>
      <PageHeader title="Cobros pendientes" description={`Total pendiente: ${eur(total)} · ${filtered.length} facturas`}
        actions={
          <Button variant="outline" onClick={() => downloadCSV(`cobros-pendientes-${new Date().toISOString().slice(0,10)}.csv`,
            filtered.map((r) => ({ numero: r.numero, cliente: r.clients?.nombre ?? "", fecha: r.fecha, total: r.total, dias_vencidos: r.dias_vencidos, estado: r.estado })))}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
        } />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar nº o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={fCli} onValueChange={setFCli}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los clientes</SelectItem>
            {clientesUnicos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Nº</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="hidden sm:table-cell">Fecha</TableHead>
            <TableHead className="text-right">Importe</TableHead>
            <TableHead className="hidden sm:table-cell">Días</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} className="hover:bg-muted/40">
                <TableCell className="font-mono text-xs sm:text-sm">{r.numero}</TableCell>
                <TableCell className="max-w-[140px] sm:max-w-none truncate">
                  <div>{r.clients?.nombre ?? "—"}</div>
                  <div className="text-xs text-muted-foreground sm:hidden">{fechaCorta(r.fecha)} · {r.dias_vencidos}d</div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{fechaCorta(r.fecha)}</TableCell>
                <TableCell className="text-right font-medium">{eur(r.total)}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className={r.dias_vencidos > 30 ? "inline-flex items-center gap-1 text-destructive font-medium" : "text-muted-foreground"}>
                    {r.dias_vencidos > 30 && <AlertTriangle className="h-3.5 w-3.5" />}{r.dias_vencidos} d
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" onClick={() => marcarCobrada(r.id)}>
                    <CheckCircle2 className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Cobrada</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin cobros pendientes 🎉</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
