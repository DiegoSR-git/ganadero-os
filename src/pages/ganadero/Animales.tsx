import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { edadTexto, REPRO_LABEL, ESTADOS_REPRODUCTIVOS, categoriaLabel } from "@/lib/ganado";
import { Plus, Search, ChevronRight, Upload, Pencil, Baby, Tag } from "lucide-react";
import RegistrarEventoDialog from "@/components/RegistrarEventoDialog";
import ImportarAnimales from "@/components/ImportarAnimales";
import EditarAnimalDialog from "@/components/EditarAnimalDialog";
import NuevoAnimalDialog from "@/components/NuevoAnimalDialog";
import RegistrarPartoDialog from "@/components/RegistrarPartoDialog";
import AsignarCrotalDialog from "@/components/AsignarCrotalDialog";

type Animal = {
  id: string; crotal: string; sexo: string; raza: string | null; estado: string; especie: string;
  estado_reproductivo: string | null; fecha_nacimiento: string | null; lote_id: string | null;
  peso_actual: number | null; observaciones: string | null;
  crotal_pendiente: boolean; codigo_temporal: string | null;
};

export default function Animales() {
  const { explotacionId } = useExplotacion();
  const [animales, setAnimales] = useState<Animal[]>([]);
  const [lotes, setLotes] = useState<{ id: string; nombre: string }[]>([]);
  const [ultimos, setUltimos] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [fLote, setFLote] = useState("todos");
  const [fSexo, setFSexo] = useState("todos");
  const [fEstado, setFEstado] = useState("activo");
  const [fRepro, setFRepro] = useState("todos");
  const [open, setOpen] = useState(false);
  const [parto, setParto] = useState(false);
  const [asignar, setAsignar] = useState<Animal | null>(null);
  const [especiePrincipal, setEspeciePrincipal] = useState<string | null>(null);
  const [eventoPara, setEventoPara] = useState<string | null>(null);
  const [importar, setImportar] = useState(false);
  const [editar, setEditar] = useState<Animal | null>(null);
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 50;

  const cargar = useCallback(async () => {
    if (!explotacionId) { setAnimales([]); return; }
    const [a, l, ev, ex] = await Promise.all([
      supabase.from("animales").select("id, crotal, sexo, raza, estado, especie, estado_reproductivo, fecha_nacimiento, lote_id, peso_actual, observaciones, crotal_pendiente, codigo_temporal")
        .eq("explotacion_id", explotacionId).order("crotal"),
      supabase.from("lotes").select("id, nombre").eq("explotacion_id", explotacionId).order("nombre"),
      supabase.from("eventos_animales").select("animal_id, tipo_evento, fecha")
        .eq("explotacion_id", explotacionId).order("fecha", { ascending: false }).limit(2000),
      supabase.from("explotaciones").select("especie_principal").eq("id", explotacionId).maybeSingle(),
    ]);
    setAnimales((a.data ?? []) as Animal[]);
    setLotes(l.data ?? []);
    setEspeciePrincipal(ex.data?.especie_principal ?? null);
    const map: Record<string, string> = {};
    (ev.data ?? []).forEach((e) => { if (e.animal_id && !map[e.animal_id]) map[e.animal_id] = e.tipo_evento; });
    setUltimos(map);
  }, [explotacionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const nombreLote = (id: string | null) => lotes.find((l) => l.id === id)?.nombre ?? "—";

  const lista = useMemo(() => animales.filter((a) => {
    if (q && !a.crotal.toLowerCase().includes(q.toLowerCase())) return false;
    if (fLote !== "todos" && a.lote_id !== fLote) return false;
    if (fSexo !== "todos" && a.sexo !== fSexo) return false;
    if (fEstado !== "todos" && a.estado !== fEstado) return false;
    if (fRepro !== "todos" && a.estado_reproductivo !== fRepro) return false;
    return true;
  }), [animales, q, fLote, fSexo, fEstado, fRepro]);

  useEffect(() => { setPagina(1); }, [q, fLote, fSexo, fEstado, fRepro, explotacionId]);

  const visibles = useMemo(() => lista.slice(0, pagina * POR_PAGINA), [lista, pagina]);


  return (
    <>
      <PageHeader
        title="Animales"
        description={`${lista.length} animales`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!explotacionId} onClick={() => setImportar(true)}>
              <Upload className="mr-1 h-4 w-4" /> Importar
            </Button>
            <Button variant="outline" disabled={!explotacionId} onClick={() => setParto(true)}>
              <Baby className="mr-1 h-4 w-4" /> Parto
            </Button>
            <Button disabled={!explotacionId} onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Añadir animal</Button>
          </div>
        }
      />

      <Card className="mb-4 shadow-card">
        <CardContent className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar crotal…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fLote} onValueChange={setFLote}>
            <SelectTrigger><SelectValue placeholder="Lote" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los lotes</SelectItem>
              {lotes.map((l) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fSexo} onValueChange={setFSexo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Ambos sexos</SelectItem>
              <SelectItem value="hembra">Hembras</SelectItem>
              <SelectItem value="macho">Machos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fEstado} onValueChange={setFEstado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="baja">Bajas</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fRepro} onValueChange={setFRepro}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Reproducción: todas</SelectItem>
              {ESTADOS_REPRODUCTIVOS.map((e) => <SelectItem key={e} value={e}>{REPRO_LABEL[e]}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Móvil: tarjetas */}
      <div className="space-y-2 md:hidden">
        {visibles.map((a) => (
          <Link key={a.id} to={`/animales/${a.id}`}>
            <Card className="shadow-card">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.crotal}</span>
                    <Badge variant={a.estado === "activo" ? "secondary" : "outline"}>{a.estado}</Badge>
                    {a.crotal_pendiente && <Badge variant="outline">Crotal pendiente</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {categoriaLabel(a)} · {edadTexto(a.fecha_nacimiento)} · {a.raza ?? "sin raza"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Lote: {nombreLote(a.lote_id)} · Último: {ultimos[a.id] ?? "—"}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Editar ${a.crotal}`}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditar(a); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
        {lista.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sin animales que mostrar.</p>}
      </div>

      {/* Escritorio: tabla */}
      <Card className="hidden shadow-card md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crotal</TableHead><TableHead>Categoría</TableHead><TableHead>Edad</TableHead>
                <TableHead>Raza</TableHead><TableHead>Lote</TableHead><TableHead>Estado</TableHead>
                <TableHead>Último evento</TableHead><TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.crotal}
                    {a.crotal_pendiente && <Badge variant="outline" className="ml-2">Pendiente</Badge>}
                  </TableCell>
                  <TableCell>{categoriaLabel(a)}</TableCell>
                  <TableCell>{edadTexto(a.fecha_nacimiento)}</TableCell>
                  <TableCell>{a.raza ?? "—"}</TableCell>
                  <TableCell>{nombreLote(a.lote_id)}</TableCell>
                  <TableCell><Badge variant={a.estado === "activo" ? "secondary" : "outline"}>{a.estado}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{ultimos[a.id] ?? "—"}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button size="sm" variant="outline" asChild><Link to={`/animales/${a.id}`}>Ver</Link></Button>
                    {a.crotal_pendiente && (
                      <Button size="sm" variant="ghost" onClick={() => setAsignar(a)}><Tag className="mr-1 h-4 w-4" /> Crotal</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEventoPara(a.id)}>Registrar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditar(a)}>Editar</Button>
                  </TableCell>
                </TableRow>
              ))}
              {lista.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-sm text-muted-foreground">Sin animales que mostrar.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {visibles.length < lista.length && (
        <div className="mt-3 flex justify-center">
          <Button variant="outline" onClick={() => setPagina((p) => p + 1)}>
            Ver más ({lista.length - visibles.length} restantes)
          </Button>
        </div>
      )}

      <NuevoAnimalDialog
        open={open}
        onOpenChange={setOpen}
        explotacionId={explotacionId}
        especiePorDefecto={especiePrincipal}
        lotes={lotes}
        onSaved={cargar}
      />

      <RegistrarPartoDialog open={parto} onOpenChange={setParto} onSaved={cargar} />

      <AsignarCrotalDialog
        open={!!asignar}
        onOpenChange={(v) => !v && setAsignar(null)}
        animal={asignar}
        onSaved={cargar}
      />

      <ImportarAnimales
        open={importar}
        onOpenChange={setImportar}
        explotacionId={explotacionId}
        onDone={cargar}
      />

      <RegistrarEventoDialog
        open={!!eventoPara}
        onOpenChange={(v) => !v && setEventoPara(null)}
        animalId={eventoPara ?? undefined}
        onSaved={cargar}
      />

      <EditarAnimalDialog
        open={!!editar}
        onOpenChange={(v) => !v && setEditar(null)}
        animal={editar}
        lotes={lotes}
        onSaved={cargar}
        onDeleted={cargar}
      />
    </>
  );
}
