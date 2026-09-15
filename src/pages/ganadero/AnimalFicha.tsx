import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { edadTexto, EVENTO_LABEL, REPRO_LABEL, categoriaLabel } from "@/lib/ganado";
import { fechaCorta } from "@/lib/format";
import RegistrarEventoDialog from "@/components/RegistrarEventoDialog";
import EditarAnimalDialog from "@/components/EditarAnimalDialog";
import RegistrarPartoDialog from "@/components/RegistrarPartoDialog";
import AsignarCrotalDialog from "@/components/AsignarCrotalDialog";
import { ArrowLeft, Plus, Beef, Pencil, Baby, Tag } from "lucide-react";

type Animal = {
  id: string; crotal: string; sexo: string; raza: string | null; estado: string; especie: string;
  estado_reproductivo: string | null; fecha_nacimiento: string | null; peso_actual: number | null;
  lote_id: string | null; parcela_id: string | null; fotografia_url: string | null;
  observaciones: string | null; origen: string | null;
  madre_id: string | null; padre_id: string | null;
  crotal_pendiente: boolean; codigo_temporal: string | null; ultimo_parto: string | null;
};

type Pariente = { id: string; crotal: string };

type Evento = {
  id: string; tipo_evento: string; fecha: string; descripcion: string | null;
  metadata: Record<string, unknown> | null; estado: string;
};

