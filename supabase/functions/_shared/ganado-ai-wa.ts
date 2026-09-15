// Puente entre WhatsApp y el motor de intenciones de GanaderOS.
// No duplica reglas de negocio: sólo adapta el canal (sesión, confirmaciones SÍ/NO, adjuntos).

import {
  type AiCtx,
  type Proposal,
  clasificarFoto,
  executeProposal,
  logAi,
  registrarEventoProducto,
  resolverAnimales,
  runTurn,
  transcribeAudio,
} from "./ganado-ai.ts";

export const AYUDA_WA = `🐄 *GanaderOS por WhatsApp*
Escríbeme como se lo dirías a un compañero. Ejemplos:

• Ha parido la 7843, ternera
• Pesa 340 la 1122
• La 55 está coja
• He gastado 320 € en pienso
• ¿Cuántas vacas tengo?
• ¿Qué animales están en tratamiento?

También puedes mandarme un *audio* o una *foto del crotal*.
Antes de guardar nada te pediré confirmación: responde *SÍ* o *NO*.
Escribe *CANCELAR* para empezar de nuevo, o *OPINIÓN* + tu comentario para contarnos algo.`;

const SESSION_TTL_MIN = 30;

export type ExplotacionCtx = { id: string; nombre: string; userId: string | null };

/**
 * Deriva la explotación del remitente (nunca del texto del usuario):
 * 1) por el teléfono registrado en la explotación, 2) por la empresa del remitente.
 */
export async function resolverExplotacionWa(
  sb: any,
  companyId: string | null,
  remitente?: string | null,
): Promise<ExplotacionCtx | null> {
  const digits = (remitente ?? "").replace(/\D/g, "");
  if (digits.length >= 9) {
    const ultimos = digits.slice(-9);
    const { data } = await sb.from("explotaciones").select("id, nombre, user_id, whatsapp_number").limit(500);
    const hit = (data ?? []).find((e: any) => {
      const d = String(e.whatsapp_number ?? "").replace(/\D/g, "");
      return d.length >= 9 && d.slice(-9) === ultimos;
    });
    if (hit) return { id: hit.id, nombre: hit.nombre, userId: hit.user_id };
  }
  if (!companyId) return null;
  const { data: roles } = await sb
    .from("user_roles")
    .select("user_id")
    .eq("company_id", companyId)
    .limit(10);
  const userIds = (roles ?? []).map((r: any) => r.user_id).filter(Boolean);
  if (!userIds.length) return null;
  const { data: exps } = await sb
    .from("explotaciones")
    .select("id, nombre, user_id")
    .in("user_id", userIds)
    .order("created_at", { ascending: true })
    .limit(1);
  const e = exps?.[0];
  if (!e) return null;
  return { id: e.id, nombre: e.nombre, userId: e.user_id };
}

async function loadSession(sb: any, remitente: string) {
  const since = new Date(Date.now() - SESSION_TTL_MIN * 60_000).toISOString();
  const { data } = await sb
    .from("ai_sessions")
    .select("id, messages, pending, updated_at")
    .eq("canal", "whatsapp")
    .eq("external_key", remitente)
    .maybeSingle();
  if (!data) return { id: null as string | null, messages: [] as any[], pending: null as Proposal | null };
  const fresh = data.updated_at && data.updated_at > since;
  return {
    id: data.id as string,
    messages: fresh ? ((data.messages ?? []) as any[]) : [],
    pending: fresh ? ((data.pending ?? null) as Proposal | null) : null,
  };
}

async function saveSession(
  sb: any,
  remitente: string,
  ctx: { explotacionId: string; userId: string | null },
  messages: any[],
  pending: Proposal | null,
  sessionId: string | null,
) {
  const row = {
    canal: "whatsapp",
    external_key: remitente,
    explotacion_id: ctx.explotacionId,
    user_id: ctx.userId,
    messages: messages.slice(-12),
    pending,
    updated_at: new Date().toISOString(),
  };
  if (sessionId) await sb.from("ai_sessions").update(row).eq("id", sessionId);
  else await sb.from("ai_sessions").insert(row);
}

