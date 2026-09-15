// Motor de intenciones de GanaderOS.
// Único orquestador para app (texto/voz/foto) y WhatsApp.
// Reglas: el modelo NUNCA genera SQL. Sólo puede llamar a las tools de abajo,
// y toda tool recibe la explotación derivada del servidor (nunca del texto del usuario).

export type AiCtx = {
  sb: any;
  explotacionId: string;
  userId: string | null;
  canal: string;
  /** Identificador estable de la petición (id de mensaje de WhatsApp, id de confirmación en la app).
   *  Garantiza que un reintento o un webhook repetido no dupliquen la escritura. */
  requestKey?: string | null;
};

export type UiBlock =
  | { type: "animals"; items: any[] }
  | { type: "incidents"; items: any[] }
  | { type: "treatments"; items: any[] }
  | { type: "events"; items: any[] }
  | { type: "tasks"; items: any[] }
  | { type: "money"; title: string; total: number; breakdown: { label: string; value: number }[] }
  | { type: "summary"; items: { label: string; value: string }[] };

export type Proposal = {
  /** Identidad de la propuesta. Confirmar dos veces la MISMA propuesta ejecuta una sola operación. */
  id?: string;
  tool: string;
  args: Record<string, unknown>;
  titulo: string;
  detalles: { label: string; value: string }[];
};

const GEMINI_GATEWAY = Deno.env.get("GANADERO_AI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta/openai";
const GROQ_GATEWAY = Deno.env.get("GANADERO_STT_BASE_URL") ?? "https://api.groq.com/openai/v1";
const MODEL_CHAT = Deno.env.get("GANADERO_AI_MODEL") ?? "gemini-3.8-flash";
const MODEL_VISION = Deno.env.get("GANADERO_AI_VISION_MODEL") ?? "gemini-3.8-flash";
const MODEL_STT = Deno.env.get("GANADERO_AI_STT_MODEL") ?? "whisper-large-v3-turbo";

export const AI_MODELS = { chat: MODEL_CHAT, vision: MODEL_VISION, stt: MODEL_STT };

function geminiApiKey() {
  const k = Deno.env.get("GEMINI_API_KEY");
  if (!k) throw new Error("GEMINI_API_KEY no configurada");
  return k;
}

function groqApiKey() {
  const k = Deno.env.get("GROQ_API_KEY");
  if (!k) throw new Error("GROQ_API_KEY no configurada");
  return k;
}


export function hoyMadrid(): string {
  return new Date(Date.now() + 2 * 3600_000).toISOString().slice(0, 10);
}
function addDays(iso: string, d: number) {
  const dt = new Date(iso + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + d);
  return dt.toISOString().slice(0, 10);
}
const eur = (n: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));
const fechaES = (d?: string | null) =>
  d ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d + "T00:00:00Z")) : "—";

const CATEGORIAS_GASTO = [
  "alimentacion", "veterinario", "medicamentos", "combustible", "maquinaria", "reparaciones",
  "seguros", "personal", "suministros", "transporte", "compra_animales", "instalaciones", "otros",
];
const CATEGORIAS_INGRESO = ["venta_animales", "subvenciones", "seguros", "otros"];
const TIPOS_EVENTO = [
  "nacimiento", "alta", "baja", "parto", "aborto", "cubricion", "inseminacion", "gestacion",
  "tratamiento", "vacuna", "incidencia", "movimiento", "pesaje", "revision", "compra", "venta",
  "cambio_lote", "cambio_parcela", "observacion",
];

// ---------- helpers de datos ----------

export async function resolverAnimales(ctx: AiCtx, ref: string) {
  const digits = String(ref ?? "").replace(/\D/g, "");
  if (!digits) return [];
  const { data } = await ctx.sb
    .from("animales")
    .select("id, crotal, sexo, raza, estado, estado_reproductivo, fecha_nacimiento, peso_actual, lote_id")
    .eq("explotacion_id", ctx.explotacionId)
    .ilike("crotal", `%${digits}`)
    .limit(10);
  let list = data ?? [];
  if (!list.length) {
    const r2 = await ctx.sb
      .from("animales")
      .select("id, crotal, sexo, raza, estado, estado_reproductivo, fecha_nacimiento, peso_actual, lote_id")
      .eq("explotacion_id", ctx.explotacionId)
      .ilike("crotal", `%${digits}%`)
      .limit(10);
    list = r2.data ?? [];
  }
  return list;
}

async function unicoAnimal(ctx: AiCtx, ref: string) {
  const list = await resolverAnimales(ctx, ref);
  if (!list.length) return { error: `No encuentro ningún animal cuyo crotal acabe en ${ref} en tu explotación.` };
  if (list.length > 1) {
    return {
      error: `He encontrado ${list.length} animales que coinciden con ${ref}: ${list.map((a: any) => a.crotal).join(", ")}. Pregunta al usuario cuál es, sin elegir tú.`,
      opciones: list,
    };
  }
  return { animal: list[0] };
}

async function resolverLote(ctx: AiCtx, nombre: string) {
  const { data } = await ctx.sb
    .from("lotes").select("id, nombre")
    .eq("explotacion_id", ctx.explotacionId)
    .ilike("nombre", `%${String(nombre ?? "").trim()}%`)
    .limit(5);
  return data ?? [];
}

// ---------- definición de tools ----------

type Tool = {
  name: string;
  description: string;
  write?: boolean;
  parameters: Record<string, unknown>;
  run?: (ctx: AiCtx, a: any) => Promise<{ result: any; ui?: UiBlock }>;
  prepare?: (ctx: AiCtx, a: any) => Promise<{ error?: string; proposal?: Proposal; result?: any }>;
  /** `key` es la clave de idempotencia ya reclamada: se propaga a la base de datos. */
  execute?: (ctx: AiCtx, a: any, key: string) => Promise<{ ok: boolean; message: string; data?: any }>;
};

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties: props, required, additionalProperties: false,
});
const S = (description: string) => ({ type: "string", description });
const N = (description: string) => ({ type: "number", description });