export default function AnimalFicha() {
  const { id } = useParams<{ id: string }>();
  const [animal, setAnimal] = useState<Animal | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [hijos, setHijos] = useState<Pariente[]>([]);
  const [madre, setMadre] = useState<Pariente | null>(null);
  const [padre, setPadre] = useState<Pariente | null>(null);
  const [lote, setLote] = useState<string>("—");
  const [filtro, setFiltro] = useState("todos");
  const [open, setOpen] = useState(false);
  const [parto, setParto] = useState(false);
  const [crotalOpen, setCrotalOpen] = useState(false);
  const [editando, setEditando] = useState(false);
  const [lotes, setLotes] = useState<{ id: string; nombre: string }[]>([]);
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    if (!id) return;
    const { data: a } = await supabase.from("animales").select("*").eq("id", id).maybeSingle();
    setAnimal((a ?? null) as Animal | null);
    const [ev, des] = await Promise.all([
      supabase.from("eventos_animales").select("id, tipo_evento, fecha, descripcion, metadata, estado")
        .eq("animal_id", id).order("fecha", { ascending: false }),
      supabase.from("animales").select("id, crotal").or(`madre_id.eq.${id},padre_id.eq.${id}`),
    ]);
    setEventos((ev.data ?? []) as Evento[]);
    setHijos(des.data ?? []);
    const padres = [a?.madre_id, a?.padre_id].filter(Boolean) as string[];
    if (padres.length) {
      const { data: ps } = await supabase.from("animales").select("id, crotal").in("id", padres);
      setMadre((ps ?? []).find((p) => p.id === a?.madre_id) ?? null);
      setPadre((ps ?? []).find((p) => p.id === a?.padre_id) ?? null);
    } else { setMadre(null); setPadre(null); }
    if (a?.explotacion_id) {
      const { data: ls } = await supabase.from("lotes").select("id, nombre")
        .eq("explotacion_id", a.explotacion_id).order("nombre");
      setLotes(ls ?? []);
    }
    if (a?.lote_id) {
      const { data: l } = await supabase.from("lotes").select("nombre").eq("id", a.lote_id).maybeSingle();
      setLote(l?.nombre ?? "—");
    } else setLote("—");
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  if (!animal) return <p className="text-sm text-muted-foreground">Cargando animal…</p>;

  const visibles = filtro === "todos" ? eventos : eventos.filter((e) => e.tipo_evento === filtro);
  const tipos = Array.from(new Set(eventos.map((e) => e.tipo_evento)));

  const cuenta = (t: string[]) => eventos.filter((e) => t.includes(e.tipo_evento)).length;

  const tarjetas = [
    { t: "Reproducción", v: animal.estado_reproductivo ? REPRO_LABEL[animal.estado_reproductivo] ?? animal.estado_reproductivo : "—", s: `${cuenta(["parto", "cubricion", "inseminacion", "gestacion", "aborto"])} eventos` },
    { t: "Sanidad", v: cuenta(["tratamiento", "vacuna", "revision"]), s: "tratamientos y vacunas" },
    { t: "Peso", v: animal.peso_actual ? `${animal.peso_actual} kg` : "—", s: `${cuenta(["pesaje"])} pesajes` },
    { t: "Descendencia", v: hijos.length, s: hijos.map((h) => h.crotal).slice(0, 3).join(", ") || "sin crías" },
    { t: "Incidencias", v: cuenta(["incidencia"]), s: "registradas" },
    { t: "Documentos", v: cuenta(["compra", "venta", "movimiento"]), s: "movimientos" },
  ];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/animales"><ArrowLeft className="mr-1 h-4 w-4" /> Animales</Link>
      </Button>

      <Card className="overflow-hidden shadow-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary-soft text-primary">
            {animal.fotografia_url
              ? <img src={animal.fotografia_url} alt={`Animal ${animal.crotal}`} className="h-full w-full object-cover" />
              : <Beef className="h-8 w-8" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{animal.crotal}</h1>
              <Badge variant={animal.estado === "activo" ? "secondary" : "outline"}>{animal.estado}</Badge>
              {animal.crotal_pendiente && <Badge variant="outline">Crotal pendiente</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {categoriaLabel(animal)} · {animal.raza ?? "sin raza"} · {edadTexto(animal.fecha_nacimiento)} · Lote {lote}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Madre: {madre ? <Link className="underline" to={`/animales/${madre.id}`}>{madre.crotal}</Link> : "—"}
              {" · "}
              Padre: {padre ? <Link className="underline" to={`/animales/${padre.id}`}>{padre.crotal}</Link> : "—"}
              {animal.ultimo_parto ? ` · Último parto: ${fechaCorta(animal.ultimo_parto)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {animal.crotal_pendiente && (
              <Button variant="outline" onClick={() => setCrotalOpen(true)}><Tag className="mr-1 h-4 w-4" /> Asignar crotal</Button>
            )}
            {animal.sexo !== "macho" && (
              <Button variant="outline" onClick={() => setParto(true)}><Baby className="mr-1 h-4 w-4" /> Parto</Button>
            )}
            <Button variant="outline" onClick={() => setEditando(true)}><Pencil className="mr-1 h-4 w-4" /> Editar</Button>
            <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Registrar evento</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tarjetas.map((c) => (
          <Card key={c.t} className="shadow-card">
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.t}</div>
              <div className="text-xl font-bold">{c.v}</div>
              <div className="truncate text-xs text-muted-foreground">{c.s}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="text-base">Historial</CardTitle>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los eventos</SelectItem>
              {tipos.map((t) => <SelectItem key={t} value={t}>{EVENTO_LABEL[t] ?? t}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {visibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos registrados todavía.</p>
          ) : (
            <ol className="relative space-y-5 border-l pl-5">
              {visibles.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="text-xs text-muted-foreground">{fechaCorta(e.fecha)}</div>
                  <div className="font-medium">{EVENTO_LABEL[e.tipo_evento] ?? e.tipo_evento}</div>
                  {e.descripcion && <p className="text-sm text-muted-foreground">{e.descripcion}</p>}
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {Object.entries(e.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <RegistrarEventoDialog open={open} onOpenChange={setOpen} animalId={animal.id} onSaved={cargar} />

      <EditarAnimalDialog
        open={editando}
        onOpenChange={setEditando}
        animal={animal}
        lotes={lotes}
        onSaved={cargar}
        onDeleted={() => navigate("/animales")}
      />

      <RegistrarPartoDialog open={parto} onOpenChange={setParto} madreId={animal.id} onSaved={cargar} />

      <AsignarCrotalDialog open={crotalOpen} onOpenChange={setCrotalOpen} animal={animal} onSaved={cargar} />
    </div>
  );
}