export async function limpiarSesionWa(sb: any, remitente: string) {
  await sb.from("ai_sessions").update({ pending: null, messages: [] }).eq("canal", "whatsapp").eq("external_key", remitente);
}

const SI = ["SI", "SÍ", "OK", "VALE", "CONFIRMO", "CONFIRMAR", "CORRECTO", "ADELANTE", "SIP", "ESO ES"];
const NO = ["NO", "NEGATIVO", "NOP"];
const CANCELAR = ["CANCELAR", "CANCELA", "ANULA", "ANULAR", "OLVIDA ESO", "OLVIDALO", "OLVÍDALO", "EMPEZAR DE NUEVO", "EMPIEZA DE NUEVO", "BORRA ESO", "DEJALO", "DÉJALO"];
const AYUDA = ["AYUDA", "HOLA", "MENU", "MENÚ", "?", "QUE PUEDES HACER", "QUÉ PUEDES HACER"];

function normaliza(t: string) {
  return t.trim().toUpperCase().replace(/[!¡.,]/g, "").replace(/\s+/g, " ");
}

function propuestaTexto(p: Proposal) {
  const det = p.detalles.map((d) => `• ${d.label}: ${d.value}`).join("\n");
  return `📝 *${p.titulo}*\n${det}\n\n¿Lo confirmo? Responde *SÍ* o *NO*.\nSi algo no está bien, dímelo con tus palabras y lo corrijo.`;
}

/**
 * Procesa un mensaje de texto de WhatsApp con el motor de IA.
 * Devuelve true si lo ha gestionado (y ya ha respondido al usuario).
 */
export async function manejarTextoIaWa(opts: {
  sb: any;
  remitente: string;
  texto: string;
  exp: ExplotacionCtx;
  sendText: (to: string, body: string) => Promise<unknown>;
  /** id del mensaje de WhatsApp: hace la ejecución idempotente */
  requestKey?: string | null;
}): Promise<{ handled: boolean; reply: string; tools: string[] }> {
  const { sb, remitente, texto, exp, sendText, requestKey } = opts;
  const ctx: AiCtx = { sb, explotacionId: exp.id, userId: exp.userId, canal: "whatsapp", requestKey: requestKey ?? null };
  const sesion = await loadSession(sb, remitente);
  const upper = normaliza(texto);

  // Ayuda
  if (AYUDA.includes(upper)) {
    await sendText(remitente, AYUDA_WA);
    await registrarEventoProducto(ctx, "wa_ayuda");
    return { handled: true, reply: AYUDA_WA, tools: [] };
  }

  // Opinión / feedback
  if (upper.startsWith("OPINION") || upper.startsWith("OPINIÓN") || upper.startsWith("FEEDBACK")) {
    const mensaje = texto.replace(/^\s*(opini[oó]n|feedback)\s*:?\s*/i, "").trim();
    if (!mensaje) {
      const r = "Cuéntame qué mejorarías así: *OPINIÓN* y tu comentario.";
      await sendText(remitente, r);
      return { handled: true, reply: r, tools: [] };
    }
    await sb.from("feedback").insert({ explotacion_id: exp.id, user_id: exp.userId, canal: "whatsapp", mensaje, contexto: { remitente } });
    const r = "🙏 Gracias, lo hemos apuntado.";
    await sendText(remitente, r);
    await registrarEventoProducto(ctx, "feedback_enviado", { canal: "whatsapp" });
    return { handled: true, reply: r, tools: [] };
  }

  // Cancelar en cualquier momento
  if (CANCELAR.includes(upper)) {
    await saveSession(sb, remitente, { explotacionId: exp.id, userId: exp.userId }, [], null, sesion.id);
    const r = "❌ Listo, lo he olvidado. No he cambiado nada. Dime qué necesitas.";
    await sendText(remitente, r);
    return { handled: true, reply: r, tools: [] };
  }

  // Confirmación / rechazo de una propuesta pendiente
  if (sesion.pending) {
    if (SI.includes(upper)) {
      const r = await executeProposal(ctx, sesion.pending);
      const reply = r.ok ? `✅ ${r.message}` : `⚠️ ${r.message}`;
      await sendText(remitente, reply);
      await saveSession(sb, remitente, { explotacionId: exp.id, userId: exp.userId }, [], null, sesion.id);
      await registrarEventoProducto(ctx, r.ok ? "accion_confirmada" : "accion_fallida", { tool: sesion.pending.tool });
      return { handled: true, reply, tools: [sesion.pending.tool] };
    }
    if (NO.includes(upper)) {
      const reply = "❌ Cancelado. No he registrado nada.";
      await sendText(remitente, reply);
      await saveSession(sb, remitente, { explotacionId: exp.id, userId: exp.userId }, [], null, sesion.id);
      return { handled: true, reply, tools: [] };
    }
    // Cualquier otra cosa se interpreta como una corrección de la propuesta pendiente.
  }

  const history = [...sesion.messages, { role: "user", content: texto }];
  const turn = await runTurn(ctx, history, exp.nombre);
  const reply = turn.reply?.trim() || "No he entendido la petición. ¿Puedes decírmelo de otra forma? Escribe *AYUDA* para ver ejemplos.";
  const body = turn.proposal ? `${reply}\n\n${propuestaTexto(turn.proposal)}` : reply;
  await sendText(remitente, body.slice(0, 3800));
  await saveSession(
    sb,
    remitente,
    { explotacionId: exp.id, userId: exp.userId },
    [...history, { role: "assistant", content: reply }],
    turn.proposal,
    sesion.id,
  );
  await logAi(ctx, { tool: turn.toolsUsed.join(",") || null, ok: true, mensaje: texto, intencion: turn.proposal?.titulo ?? "consulta" });
  await registrarEventoProducto(ctx, turn.proposal ? "propuesta_generada" : "consulta_ia", { tools: turn.toolsUsed });
  return { handled: true, reply: body, tools: turn.toolsUsed };
}

