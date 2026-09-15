import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EVENTO_LABEL, GASTO_LABEL, INGRESO_LABEL } from "@/lib/ganado";

export type UiBlock =
  | { type: "animals"; items: any[] }
  | { type: "incidents"; items: any[] }
  | { type: "treatments"; items: any[] }
  | { type: "events"; items: any[] }
  | { type: "tasks"; items: any[] }
  | { type: "money"; title: string; total: number; breakdown: { label: string; value: number }[] }
  | { type: "summary"; items: { label: string; value: string }[] };

const eur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));
const fecha = (d?: string | null) =>
  d ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(new Date(d + "T00:00:00")) : "—";
const label = (dic: Record<string, string>, k?: string | null) => (k ? dic[k] ?? k : "—");

export function AsistenteBloques({ blocks }: { blocks: UiBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-3 space-y-3">
      {blocks.map((b, i) => (
        <div key={i}>{renderBlock(b)}</div>
      ))}
    </div>
  );
}

function renderBlock(b: UiBlock) {
  switch (b.type) {
    case "animals":
      if (!b.items?.length) return null;
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {b.items.slice(0, 12).map((a: any) => (
            <div key={a.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">{a.crotal}</div>
                <Badge variant="secondary" className="shrink-0">{a.sexo === "macho" ? "Macho" : "Hembra"}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {[a.raza, a.lotes?.nombre, a.peso_actual ? `${a.peso_actual} kg` : null, a.ultimo_pesaje ? `pesado ${fecha(a.ultimo_pesaje)}` : null]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos adicionales"}
              </div>
              <Button asChild size="sm" variant="outline" className="mt-2 h-7">
                <Link to={`/animales/${a.id}`}>Ver animal</Link>
              </Button>
            </div>
          ))}
        </div>
      );
    case "incidents":
    case "treatments":
      if (!b.items?.length) return null;
      return (
        <div className="space-y-2">
          {b.items.slice(0, 12).map((x: any) => (
            <div key={x.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{x.crotal ?? "Sin animal"}</span>
                <span className="text-xs text-muted-foreground">{fecha(x.fecha)}</span>
              </div>
              <div className="text-sm">{x.descripcion ?? "—"}</div>
              {x.animal_id && (
                <Button asChild size="sm" variant="outline" className="mt-2 h-7">
                  <Link to={`/animales/${x.animal_id}`}>Ver animal</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      );
    case "events":
      if (!b.items?.length) return null;
      return (
        <div className="space-y-2">
          {b.items.slice(0, 15).map((e: any) => (
            <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3">
              <div>
                <div className="text-sm font-semibold">{label(EVENTO_LABEL, e.tipo_evento)}{e.crotal ? ` · ${e.crotal}` : ""}</div>
                <div className="text-xs text-muted-foreground">{e.descripcion ?? "—"}</div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{fecha(e.fecha)}</span>
            </div>
          ))}
        </div>
      );
    case "tasks":
      if (!b.items?.length) return null;
      return (
        <div className="space-y-2">
          {b.items.slice(0, 12).map((t: any) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <div className="text-sm font-medium">{t.titulo}</div>
              <span className="text-xs text-muted-foreground">{fecha(t.fecha_limite)}</span>
            </div>
          ))}
          <Button asChild size="sm" variant="outline" className="h-7">
            <Link to="/tareas">Ver tareas</Link>
          </Button>
        </div>
      );
    case "money":
      return (
        <div className="rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">{b.title}</div>
          <div className="text-2xl font-bold text-primary">{eur(b.total)}</div>
          <div className="mt-2 space-y-1">
            {b.breakdown.slice(0, 6).map((x) => (
              <div key={x.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label({ ...GASTO_LABEL, ...INGRESO_LABEL }, x.label)}</span>
                <span className="font-medium">{eur(x.value)}</span>
              </div>
            ))}
          </div>
          <Button asChild size="sm" variant="outline" className="mt-3 h-7">
            <Link to="/economia">Ver economía</Link>
          </Button>
        </div>
      );
    case "summary":
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {b.items.map((x) => (
            <div key={x.label} className="rounded-xl border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.label}</div>
              <div className="text-lg font-bold">{x.value}</div>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}