export const TOOLS: Tool[] = [
  // ============ LECTURA ============
  {
    name: "get_explotacion_summary",
    description: "Resumen real de la explotación en un mes: animales, partos, incidencias, tratamientos, tareas, gastos e ingresos.",
    parameters: obj({ mes: S("Mes en formato YYYY-MM. Por defecto el mes actual.") }),
    run: async (ctx, a) => {
      const mes = /^\d{4}-\d{2}$/.test(a?.mes ?? "") ? a.mes : hoyMadrid().slice(0, 7);
      const ini = `${mes}-01`;
      const fin = addDays(`${mes}-01`, 31).slice(0, 8) + "01";
      const q = ctx.sb;
      const [animales, partos, inc, trat, tareas, gastos, ingresos] = await Promise.all([
        q.from("animales").select("id, sexo, fecha_nacimiento", { count: "exact" }).eq("explotacion_id", ctx.explotacionId).eq("estado", "activo"),
        q.from("eventos_animales").select("id", { count: "exact", head: true }).eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "parto").gte("fecha", ini).lt("fecha", fin),
        q.from("eventos_animales").select("id", { count: "exact", head: true }).eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "incidencia").eq("estado", "abierto"),
        q.from("eventos_animales").select("id", { count: "exact", head: true }).eq("explotacion_id", ctx.explotacionId).in("tipo_evento", ["tratamiento"]).eq("estado", "activo"),
        q.from("tareas").select("id", { count: "exact", head: true }).eq("explotacion_id", ctx.explotacionId).eq("estado", "pendiente"),
        q.from("expenses").select("total, categoria").eq("explotacion_id", ctx.explotacionId).gte("fecha", ini).lt("fecha", fin),
        q.from("ingresos").select("importe, categoria").eq("explotacion_id", ctx.explotacionId).gte("fecha", ini).lt("fecha", fin),
      ]);
      const g = (gastos.data ?? []).reduce((s: number, x: any) => s + Number(x.total ?? 0), 0);
      const i = (ingresos.data ?? []).reduce((s: number, x: any) => s + Number(x.importe ?? 0), 0);
      const result = {
        mes,
        animales_activos: animales.count ?? (animales.data ?? []).length,
        partos_mes: partos.count ?? 0,
        incidencias_abiertas: inc.count ?? 0,
        tratamientos_activos: trat.count ?? 0,
        tareas_pendientes: tareas.count ?? 0,
        gastos_mes: Math.round(g * 100) / 100,
        ingresos_mes: Math.round(i * 100) / 100,
        balance: Math.round((i - g) * 100) / 100,
      };
      return {
        result,
        ui: {
          type: "summary",
          items: [
            { label: "Animales activos", value: String(result.animales_activos) },
            { label: "Partos del mes", value: String(result.partos_mes) },
            { label: "Incidencias abiertas", value: String(result.incidencias_abiertas) },
            { label: "Tratamientos activos", value: String(result.tratamientos_activos) },
            { label: "Tareas pendientes", value: String(result.tareas_pendientes) },
            { label: "Gastos", value: eur(result.gastos_mes) },
            { label: "Ingresos", value: eur(result.ingresos_mes) },
            { label: "Balance", value: eur(result.balance) },
          ],
        },
      };
    },
  },
  {
    name: "get_attention",
    description: "Qué necesita atención hoy: incidencias abiertas, tratamientos activos, tareas vencidas y pendientes.",
    parameters: obj({}),
    run: async (ctx) => {
      const hoy = hoyMadrid();
      const [inc, trat, tareas] = await Promise.all([
        ctx.sb.from("eventos_animales").select("id, fecha, descripcion, animal_id, animales(crotal)").eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "incidencia").eq("estado", "abierto").order("fecha", { ascending: true }).limit(10),
        ctx.sb.from("eventos_animales").select("id, fecha, descripcion, animal_id, animales(crotal)").eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "tratamiento").eq("estado", "activo").order("fecha", { ascending: false }).limit(10),
        ctx.sb.from("tareas").select("id, titulo, fecha_limite, prioridad").eq("explotacion_id", ctx.explotacionId).eq("estado", "pendiente").order("fecha_limite", { ascending: true }).limit(10),
      ]);
      const tareasList = tareas.data ?? [];
      return {
        result: {
          incidencias_abiertas: (inc.data ?? []).map((x: any) => ({ id: x.id, crotal: x.animales?.crotal ?? null, fecha: x.fecha, descripcion: x.descripcion })),
          tratamientos_activos: (trat.data ?? []).map((x: any) => ({ id: x.id, crotal: x.animales?.crotal ?? null, fecha: x.fecha, descripcion: x.descripcion })),
          tareas_pendientes: tareasList,
          tareas_vencidas: tareasList.filter((t: any) => t.fecha_limite && t.fecha_limite < hoy),
        },
        ui: {
          type: "incidents",
          items: (inc.data ?? []).map((x: any) => ({ id: x.id, animal_id: x.animal_id, crotal: x.animales?.crotal, fecha: x.fecha, descripcion: x.descripcion, estado: "abierto" })),
        },
      };
    },
  },
  {
    name: "find_animal_by_crotal",
    description: "Busca animales por crotal completo o por los últimos dígitos. Devuelve todas las coincidencias; nunca elijas tú si hay varias.",
    parameters: obj({ crotal: S("Dígitos del crotal, completos o finales") }, ["crotal"]),
    run: async (ctx, a) => {
      const list = await resolverAnimales(ctx, a.crotal);
      return { result: { coincidencias: list.length, animales: list }, ui: { type: "animals", items: list } };
    },
  },
  {
    name: "search_animals",
    description: "Busca animales con filtros reales: sexo, estado, estado reproductivo, raza, lote, categoría (vaca/ternero/novilla/toro).",
    parameters: obj({
      sexo: S("macho | hembra"),
      estado: S("activo | baja"),
      estado_reproductivo: S("vacia | gestante | lactante | ..."),
      raza: S("Raza, coincidencia parcial"),
      lote: S("Nombre del lote"),
      categoria: S("vaca | novilla | ternero | toro"),
      limit: N("Máximo de resultados (por defecto 25)"),
    }),
    run: async (ctx, a) => {
      let q = ctx.sb.from("animales")
        .select("id, crotal, sexo, raza, estado, estado_reproductivo, fecha_nacimiento, peso_actual, lote_id, lotes(nombre)")
        .eq("explotacion_id", ctx.explotacionId);
      q = q.eq("estado", a?.estado || "activo");
      if (a?.sexo) q = q.eq("sexo", a.sexo);
      if (a?.estado_reproductivo) q = q.eq("estado_reproductivo", a.estado_reproductivo);
      if (a?.raza) q = q.ilike("raza", `%${a.raza}%`);
      if (a?.lote) {
        const lotes = await resolverLote(ctx, a.lote);
        if (lotes.length) q = q.in("lote_id", lotes.map((l: any) => l.id));
      }
      const { data } = await q.limit(Math.min(Number(a?.limit ?? 25), 100));
      let list = data ?? [];
      const hoy = hoyMadrid();
      const mesesDe = (f?: string | null) => (f ? (new Date(hoy).getTime() - new Date(f).getTime()) / (1000 * 3600 * 24 * 30.4) : null);
      if (a?.categoria) {
        const c = String(a.categoria).toLowerCase();
        list = list.filter((x: any) => {
          const m = mesesDe(x.fecha_nacimiento);
          if (c === "ternero") return m !== null && m < 12;
          if (c === "novilla") return x.sexo === "hembra" && m !== null && m >= 12 && m < 30;
          if (c === "vaca") return x.sexo === "hembra" && (m === null || m >= 30);
          if (c === "toro") return x.sexo === "macho" && (m === null || m >= 24);
          return true;
        });
      }
      return { result: { total: list.length, animales: list.slice(0, 25) }, ui: { type: "animals", items: list.slice(0, 25) } };
    },
  },
  {
    name: "get_animal_details",
    description: "Ficha completa de un animal identificado por crotal (completo o final).",
    parameters: obj({ crotal: S("Crotal o últimos dígitos") }, ["crotal"]),
    run: async (ctx, a) => {
      const r = await unicoAnimal(ctx, a.crotal);
      if (r.error) return { result: { error: r.error, opciones: r.opciones ?? [] } };
      const animal = r.animal!;
      const [ev, hijos] = await Promise.all([
        ctx.sb.from("eventos_animales").select("tipo_evento, fecha, descripcion, estado").eq("animal_id", animal.id).order("fecha", { ascending: false }).limit(10),
        ctx.sb.from("animales").select("id, crotal, sexo, fecha_nacimiento").or(`madre_id.eq.${animal.id},padre_id.eq.${animal.id}`).limit(20),
      ]);
      return {
        result: { animal, ultimos_eventos: ev.data ?? [], descendencia: hijos.data ?? [] },
        ui: { type: "animals", items: [animal] },
      };
    },
  },
  {
    name: "get_animal_events",
    description: "Historial de eventos de un animal.",
    parameters: obj({ crotal: S("Crotal o últimos dígitos"), tipo_evento: S("Filtrar por tipo"), limit: N("Máximo") }, ["crotal"]),
    run: async (ctx, a) => {
      const r = await unicoAnimal(ctx, a.crotal);
      if (r.error) return { result: { error: r.error, opciones: r.opciones ?? [] } };
      let q = ctx.sb.from("eventos_animales").select("id, tipo_evento, fecha, descripcion, estado, metadata").eq("animal_id", r.animal!.id).order("fecha", { ascending: false });
      if (a?.tipo_evento) q = q.eq("tipo_evento", a.tipo_evento);
      const { data } = await q.limit(Math.min(Number(a?.limit ?? 15), 50));
      return { result: { crotal: r.animal!.crotal, eventos: data ?? [] }, ui: { type: "events", items: (data ?? []).map((e: any) => ({ ...e, crotal: r.animal!.crotal, animal_id: r.animal!.id })) } };
    },
  },
  {
    name: "get_open_incidents",
    description: "Animales con incidencias abiertas.",
    parameters: obj({}),
    run: async (ctx) => {
      const { data } = await ctx.sb.from("eventos_animales")
        .select("id, fecha, descripcion, animal_id, animales(crotal)")
        .eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "incidencia").eq("estado", "abierto")
        .order("fecha", { ascending: false }).limit(30);
      const items = (data ?? []).map((x: any) => ({ id: x.id, animal_id: x.animal_id, crotal: x.animales?.crotal, fecha: x.fecha, descripcion: x.descripcion, estado: "abierto" }));
      return { result: { total: items.length, incidencias: items }, ui: { type: "incidents", items } };
    },
  },
  {
    name: "get_active_treatments",
    description: "Tratamientos activos en la explotación.",
    parameters: obj({}),
    run: async (ctx) => {
      const { data } = await ctx.sb.from("eventos_animales")
        .select("id, fecha, descripcion, metadata, animal_id, animales(crotal)")
        .eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "tratamiento").eq("estado", "activo")
        .order("fecha", { ascending: false }).limit(30);
      const items = (data ?? []).map((x: any) => ({ id: x.id, animal_id: x.animal_id, crotal: x.animales?.crotal, fecha: x.fecha, descripcion: x.descripcion, metadata: x.metadata }));
      return { result: { total: items.length, tratamientos: items }, ui: { type: "treatments", items } };
    },
  },
  {
    name: "get_recent_births",
    description: "Partos registrados en un periodo (por defecto el mes en curso).",
    parameters: obj({ desde: S("Fecha YYYY-MM-DD"), hasta: S("Fecha YYYY-MM-DD") }),
    run: async (ctx, a) => {
      const hoy = hoyMadrid();
      const desde = a?.desde || hoy.slice(0, 7) + "-01";
      const hasta = a?.hasta || hoy;
      const { data } = await ctx.sb.from("eventos_animales")
        .select("id, fecha, descripcion, metadata, animal_id, animales(crotal)")
        .eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "parto")
        .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).limit(50);
      const items = (data ?? []).map((x: any) => ({ id: x.id, animal_id: x.animal_id, crotal: x.animales?.crotal, fecha: x.fecha, descripcion: x.descripcion, metadata: x.metadata }));
      return { result: { desde, hasta, total: items.length, partos: items }, ui: { type: "events", items: items.map((i: any) => ({ ...i, tipo_evento: "parto" })) } };
    },
  },
  {
    name: "get_expenses",
    description: "Gastos reales por periodo y categoría, con desglose.",
    parameters: obj({ desde: S("YYYY-MM-DD"), hasta: S("YYYY-MM-DD"), categoria: S("Categoría de gasto") }),
    run: async (ctx, a) => {
      const hoy = hoyMadrid();
      const desde = a?.desde || hoy.slice(0, 7) + "-01";
      const hasta = a?.hasta || hoy;
      let q = ctx.sb.from("expenses").select("fecha, concepto, proveedor, categoria, total").eq("explotacion_id", ctx.explotacionId).gte("fecha", desde).lte("fecha", hasta);
      if (a?.categoria) q = q.eq("categoria", a.categoria);
      const { data } = await q.order("fecha", { ascending: false }).limit(200);
      const list = data ?? [];
      const total = list.reduce((s: number, x: any) => s + Number(x.total ?? 0), 0);
      const porCat: Record<string, number> = {};
      for (const x of list) porCat[x.categoria] = (porCat[x.categoria] ?? 0) + Number(x.total ?? 0);
      const breakdown = Object.entries(porCat).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((x, y) => y.value - x.value);
      return {
        result: { desde, hasta, total: Math.round(total * 100) / 100, por_categoria: breakdown, n_apuntes: list.length },
        ui: { type: "money", title: `Gastos ${fechaES(desde)} – ${fechaES(hasta)}`, total: Math.round(total * 100) / 100, breakdown },
      };
    },
  },
  {
    name: "get_income",
    description: "Ingresos reales por periodo y categoría, con desglose.",
    parameters: obj({ desde: S("YYYY-MM-DD"), hasta: S("YYYY-MM-DD"), categoria: S("Categoría de ingreso") }),
    run: async (ctx, a) => {
      const hoy = hoyMadrid();
      const desde = a?.desde || hoy.slice(0, 7) + "-01";
      const hasta = a?.hasta || hoy;
      let q = ctx.sb.from("ingresos").select("fecha, concepto, categoria, importe, cliente").eq("explotacion_id", ctx.explotacionId).gte("fecha", desde).lte("fecha", hasta);
      if (a?.categoria) q = q.eq("categoria", a.categoria);
      const { data } = await q.order("fecha", { ascending: false }).limit(200);
      const list = data ?? [];
      const total = list.reduce((s: number, x: any) => s + Number(x.importe ?? 0), 0);
      const porCat: Record<string, number> = {};
      for (const x of list) porCat[x.categoria] = (porCat[x.categoria] ?? 0) + Number(x.importe ?? 0);
      const breakdown = Object.entries(porCat).map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 })).sort((x, y) => y.value - x.value);
      return {
        result: { desde, hasta, total: Math.round(total * 100) / 100, por_categoria: breakdown, n_apuntes: list.length },
        ui: { type: "money", title: `Ingresos ${fechaES(desde)} – ${fechaES(hasta)}`, total: Math.round(total * 100) / 100, breakdown },
      };
    },
  },
  {
    name: "get_tasks",
    description: "Tareas de la explotación.",
    parameters: obj({ estado: S("pendiente | hecha") }),
    run: async (ctx, a) => {
      const { data } = await ctx.sb.from("tareas")
        .select("id, titulo, descripcion, fecha_limite, prioridad, estado")
        .eq("explotacion_id", ctx.explotacionId).eq("estado", a?.estado || "pendiente")
        .order("fecha_limite", { ascending: true }).limit(50);
      return { result: { total: (data ?? []).length, tareas: data ?? [] }, ui: { type: "tasks", items: data ?? [] } };
    },
  },
  {
    name: "get_lotes",
    description: "Lotes de la explotación con su número de animales.",
    parameters: obj({}),
    run: async (ctx) => {
      const { data } = await ctx.sb.from("lotes").select("id, nombre, descripcion, estado").eq("explotacion_id", ctx.explotacionId).limit(50);
      const lotes = data ?? [];
      const { data: animales } = await ctx.sb.from("animales").select("lote_id").eq("explotacion_id", ctx.explotacionId).eq("estado", "activo");
      const counts: Record<string, number> = {};
      for (const a of animales ?? []) if (a.lote_id) counts[a.lote_id] = (counts[a.lote_id] ?? 0) + 1;
      return { result: { lotes: lotes.map((l: any) => ({ ...l, animales: counts[l.id] ?? 0 })) } };
    },
  },
  {
    name: "get_animals_without_weighing",
    description: "Animales que llevan más tiempo sin pesarse.",
    parameters: obj({ limit: N("Máximo de resultados") }),
    run: async (ctx, a) => {
      const { data: animales } = await ctx.sb.from("animales").select("id, crotal, sexo, raza, peso_actual").eq("explotacion_id", ctx.explotacionId).eq("estado", "activo").limit(500);
      const { data: pesajes } = await ctx.sb.from("eventos_animales").select("animal_id, fecha").eq("explotacion_id", ctx.explotacionId).eq("tipo_evento", "pesaje").order("fecha", { ascending: false }).limit(2000);
      const last: Record<string, string> = {};
      for (const p of pesajes ?? []) if (p.animal_id && !last[p.animal_id]) last[p.animal_id] = p.fecha;
      const items = (animales ?? []).map((x: any) => ({ ...x, ultimo_pesaje: last[x.id] ?? null }))
        .sort((x: any, y: any) => (x.ultimo_pesaje ?? "0000") < (y.ultimo_pesaje ?? "0000") ? -1 : 1)
        .slice(0, Math.min(Number(a?.limit ?? 15), 50));
      return { result: { animales: items }, ui: { type: "animals", items } };
    },
  },

  // ============ ESCRITURA (siempre con confirmación) ============
  {
    name: "create_birth_event",
    description: "Registrar un parto. Necesita el crotal de la madre y el sexo de la cría; si el usuario no lo ha dicho, pregúntaselo antes.",
    write: true,
    parameters: obj({
      crotal_madre: S("Crotal de la madre o últimos dígitos"),
      sexo_cria: S("macho | hembra"),
      fecha: S("YYYY-MM-DD, por defecto hoy"),
      crotal_cria: S("Crotal de la cría si se conoce"),
      observaciones: S("Notas"),
    }, ["crotal_madre", "sexo_cria"]),
    prepare: async (ctx, a) => {
      const r = await unicoAnimal(ctx, a.crotal_madre);
      if (r.error) return { error: r.error };
      const sexo = String(a.sexo_cria ?? "").toLowerCase();
      if (!["macho", "hembra"].includes(sexo)) return { error: "Falta el sexo de la cría (macho o hembra). Pregúntaselo al usuario." };
      const fecha = a.fecha || hoyMadrid();
      return {
        proposal: {
          tool: "create_birth_event",
          args: { animal_id: r.animal!.id, crotal: r.animal!.crotal, sexo_cria: sexo, fecha, crotal_cria: a.crotal_cria ?? null, observaciones: a.observaciones ?? null },
          titulo: "Registrar parto",
          detalles: [
            { label: "Madre", value: r.animal!.crotal },
            { label: "Cría", value: sexo === "macho" ? "Macho" : "Hembra" },
            ...(a.crotal_cria ? [{ label: "Crotal de la cría", value: String(a.crotal_cria) }] : []),
            { label: "Fecha", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      // Misma lógica de dominio que la web: evento + cría + relación madre/cría + lote + tarea,
      // todo dentro de una única transacción de PostgreSQL.
      const sexo = String(a.sexo_cria ?? "").toLowerCase();
      if (!["macho", "hembra"].includes(sexo)) return { ok: false, message: "Sexo de la cría no válido." };
      const { data, error } = await ctx.sb.rpc("registrar_parto", {
        _madre_id: a.animal_id,
        _fecha: a.fecha,
        _crias: [{ sexo, estado: "vivo", crotal: a.crotal_cria ?? null }],
        _padre_id: null,
        _dificultad: null,
        _observaciones: a.observaciones ?? null,
        _idempotency_key: key,
        _origen: ctx.canal,
      });
      if (error) return { ok: false, message: error.message };
      if (data?.duplicado) return { ok: true, message: "Ese parto ya estaba registrado, no lo he duplicado.", data };
      const crias = (data?.crias ?? []) as any[];
      const detalle = crias.length ? ` Cría registrada como ${crias.map((c: any) => c.crotal).join(", ")}.` : "";
      return { ok: true, message: `Parto registrado en ${a.crotal}.${detalle}`, data };
    },
  },
  {
    name: "create_incident",
    description: "Registrar una incidencia abierta (cojera, mastitis, animal decaído...). Necesita crotal y descripción.",
    write: true,
    parameters: obj({ crotal: S("Crotal o últimos dígitos"), descripcion: S("Qué le pasa al animal"), fecha: S("YYYY-MM-DD, desde cuándo") }, ["crotal", "descripcion"]),
    prepare: async (ctx, a) => {
      const r = await unicoAnimal(ctx, a.crotal);
      if (r.error) return { error: r.error };
      if (!String(a.descripcion ?? "").trim()) return { error: "Falta describir la incidencia. Pregúntaselo al usuario." };
      const fecha = a.fecha || hoyMadrid();
      return {
        proposal: {
          tool: "create_incident",
          args: { animal_id: r.animal!.id, crotal: r.animal!.crotal, descripcion: a.descripcion, fecha },
          titulo: "Registrar incidencia",
          detalles: [
            { label: "Animal", value: r.animal!.crotal },
            { label: "Incidencia", value: a.descripcion },
            { label: "Desde", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      if (!String(a.descripcion ?? "").trim()) return { ok: false, message: "Falta la descripción de la incidencia." };
      const { data, error } = await ctx.sb.rpc("registrar_evento_animal", {
        _explotacion_id: ctx.explotacionId, _tipo_evento: "incidencia", _fecha: a.fecha,
        _animal_id: a.animal_id, _descripcion: a.descripcion, _idempotency_key: key, _origen: ctx.canal,
      });
      if (error) return { ok: false, message: error.message };
      if (data?.duplicado) return { ok: true, message: "Esa incidencia ya estaba registrada.", data };
      return { ok: true, message: `Incidencia abierta en ${a.crotal}.`, data };
    },
  },
  {
    name: "create_treatment",
    description: "Registrar un tratamiento o vacuna. Nunca inventes medicamento, dosis ni duración: si faltan, pregúntalos.",
    write: true,
    parameters: obj({
      crotal: S("Crotal o últimos dígitos"), producto: S("Medicamento o vacuna"), dosis: S("Dosis"),
      duracion: S("Duración o pauta"), fecha: S("YYYY-MM-DD"), es_vacuna: { type: "boolean", description: "true si es vacuna" },
    }, ["crotal", "producto"]),
    prepare: async (ctx, a) => {
      const r = await unicoAnimal(ctx, a.crotal);
      if (r.error) return { error: r.error };
      if (!String(a.producto ?? "").trim()) return { error: "Falta saber qué tratamiento es. Pregúntaselo al usuario, no lo inventes." };
      const fecha = a.fecha || hoyMadrid();
      return {
        proposal: {
          tool: "create_treatment",
          args: { animal_id: r.animal!.id, crotal: r.animal!.crotal, producto: a.producto, dosis: a.dosis ?? null, duracion: a.duracion ?? null, fecha, es_vacuna: !!a.es_vacuna },
          titulo: a.es_vacuna ? "Registrar vacuna" : "Registrar tratamiento",
          detalles: [
            { label: "Animal", value: r.animal!.crotal },
            { label: "Producto", value: a.producto },
            ...(a.dosis ? [{ label: "Dosis", value: String(a.dosis) }] : []),
            ...(a.duracion ? [{ label: "Pauta", value: String(a.duracion) }] : []),
            { label: "Fecha", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      if (!String(a.producto ?? "").trim()) return { ok: false, message: "Falta el producto del tratamiento." };
      const { data, error } = await ctx.sb.rpc("registrar_evento_animal", {
        _explotacion_id: ctx.explotacionId, _tipo_evento: a.es_vacuna ? "vacuna" : "tratamiento", _fecha: a.fecha,
        _animal_id: a.animal_id,
        _descripcion: [a.producto, a.dosis, a.duracion].filter(Boolean).join(" · "),
        _metadata: { producto: a.producto, dosis: a.dosis ?? null, duracion: a.duracion ?? null },
        _idempotency_key: key, _origen: ctx.canal,
      });
      if (error) return { ok: false, message: error.message };
      if (data?.duplicado) return { ok: true, message: "Ese tratamiento ya estaba registrado.", data };
      return { ok: true, message: `Tratamiento registrado en ${a.crotal}.`, data };
    },
  },
  {
    name: "create_weight_event",
    description: "Registrar un pesaje y actualizar el peso del animal.",
    write: true,
    parameters: obj({ crotal: S("Crotal o últimos dígitos"), peso: N("Peso en kilos"), fecha: S("YYYY-MM-DD") }, ["crotal", "peso"]),
    prepare: async (ctx, a) => {
      const r = await unicoAnimal(ctx, a.crotal);
      if (r.error) return { error: r.error };
      const peso = Number(a.peso);
      if (!isFinite(peso) || peso <= 0 || peso > 2000) return { error: "El peso indicado no es válido. Pregúntaselo al usuario." };
      const fecha = a.fecha || hoyMadrid();
      return {
        proposal: {
          tool: "create_weight_event",
          args: { animal_id: r.animal!.id, crotal: r.animal!.crotal, peso, fecha },
          titulo: "Registrar pesaje",
          detalles: [
            { label: "Animal", value: r.animal!.crotal },
            { label: "Peso", value: `${peso} kg` },
            { label: "Fecha", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      // Revalidación en servidor: el cliente podría manipular la propuesta antes de confirmarla.
      const peso = Number(a.peso);
      if (!isFinite(peso) || peso <= 0 || peso > 2000) return { ok: false, message: "Peso no válido." };
      const { data, error } = await ctx.sb.rpc("registrar_evento_animal", {
        _explotacion_id: ctx.explotacionId, _tipo_evento: "pesaje", _fecha: a.fecha,
        _animal_id: a.animal_id, _descripcion: `${peso} kg`, _peso: peso,
        _idempotency_key: key, _origen: ctx.canal,
      });
      if (error) return { ok: false, message: error.message };
      if (data?.duplicado) return { ok: true, message: "Ese pesaje ya estaba registrado.", data };
      return { ok: true, message: `Pesaje de ${peso} kg registrado en ${a.crotal}.`, data };
    },
  },
  {
    name: "create_animal_event",
    description: "Registrar cualquier otro evento del animal (observación, movimiento, revisión, cubrición, compra, venta...).",
    write: true,
    parameters: obj({
      crotal: S("Crotal o últimos dígitos"),
      tipo_evento: S(`Uno de: ${TIPOS_EVENTO.join(", ")}`),
      descripcion: S("Descripción"), fecha: S("YYYY-MM-DD"),
    }, ["crotal", "tipo_evento"]),
    prepare: async (ctx, a) => {
      const r = await unicoAnimal(ctx, a.crotal);
      if (r.error) return { error: r.error };
      const tipo = String(a.tipo_evento ?? "").toLowerCase();
      if (!TIPOS_EVENTO.includes(tipo)) return { error: `Tipo de evento no válido. Usa uno de: ${TIPOS_EVENTO.join(", ")}` };
      const fecha = a.fecha || hoyMadrid();
      return {
        proposal: {
          tool: "create_animal_event",
          args: { animal_id: r.animal!.id, crotal: r.animal!.crotal, tipo_evento: tipo, descripcion: a.descripcion ?? null, fecha },
          titulo: "Registrar evento",
          detalles: [
            { label: "Animal", value: r.animal!.crotal },
            { label: "Evento", value: tipo },
            ...(a.descripcion ? [{ label: "Detalle", value: String(a.descripcion) }] : []),
            { label: "Fecha", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      const tipo = String(a.tipo_evento ?? "").toLowerCase();
      if (!TIPOS_EVENTO.includes(tipo)) return { ok: false, message: "Tipo de evento no válido." };
      if (tipo === "parto") return { ok: false, message: "Para un parto usa el registro de parto, que crea también la cría." };
      const { data, error } = await ctx.sb.rpc("registrar_evento_animal", {
        _explotacion_id: ctx.explotacionId, _tipo_evento: tipo, _fecha: a.fecha,
        _animal_id: a.animal_id, _descripcion: a.descripcion ?? null,
        _idempotency_key: key, _origen: ctx.canal,
      });
      if (error) return { ok: false, message: error.message };
      if (data?.duplicado) return { ok: true, message: "Ese registro ya existía, no lo he duplicado.", data };
      return { ok: true, message: `Evento registrado en ${a.crotal}.`, data };
    },
  },
  {
    name: "change_animal_lot",
    description: "Mover uno o varios animales a otro lote.",
    write: true,
    parameters: obj({
      crotales: { type: "array", items: { type: "string" }, description: "Crotales o últimos dígitos" },
      lote: S("Nombre del lote de destino"),
      fecha: S("YYYY-MM-DD"),
    }, ["crotales", "lote"]),
    prepare: async (ctx, a) => {
      const lotes = await resolverLote(ctx, a.lote);
      if (!lotes.length) return { error: `No existe ningún lote parecido a "${a.lote}". Dile al usuario qué lotes tiene o que lo cree primero.` };
      if (lotes.length > 1) return { error: `Hay varios lotes que coinciden: ${lotes.map((l: any) => l.nombre).join(", ")}. Pregunta cuál.` };
      const animales: any[] = [];
      for (const c of a.crotales ?? []) {
        const r = await unicoAnimal(ctx, c);
        if (r.error) return { error: r.error };
        animales.push(r.animal);
      }
      if (!animales.length) return { error: "No has indicado qué animales mover." };
      const fecha = a.fecha || hoyMadrid();
      return {
        proposal: {
          tool: "change_animal_lot",
          args: { animal_ids: animales.map((x) => x.id), crotales: animales.map((x) => x.crotal), lote_id: lotes[0].id, lote_nombre: lotes[0].nombre, fecha },
          titulo: "Cambiar de lote",
          detalles: [
            { label: "Animales", value: animales.map((x) => x.crotal).join(", ") },
            { label: "Lote destino", value: lotes[0].nombre },
            { label: "Fecha", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      // Movimiento atómico: o se mueven todos los animales con su evento, o no se mueve ninguno.
      const { data, error } = await ctx.sb.rpc("mover_animales_lote", {
        _explotacion_id: ctx.explotacionId, _animal_ids: a.animal_ids, _lote_id: a.lote_id,
        _fecha: a.fecha, _idempotency_key: key, _origen: ctx.canal,
      });
      if (error) return { ok: false, message: error.message };
      if (data?.duplicado) return { ok: true, message: "Ese movimiento ya estaba hecho.", data };
      return { ok: true, message: `${data?.movidos ?? a.animal_ids.length} animal(es) movidos al lote ${a.lote_nombre}.`, data };
    },
  },
  {
    name: "create_expense",
    description: "Registrar un gasto de la explotación.",
    write: true,
    parameters: obj({
      concepto: S("Concepto del gasto"), total: N("Importe total en euros"),
      categoria: S(`Una de: ${CATEGORIAS_GASTO.join(", ")}`), proveedor: S("Proveedor"),
      fecha: S("YYYY-MM-DD"), iva_porcentaje: N("IVA aplicado, por defecto 21"),
    }, ["concepto", "total", "categoria"]),
    prepare: async (ctx, a) => {
      const total = Number(a.total);
      if (!isFinite(total) || total <= 0) return { error: "El importe del gasto no es válido." };
      const categoria = CATEGORIAS_GASTO.includes(String(a.categoria)) ? String(a.categoria) : "otros";
      const fecha = a.fecha || hoyMadrid();
      const iva = Number(a.iva_porcentaje ?? 21);
      return {
        proposal: {
          tool: "create_expense",
          args: { concepto: a.concepto, total, categoria, proveedor: a.proveedor ?? null, fecha, iva_porcentaje: iva },
          titulo: "Registrar gasto",
          detalles: [
            { label: "Concepto", value: a.concepto },
            { label: "Importe", value: eur(total) },
            { label: "Categoría", value: categoria },
            ...(a.proveedor ? [{ label: "Proveedor", value: String(a.proveedor) }] : []),
            { label: "Fecha", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      const total = Number(a.total);
      if (!isFinite(total) || total <= 0) return { ok: false, message: "Importe del gasto no válido." };
      const iva = Number(a.iva_porcentaje ?? 21);
      const base = Math.round((total / (1 + iva / 100)) * 100) / 100;
      const { error } = await ctx.sb.from("expenses").insert({
        explotacion_id: ctx.explotacionId, fecha: a.fecha, proveedor: a.proveedor, concepto: a.concepto,
        categoria: CATEGORIAS_GASTO.includes(String(a.categoria)) ? a.categoria : "otros",
        base_imponible: base, iva_porcentaje: iva,
        iva_importe: Math.round((total - base) * 100) / 100, total, origen: ctx.canal,
        idempotency_key: key,
      });
      if (error) {
        if (String((error as any).code) === "23505") return { ok: true, message: "Ese gasto ya estaba registrado." };
        return { ok: false, message: error.message };
      }
      return { ok: true, message: `Gasto de ${eur(total)} registrado.` };
    },
  },
  {
    name: "create_income",
    description: "Registrar un ingreso de la explotación.",
    write: true,
    parameters: obj({
      concepto: S("Concepto"), importe: N("Importe en euros"),
      categoria: S(`Una de: ${CATEGORIAS_INGRESO.join(", ")}`), cliente: S("Cliente"), fecha: S("YYYY-MM-DD"),
    }, ["concepto", "importe", "categoria"]),
    prepare: async (_ctx, a) => {
      const importe = Number(a.importe);
      if (!isFinite(importe) || importe <= 0) return { error: "El importe del ingreso no es válido." };
      const categoria = CATEGORIAS_INGRESO.includes(String(a.categoria)) ? String(a.categoria) : "otros";
      const fecha = a.fecha || hoyMadrid();
      return {
        proposal: {
          tool: "create_income",
          args: { concepto: a.concepto, importe, categoria, cliente: a.cliente ?? null, fecha },
          titulo: "Registrar ingreso",
          detalles: [
            { label: "Concepto", value: a.concepto },
            { label: "Importe", value: eur(importe) },
            { label: "Categoría", value: categoria },
            { label: "Fecha", value: fechaES(fecha) },
          ],
        },
      };
    },
    execute: async (ctx, a, key) => {
      const importe = Number(a.importe);
      if (!isFinite(importe) || importe <= 0) return { ok: false, message: "Importe del ingreso no válido." };
      const { error } = await ctx.sb.from("ingresos").insert({
        explotacion_id: ctx.explotacionId, fecha: a.fecha, concepto: a.concepto,
        categoria: CATEGORIAS_INGRESO.includes(String(a.categoria)) ? a.categoria : "otros",
        importe, cliente: a.cliente, created_by: ctx.userId, idempotency_key: key,
      });
      if (error) {
        if (String((error as any).code) === "23505") return { ok: true, message: "Ese ingreso ya estaba registrado." };
        return { ok: false, message: error.message };
      }
      return { ok: true, message: `Ingreso de ${eur(importe)} registrado.` };
    },
  },
  {
    name: "create_task",
    description: "Crear una tarea pendiente.",
    write: true,
    parameters: obj({ titulo: S("Título"), descripcion: S("Detalle"), fecha_limite: S("YYYY-MM-DD"), prioridad: S("baja | media | alta") }, ["titulo"]),
    prepare: async (_ctx, a) => {
      if (!String(a.titulo ?? "").trim()) return { error: "Falta el título de la tarea." };
      const prioridad = ["baja", "media", "alta"].includes(String(a.prioridad)) ? String(a.prioridad) : "media";
      return {
        proposal: {
          tool: "create_task",
          args: { titulo: a.titulo, descripcion: a.descripcion ?? null, fecha_limite: a.fecha_limite ?? null, prioridad },
          titulo: "Crear tarea",
          detalles: [
            { label: "Tarea", value: a.titulo },
            ...(a.fecha_limite ? [{ label: "Fecha límite", value: fechaES(a.fecha_limite) }] : []),
            { label: "Prioridad", value: prioridad },
          ],
        },
      };
    },
    execute: async (ctx, a) => {
      if (!String(a.titulo ?? "").trim()) return { ok: false, message: "Falta el título de la tarea." };
      const { error } = await ctx.sb.from("tareas").insert({
        explotacion_id: ctx.explotacionId, titulo: a.titulo, descripcion: a.descripcion,
        fecha_limite: a.fecha_limite, prioridad: a.prioridad, estado: "pendiente", created_by: ctx.userId,
      });
      return error ? { ok: false, message: error.message } : { ok: true, message: "Tarea creada." };
    },
  },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t]));

export function systemPrompt(canal: string, explotacionNombre?: string) {
  return `Eres el asistente de GanaderOS, un software de gestión de explotaciones ganaderas (bovino extensivo) en España.
Hoy es ${hoyMadrid()}. Explotación: ${explotacionNombre ?? "la del usuario"}. Canal: ${canal}.

REGLAS:
- Responde SIEMPRE en español, de forma breve, directa y en el lenguaje de un ganadero. Nada de markdown pesado ni listas interminables.
- Usa SIEMPRE las herramientas para obtener o modificar datos. No inventes NUNCA cifras, crotales, fechas, medicamentos ni importes.
- Los ganaderos dicen "la 7843": son los últimos dígitos del crotal. Búscalo con la herramienta. Si hay varias coincidencias, muestra las opciones y pregunta cuál; no elijas tú.
- Si faltan datos para registrar algo (sexo de la cría, qué tratamiento, importe...), pregunta antes. Una pregunta cada vez.
- Las herramientas de registro NO guardan nada: preparan una propuesta que el usuario tiene que confirmar. Cuando una de ellas responda "pendiente de confirmación", resume lo entendido en una frase corta y pide confirmación.
- No diagnostiques enfermedades. Puedes mostrar incidencias, tratamientos e historial y recomendar consultar con el veterinario.
- No puedes borrar animales, explotaciones, documentos ni eventos: dile al usuario que eso se hace desde la pantalla correspondiente.
- Si una operación falla, dilo claramente: nunca afirmes que algo se ha registrado si no se ha guardado.`;
}

/** Llamada HTTP con timeout duro. Ninguna petición externa puede quedarse abierta. */
async function fetchConTimeout(url: string, init: RequestInit, ms: number) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chat con el proveedor de IA.
 * Reintenta SÓLO errores temporales (429 y 5xx) con backoff exponencial y jitter.
 * Los errores permanentes (400/401/403) no se reintentan nunca: evitan bucles.
 * Es seguro reintentar porque este paso sólo interpreta: no escribe en base de datos.
 */
async function gatewayChat(body: Record<string, unknown>) {
  const intentos = 3;
  let ultimo: any = null;
  for (let i = 0; i < intentos; i++) {
    let res: Response;
    try {
      res = await fetchConTimeout(`${GEMINI_GATEWAY}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${geminiApiKey()}` },
        body: JSON.stringify(body),
      }, 45_000);
    } catch (e) {
      ultimo = Object.assign(new Error(`AI sin respuesta: ${(e as Error).message}`), { status: 503 });
      if (i < intentos - 1) { await esperar(500 * 2 ** i + Math.random() * 250); continue; }
      throw ultimo;
    }
    if (res.ok) return await res.json();
    const txt = await res.text().catch(() => "");
    const err: any = new Error(`AI ${res.status}: ${txt.slice(0, 400)}`);
    err.status = res.status;
    const temporal = res.status === 429 || res.status >= 500;
    if (!temporal || i === intentos - 1) throw err;
    ultimo = err;
    await esperar(500 * 2 ** i + Math.random() * 250);
  }
  throw ultimo ?? new Error("AI no disponible");
}

export type TurnResult = {
  reply: string;
  proposal: Proposal | null;
  ui: UiBlock[];
  messages: any[];
  toolsUsed: string[];
};

export async function runTurn(
  ctx: AiCtx,
  history: { role: string; content: string }[],
  explotacionNombre?: string,
): Promise<TurnResult> {
  const messages: any[] = [
    { role: "system", content: systemPrompt(ctx.canal, explotacionNombre) },
    ...history.slice(-12),
  ];
  const tools = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const ui: UiBlock[] = [];
  const toolsUsed: string[] = [];
  let proposal: Proposal | null = null;

  for (let step = 0; step < 5; step++) {
    const data = await gatewayChat({ model: MODEL_CHAT, messages, tools, tool_choice: "auto" });
    const msg = data?.choices?.[0]?.message;
    if (!msg) break;
    messages.push(msg);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return { reply: msg.content ?? "", proposal, ui, messages, toolsUsed };
    }
    for (const call of calls) {
      const tool = TOOL_BY_NAME[call.function?.name];
      let args: any = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* ignore */ }
      let content: string;
      if (!tool) {
        content = JSON.stringify({ error: "Herramienta no disponible" });
      } else if (tool.write) {
        toolsUsed.push(tool.name);
        const prep = await tool.prepare!(ctx, args);
        if (prep.error) {
          content = JSON.stringify({ estado: "faltan_datos", mensaje: prep.error });
        } else {
          // Identidad única de la propuesta: confirmarla dos veces ejecuta una sola operación.
          proposal = { ...prep.proposal!, id: crypto.randomUUID() };
          content = JSON.stringify({ estado: "pendiente_de_confirmacion", propuesta: prep.proposal });
        }
      } else {
        toolsUsed.push(tool.name);
        try {
          const out = await tool.run!(ctx, args);
          if (out.ui) ui.push(out.ui);
          content = JSON.stringify(out.result).slice(0, 12000);
        } catch (e) {
          content = JSON.stringify({ error: String((e as Error).message) });
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }
  return { reply: "No he podido completar la petición. Inténtalo de nuevo con otras palabras.", proposal, ui, messages, toolsUsed };
}

// ---------- Idempotencia ----------
// Cada ejecución "reclama" una clave única antes de escribir. Si la clave ya existe
// (webhook repetido, doble pulsación, reintento), no se vuelve a guardar nada.
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function argsEstables(args: Record<string, unknown>) {
  return JSON.stringify(Object.keys(args ?? {}).sort().map((k) => [k, (args as any)[k]]));
}

export async function claveIdempotencia(ctx: AiCtx, proposal: Proposal) {
  // Prioridad: identidad de la propuesta (dos "SÍ" seguidos = una sola operación),
  // después el id del mensaje/petición (webhook repetido) y, si no hay nada, el contenido.
  const base = proposal?.id
    ? `${ctx.explotacionId}|prop|${proposal.id}`
    : ctx.requestKey
      ? `${ctx.explotacionId}|req|${ctx.requestKey}`
      : `${ctx.explotacionId}|${ctx.canal}|${proposal.tool}|${argsEstables(proposal.args)}`;
  return await sha256(base);
}

export async function executeProposal(ctx: AiCtx, proposal: Proposal) {
  const tool = TOOL_BY_NAME[proposal?.tool];
  if (!tool?.execute) return { ok: false, message: "Acción no disponible." };

  const key = await claveIdempotencia(ctx, proposal);
  const { data: claim, error: claimErr } = await ctx.sb
    .from("ai_action_log")
    .insert({
      explotacion_id: ctx.explotacionId, user_id: ctx.userId, canal: ctx.canal,
      tool: proposal.tool, ok: false, intencion: proposal.titulo,
      resultado: { args: proposal.args, estado: "en_curso" }, idempotency_key: key,
    })
    .select("id")
    .single();

  if (claimErr) {
    // 23505 = clave duplicada → ya se ejecutó esta misma acción
    if (String((claimErr as any).code) === "23505") {
      return { ok: true, message: "Eso ya lo tenía registrado, no lo he duplicado.", duplicado: true } as any;
    }
    // Si el log falla por otro motivo seguimos adelante (el log nunca bloquea la acción)
  }

  try {
    const r = await tool.execute(ctx, proposal.args, key);
    if (claim?.id) {
      await ctx.sb.from("ai_action_log").update({
        ok: r.ok, resultado: { args: proposal.args, data: r.data ?? null }, error: r.ok ? null : r.message,
      }).eq("id", claim.id);
    }
    if (!r.ok) return { ok: false, message: `No he podido guardarlo. Tus datos no han sido modificados. (${r.message})` };
    await registrarActividad(ctx, { accion: proposal.tool, entidad: "asistente", detalle: { titulo: proposal.titulo, args: proposal.args } });
    return r;
  } catch (e) {
    if (claim?.id) {
      await ctx.sb.from("ai_action_log").update({ ok: false, error: String((e as Error).message) }).eq("id", claim.id);
    }
    return { ok: false, message: "No he podido guardarlo. Tus datos no han sido modificados." };
  }
}

export async function registrarActividad(
  ctx: AiCtx,
  d: { accion: string; entidad?: string | null; entidad_id?: string | null; detalle?: any },
) {
  try {
    await ctx.sb.from("actividad_log").insert({
      explotacion_id: ctx.explotacionId, user_id: ctx.userId, canal: ctx.canal,
      accion: d.accion, entidad: d.entidad ?? null, entidad_id: d.entidad_id ?? null, detalle: d.detalle ?? {},
    });
  } catch { /* la trazabilidad nunca rompe la acción */ }
}

export async function registrarEventoProducto(
  ctx: AiCtx,
  evento: string,
  props: Record<string, unknown> = {},
) {
  try {
    await ctx.sb.from("product_events").insert({
      explotacion_id: ctx.explotacionId, user_id: ctx.userId, canal: ctx.canal, evento, props,
    });
  } catch { /* ignore */ }
}

export async function logAi(ctx: AiCtx, d: { tool?: string | null; ok?: boolean; intencion?: string | null; mensaje?: string | null; resultado?: any; error?: string | null }) {
  try {
    await ctx.sb.from("ai_action_log").insert({
      explotacion_id: ctx.explotacionId, user_id: ctx.userId, canal: ctx.canal,
      tool: d.tool ?? null, ok: d.ok ?? true, intencion: d.intencion ?? null,
      mensaje: (d.mensaje ?? "").slice(0, 500) || null, resultado: d.resultado ?? {}, error: d.error ?? null,
    });
  } catch { /* el log nunca debe romper la conversación */ }
}

// ---------- Voz ----------
export async function transcribeAudio(base64: string, mime: string): Promise<string> {
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = mime.includes("mp4") ? "mp4" : mime.includes("mpeg") ? "mp3" : mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "webm";
  const fd = new FormData();
  fd.append("model", MODEL_STT);
  fd.append("file", new Blob([bin], { type: mime }), `audio.${ext}`);
  fd.append("language", "es");
  fd.append("response_format", "json");
  const res = await fetchConTimeout(`${GROQ_GATEWAY}/audio/transcriptions`, {
    method: "POST", headers: { Authorization: `Bearer ${groqApiKey()}` }, body: fd,
  }, 60_000);

  if (!res.ok) throw new Error(`Transcripción fallida (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data?.text ?? "";
}

// ---------- Visión: clasificar foto ----------
export type FotoClasificada = {
  tipo: "crotal" | "factura" | "documento" | "general";
  crotal?: string | null;
  documento_categoria?: string | null;
  factura?: { proveedor?: string | null; fecha?: string | null; total?: number | null; iva_porcentaje?: number | null; concepto?: string | null; categoria?: string | null } | null;
  descripcion?: string | null;
};

export async function clasificarFoto(base64: string, mime: string): Promise<FotoClasificada> {
  const data = await gatewayChat({
    model: MODEL_VISION,
    messages: [
      {
        role: "system",
        content: `Clasificas fotos enviadas por un ganadero. Devuelve SOLO un JSON con esta forma:
{"tipo":"crotal|factura|documento|general","crotal":"dígitos leídos del crotal o null","documento_categoria":"receta|guia|documento_sanitario|certificado|seguro|pac|contrato|otros|null","factura":{"proveedor":null,"fecha":"YYYY-MM-DD","total":0,"iva_porcentaje":21,"concepto":"","categoria":"alimentacion|veterinario|medicamentos|combustible|maquinaria|reparaciones|seguros|personal|suministros|transporte|compra_animales|instalaciones|otros"},"descripcion":"qué se ve"}
Reglas: "crotal" solo si se ve una marca/arete de identificación de un animal; transcribe los dígitos que veas. "factura" solo si es una factura o ticket de compra. No inventes importes que no se lean.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Clasifica esta foto." },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  });
  const txt = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(txt.replace(/^```json|```$/g, "").trim());
    return { tipo: parsed.tipo ?? "general", ...parsed };
  } catch {
    return { tipo: "general", descripcion: null };
  }
}