/** Transcribe una nota de voz almacenada en Storage. */
export async function transcribirAdjuntoWa(sb: any, bucket: string, path: string): Promise<string> {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) throw new Error("No he podido descargar el audio");
  const buf = new Uint8Array(await data.arrayBuffer());
  const mime = (data as Blob).type || "audio/ogg";
  return await transcribeAudio(base64(buf), mime);
}

/** Clasifica una foto: crotal, factura, documento o general. */
export async function clasificarAdjuntoWa(sb: any, bucket: string, path: string) {
  const { data, error } = await sb.storage.from(bucket).download(path);
  if (error || !data) throw new Error("No he podido descargar la imagen");
  const buf = new Uint8Array(await data.arrayBuffer());
  const mime = (data as Blob).type || "image/jpeg";
  return await clasificarFoto(base64(buf), mime);
}

/** Respuesta para una foto de crotal: busca el animal real, nunca lo crea. */
export async function responderCrotalWa(sb: any, exp: ExplotacionCtx, digitos: string) {
  const ctx: AiCtx = { sb, explotacionId: exp.id, userId: exp.userId, canal: "whatsapp" };
  const lista = await resolverAnimales(ctx, digitos);
  await registrarEventoProducto(ctx, "ocr_crotal", { digitos, coincidencias: lista.length });
  if (lista.length === 1) {
    const a: any = lista[0];
    return `📷 Creo que el crotal es *${digitos}*.\n\n🐄 ${a.crotal} · ${a.sexo === "macho" ? "Macho" : "Hembra"}${a.raza ? ` · ${a.raza}` : ""}\n\nSi no es ese, dime el crotal correcto. Si es correcto, dime qué quieres registrar (parto, pesaje, tratamiento, incidencia…).`;
  }
  if (lista.length > 1) {
    const opciones = lista.slice(0, 6).map((a: any) => `• ${a.crotal}`).join("\n");
    return `📷 He leído *${digitos}* y encaja con varios animales:\n${opciones}\n\n¿Cuál es?`;
  }
  return `📷 He leído *${digitos}*, pero no encuentro ese animal en tu explotación. Dime el crotal correcto o dalo de alta en la app, en Animales.`;
}

function base64(buf: Uint8Array) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) s += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(s);
}
