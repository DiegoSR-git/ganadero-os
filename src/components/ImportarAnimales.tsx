import { useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics";
import { AlertTriangle, CheckCircle2, Download, FileUp } from "lucide-react";

type Fila = Record<string, string>;

const CAMPOS = [
  { key: "crotal", label: "Crotal (obligatorio)", req: true },
  { key: "sexo", label: "Sexo (macho/hembra)" },
  { key: "raza", label: "Raza" },
  { key: "fecha_nacimiento", label: "Fecha de nacimiento" },
  { key: "lote", label: "Lote" },
  { key: "peso_actual", label: "Peso (kg)" },
  { key: "observaciones", label: "Observaciones" },
] as const;

const SIN = "__sin__";

function normFecha(v: string): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function normSexo(v: string) {
  const t = (v ?? "").trim().toLowerCase();
  if (["macho", "m", "toro", "novillo", "male"].includes(t)) return "macho";
  if (["hembra", "h", "vaca", "novilla", "female", "f"].includes(t)) return "hembra";
  return null;
}

export default function ImportarAnimales({
  open, onOpenChange, explotacionId, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  explotacionId: string | null;
  onDone: () => void;
}) {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [cols, setCols] = useState<string[]>([]);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<{ creados: number; omitidos: number } | null>(null);
  const [cargando, setCargando] = useState(false);

  const reset = () => {
    setPaso(1); setCols([]); setFilas([]); setMapa({}); setProgreso(0); setResultado(null); setExistentes(new Set());
  };

  const cerrar = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const leerFichero = async (file: File) => {
    setCargando(true);
    try {
      let datos: Fila[] = [];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const texto = await file.text();
        const r = Papa.parse<Fila>(texto, { header: true, skipEmptyLines: true });
        datos = (r.data ?? []).map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k.trim(), String(v ?? "").trim()])));
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf);
        const hoja = wb.Sheets[wb.SheetNames[0]];
        datos = XLSX.utils.sheet_to_json<Fila>(hoja, { defval: "", raw: false })
          .map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [String(k).trim(), String(v ?? "").trim()])));
      }
      if (!datos.length) { toast({ title: "El fichero está vacío", variant: "destructive" }); return; }
      const columnas = Object.keys(datos[0]);
      setCols(columnas);
      setFilas(datos.slice(0, 5000));
      // Mapeo automático por nombre parecido
      const auto: Record<string, string> = {};
      for (const c of CAMPOS) {
        const hit = columnas.find((col) => col.toLowerCase().replace(/[^a-z]/g, "").includes(c.key.replace(/[^a-z]/g, "").slice(0, 5)));
        if (hit) auto[c.key] = hit;
      }
      setMapa(auto);

      const { data: existentesDb } = await supabase
        .from("animales").select("crotal").eq("explotacion_id", explotacionId!).limit(10000);
      setExistentes(new Set((existentesDb ?? []).map((a: any) => String(a.crotal).toLowerCase())));
      setPaso(2);
    } catch (e) {
      toast({ title: "No he podido leer el fichero", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const preparadas = useMemo(() => {
    if (!mapa.crotal) return [];
    const vistos = new Set<string>();
    return filas.map((f, i) => {
      const crotal = String(f[mapa.crotal] ?? "").trim();
      const sexoRaw = mapa.sexo ? String(f[mapa.sexo] ?? "") : "";
      const sexo = normSexo(sexoRaw) ?? "hembra";
      const fecha = mapa.fecha_nacimiento ? normFecha(String(f[mapa.fecha_nacimiento] ?? "")) : null;
      const pesoRaw = mapa.peso_actual ? String(f[mapa.peso_actual] ?? "").replace(",", ".") : "";
      const peso = pesoRaw && isFinite(Number(pesoRaw)) ? Number(pesoRaw) : null;
      const errores: string[] = [];
      if (!crotal) errores.push("Sin crotal");
      if (crotal && vistos.has(crotal.toLowerCase())) errores.push("Repetido en el fichero");
      if (crotal && existentes.has(crotal.toLowerCase())) errores.push("Ya existe en la explotación");
      if (mapa.sexo && sexoRaw && !normSexo(sexoRaw)) errores.push("Sexo no reconocido");
      if (mapa.fecha_nacimiento && String(f[mapa.fecha_nacimiento] ?? "").trim() && !fecha) errores.push("Fecha no válida");
      if (crotal) vistos.add(crotal.toLowerCase());
      return {
        linea: i + 2, crotal, sexo, raza: mapa.raza ? String(f[mapa.raza] ?? "").trim() || null : null,
        fecha_nacimiento: fecha, lote: mapa.lote ? String(f[mapa.lote] ?? "").trim() : "",
        peso_actual: peso, observaciones: mapa.observaciones ? String(f[mapa.observaciones] ?? "").trim() || null : null,
        errores,
      };
    });
  }, [filas, mapa, existentes]);

  const validas = preparadas.filter((p) => !p.errores.length);
  const invalidas = preparadas.filter((p) => p.errores.length);

  const importar = async () => {
    if (!explotacionId || !validas.length) return;
    setPaso(4); setProgreso(0);
    try {
      // Lotes: se reutilizan los existentes y se crean los que falten
      const nombresLote = Array.from(new Set(validas.map((v) => v.lote).filter(Boolean)));
      const loteId: Record<string, string> = {};
      if (nombresLote.length) {
        const { data: lotesDb } = await supabase.from("lotes").select("id, nombre").eq("explotacion_id", explotacionId);
        for (const l of lotesDb ?? []) loteId[String(l.nombre).toLowerCase()] = l.id;
        const faltan = nombresLote.filter((n) => !loteId[n.toLowerCase()]);
        if (faltan.length) {
          const { data: creados } = await supabase.from("lotes")
            .insert(faltan.map((n) => ({ explotacion_id: explotacionId, nombre: n, estado: "activo" })))
            .select("id, nombre");
          for (const l of creados ?? []) loteId[String(l.nombre).toLowerCase()] = l.id;
        }
      }

      const hoy = new Date().toISOString().slice(0, 10);
      const filasDb = validas.map((v) => ({
        explotacion_id: explotacionId,
        crotal: v.crotal,
        especie: "bovino",
        sexo: v.sexo,
        raza: v.raza,
        fecha_nacimiento: v.fecha_nacimiento,
        fecha_alta: hoy,
        lote_id: v.lote ? loteId[v.lote.toLowerCase()] ?? null : null,
        peso_actual: v.peso_actual,
        observaciones: v.observaciones,
        origen: "importado",
        estado: "activo",
        // Clave de idempotencia: reimportar el mismo fichero no crea duplicados
        idempotency_key: `import:${explotacionId}:${v.crotal.toLowerCase()}`,
      }));

      let creados = 0;
      const lote = 100;
      for (let i = 0; i < filasDb.length; i += lote) {
        const trozo = filasDb.slice(i, i + lote);
        const { data, error } = await supabase.from("animales")
          .upsert(trozo, { onConflict: "idempotency_key", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error(error.message);
        creados += data?.length ?? 0;
        setProgreso(Math.round(((i + trozo.length) / filasDb.length) * 100));
      }
      setResultado({ creados, omitidos: preparadas.length - creados });
      track("importacion_animales", { total: preparadas.length, creados }, explotacionId);
      onDone();
    } catch (e) {
      toast({ title: "La importación ha fallado", description: (e as Error).message, variant: "destructive" });
      setPaso(3);
    }
  };

  const descargarPlantilla = () => {
    const csv = "crotal,sexo,raza,fecha_nacimiento,lote,peso_actual,observaciones\nES010203040506,hembra,Limusina,12/03/2021,Lote madres,540,\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "plantilla-animales.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Importar animales</DialogTitle></DialogHeader>

        {paso === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Sube el listado que ya tengas en Excel o CSV. Antes de guardar nada verás una vista previa con los errores.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted/40">
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">{cargando ? "Leyendo el fichero…" : "Pulsa para elegir el fichero"}</span>
              <span className="text-xs text-muted-foreground">Excel (.xlsx) o CSV</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) leerFichero(f); e.target.value = ""; }} />
            </label>
            <Button variant="outline" className="w-full" onClick={descargarPlantilla}>
              <Download className="mr-2 h-4 w-4" /> Descargar plantilla de ejemplo
            </Button>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Dime qué columna de tu fichero corresponde a cada dato.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CAMPOS.map((c) => (
                <div key={c.key} className="space-y-1">
                  <span className="text-xs font-medium">{c.label}</span>
                  <Select value={mapa[c.key] ?? SIN} onValueChange={(v) => setMapa({ ...mapa, [c.key]: v === SIN ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN}>Sin asignar</SelectItem>
                      {cols.map((col) => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPaso(1)}>Atrás</Button>
              <Button className="flex-1" disabled={!mapa.crotal} onClick={() => setPaso(3)}>Ver vista previa</Button>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />{validas.length} listos para importar</Badge>
              {invalidas.length > 0 && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />{invalidas.length} con problemas</Badge>}
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {preparadas.slice(0, 200).map((p) => (
                <Card key={p.linea} className={p.errores.length ? "border-destructive/50" : ""}>
                  <CardContent className="flex items-center justify-between gap-3 p-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{p.crotal || `(línea ${p.linea})`}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {p.sexo} {p.raza ? `· ${p.raza}` : ""} {p.lote ? `· ${p.lote}` : ""} {p.fecha_nacimiento ? `· ${p.fecha_nacimiento}` : ""}
                      </div>
                    </div>
                    {p.errores.length > 0 && <span className="shrink-0 text-xs text-destructive">{p.errores.join(", ")}</span>}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Las filas con problemas se quedan fuera; el resto se importa. Nada se sobrescribe.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPaso(2)}>Atrás</Button>
              <Button className="flex-1" disabled={!validas.length} onClick={importar}>Importar {validas.length} animales</Button>
            </div>
          </div>
        )}

        {paso === 4 && (
          <div className="space-y-4 py-4 text-center">
            {!resultado ? (
              <>
                <p className="text-sm">Importando… no cierres esta ventana.</p>
                <Progress value={progreso} />
              </>
            ) : (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
                <p className="text-sm">
                  Se han añadido <strong>{resultado.creados}</strong> animales.
                  {resultado.omitidos > 0 && <> {resultado.omitidos} se han omitido por estar repetidos o tener errores.</>}
                </p>
                <Button className="w-full" onClick={() => cerrar(false)}>Cerrar</Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
