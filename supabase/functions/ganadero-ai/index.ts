// Orquestador de IA de GanaderOS para la app (texto, voz y fotos).
// La explotación SIEMPRE se deriva del usuario autenticado, nunca del texto del modelo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  AiCtx, runTurn, executeProposal, transcribeAudio, clasificarFoto, resolverAnimales, logAi, hoyMadrid, TOOLS,
} from "../_shared/ganado-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "No autenticado" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "No autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "chat";

    // Transcripción: no necesita explotación
    if (mode === "transcribe") {
      if (!body.audio_base64) return json({ error: "Falta el audio" }, 400);
      const text = await transcribeAudio(body.audio_base64, body.mime ?? "audio/webm");
      return json({ text });
    }

    // La explotación se valida contra las del usuario (RLS con su propio token)
    const { data: expls } = await userClient.from("explotaciones").select("id, nombre").order("created_at");
    const lista = expls ?? [];
    if (!lista.length) return json({ error: "Todavía no tienes ninguna explotación creada." }, 400);
    const elegida = lista.find((e: any) => e.id === body.explotacion_id) ?? lista[0];

    const sb = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const ctx: AiCtx = {
      sb, explotacionId: elegida.id, userId: user.id, canal: body.canal ?? "app",
      // La app envía un id único por confirmación: si el usuario pulsa dos veces, no se duplica.
      requestKey: typeof body.request_key === "string" ? body.request_key : null,
    };

    if (mode === "confirm") {
      const proposal = body.proposal;
      // El cliente puede manipular la propuesta: sólo aceptamos herramientas de escritura conocidas.
      // Los datos siempre se escriben contra la explotación derivada del usuario autenticado,
      // y cada herramienta revalida importes, pesos y pertenencia del animal en el servidor.
      const permitidas = TOOLS.filter((t) => t.write).map((t) => t.name);
      if (!proposal?.tool || typeof proposal.tool !== "string") return json({ error: "Propuesta no válida" }, 400);
      if (!permitidas.includes(proposal.tool)) return json({ error: "Acción no permitida" }, 403);
      if (!proposal.args || typeof proposal.args !== "object") return json({ error: "Faltan datos de la propuesta" }, 422);
      const r = await executeProposal(ctx, proposal);
      return json(r, r.ok ? 200 : 409);
    }

    if (mode === "photo") {
      if (!body.image_base64) return json({ error: "Falta la imagen" }, 400);
      const mime = body.mime ?? "image/jpeg";
      const cls = await clasificarFoto(body.image_base64, mime);
      await logAi(ctx, { tool: "clasificar_foto", intencion: cls.tipo, resultado: { tipo: cls.tipo } });

      if (cls.tipo === "crotal" && cls.crotal) {
        const animales = await resolverAnimales(ctx, cls.crotal);
        if (!animales.length) {
          return json({
            reply: `Creo que el crotal es ${cls.crotal}, pero no encuentro ese animal en tu explotación.`,
            ui: [], proposal: null, sinAnimal: true, crotal: cls.crotal,
          });
        }
        if (animales.length > 1) {
          return json({
            reply: `He leído ${cls.crotal} y coincide con varios animales. ¿Cuál es?`,
            ui: [{ type: "animals", items: animales }], proposal: null,
          });
        }
        return json({
          reply: `Creo que el crotal es ${cls.crotal}. He encontrado a ${animales[0].crotal}. ¿Es correcto?`,
          ui: [{ type: "animals", items: animales }], proposal: null,
        });
      }

      if (cls.tipo === "factura" && cls.factura?.total) {
        const f = cls.factura;
        return json({
          reply: `Parece una factura${f.proveedor ? ` de ${f.proveedor}` : ""}. He leído ${f.total} € (${f.categoria ?? "otros"}). ¿Lo registro como gasto?`,
          ui: [], 
          proposal: {
            tool: "create_expense",
            args: {
              concepto: f.concepto || "Compra", total: Number(f.total), categoria: f.categoria || "otros",
              proveedor: f.proveedor ?? null, fecha: f.fecha || hoyMadrid(), iva_porcentaje: Number(f.iva_porcentaje ?? 21),
            },
            titulo: "Registrar gasto desde factura",
            detalles: [
              { label: "Concepto", value: f.concepto || "Compra" },
              { label: "Importe", value: `${f.total} €` },
              { label: "Categoría", value: f.categoria || "otros" },
              ...(f.proveedor ? [{ label: "Proveedor", value: f.proveedor }] : []),
              { label: "Fecha", value: f.fecha || hoyMadrid() },
            ],
          },
        });
      }

      if (cls.tipo === "documento") {
        return json({
          reply: `Parece un documento${cls.documento_categoria ? ` del tipo "${cls.documento_categoria}"` : ""}. Guárdalo desde la pantalla de Documentos para asociarlo al animal correspondiente.`,
          ui: [], proposal: null, documento_categoria: cls.documento_categoria ?? null,
        });
      }

      return json({ reply: cls.descripcion ? `He visto: ${cls.descripcion}. Dime qué quieres que haga con esta foto.` : "No sé qué hacer con esta foto. ¿Es un crotal, una factura o un documento?", ui: [], proposal: null });
    }

    // mode === "chat"
    const history = Array.isArray(body.messages) ? body.messages.filter((m: any) => m?.role && typeof m.content === "string") : [];
    if (!history.length) return json({ error: "Mensaje vacío" }, 400);

    const turn = await runTurn(ctx, history, elegida.nombre);
    await logAi(ctx, {
      tool: turn.toolsUsed.join(",") || null,
      intencion: turn.proposal ? turn.proposal.titulo : "consulta",
      mensaje: history[history.length - 1]?.content ?? null,
      resultado: { tools: turn.toolsUsed },
    });
    return json({ reply: turn.reply, proposal: turn.proposal, ui: turn.ui, tools: turn.toolsUsed });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    const status = (e as any)?.status;
    // Nunca exponemos SQL, trazas ni detalles internos al usuario final.
    if (status === 429) return json({ error: "El asistente está saturado ahora mismo. Prueba en unos segundos." }, 429);
    if (status === 402) return json({ error: "Se han agotado los créditos de IA." }, 402);
    if (status && status >= 500) return json({ error: "El asistente no está disponible ahora mismo. Inténtalo en un minuto." }, 503);
    console.error("ganadero-ai error", msg);
    return json({ error: "No he podido procesar la petición. No se ha guardado ningún cambio." }, 500);
  }
});
