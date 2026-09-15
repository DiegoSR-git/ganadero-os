// Procesa mensajes WA: comandos completos (clientes, facturas, gastos, empresa, gestoría),
// OCR de tickets con Lovable AI, generación de PDFs server-side y envío de documentos por WhatsApp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import JSZip from "https://esm.sh/jszip@3.10.1";
import {
  clasificarAdjuntoWa,
  manejarTextoIaWa,
  resolverExplotacionWa,
  responderCrotalWa,
  transcribirAdjuntoWa,
  type ExplotacionCtx,
} from "../_shared/ganado-ai-wa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const eur = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));
const fechaCorta = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }).format(dt);
};
const MES_NOMBRES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// ============== Comandos ==============
const COMANDOS = [
  "FACTURA",
  "FACTURAS",
  "GASTO",
  "GASTOS",
  "COBRO",
  "RESUMEN",
  "GESTORIA",
  "CLIENTE",
  "CLIENTES",
  "EMPRESA",
  "AYUDA",
  "SI",
  "NO",
];

function parseCommand(text: string) {
  if (!text) return null;
  const t = text.trim();
  const upper = t.toUpperCase();
  // Match palabra completa para evitar que "GASTOS" matchee "GASTO"
  const cmd = COMANDOS.sort((a, b) => b.length - a.length).find(
    (c) => upper === c || upper.startsWith(c + " ") || upper.startsWith(c + "\n"),
  );
  if (!cmd) return null;
  const rest = t.slice(cmd.length).trim();
  return { cmd, rest };
}

const extractMoney = (s: string) => {
  const m = s.match(/(\d+[.,]?\d*)/);
  return m ? Number(m[1].replace(",", ".")) : null;
};
const extractClientName = (s: string) => {
  const m = s.match(/\b(?:a|para|cliente)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ][\w\s]+)$/);
  return m?.[1]?.trim() ?? null;
};
const parseMes = (s: string): number | null => {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  const idx = MES_NOMBRES.findIndex((m) => t.startsWith(m));
  if (idx >= 0) return idx + 1;
  const n = parseInt(t, 10);
  if (n >= 1 && n <= 12) return n;
  return null;
};
const extractEmail = (s: string) => s.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
const extractPhone = (s: string) => s.match(/\+?\d[\d\s.-]{7,}/)?.[0]?.replace(/\s/g, "") ?? null;
const extractNif = (s: string) => s.match(/\b[0-9]{8}[A-Z]\b|\b[A-Z][0-9]{8}\b/i)?.[0]?.toUpperCase() ?? null;

// ============== WhatsApp send helpers ==============
async function sendWhatsAppText(to: string, body: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return { skipped: true };
  const cleanTo = to.replace(/^\+/, "");
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanTo,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("WA send error", res.status, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data };
}

async function sendWhatsAppDocument(to: string, mediaUrl: string, filename: string, caption?: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return { skipped: true };
  const cleanTo = to.replace(/^\+/, "");
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: cleanTo,
      type: "document",
      document: { link: mediaUrl, filename, caption: caption ?? "" },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("WA send doc error", res.status, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data };
}

// ============== WhatsApp INTERACTIVE helpers (botones / listas) ==============
// Envía mensaje interactivo con hasta 3 botones de respuesta rápida.
// `buttons`: [{ id, title }] (title máx ~20 chars).
async function sendWhatsAppButtons(to: string, body: string, buttons: { id: string; title: string }[]) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return { skipped: true };
  const cleanTo = to.replace(/^\+/, "");
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: body },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("WA send buttons error", res.status, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data };
}

// Envía mensaje interactivo tipo lista. Útil cuando hay >3 opciones.
// `sections`: [{ title, rows: [{ id, title, description? }] }] (máx 10 filas en total).
async function sendWhatsAppList(
  to: string,
  body: string,
  buttonText: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[],
) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneId) return { skipped: true };
  const cleanTo = to.replace(/^\+/, "");
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: buttonText.slice(0, 20),
        sections: sections.map((s) => ({
          title: s.title.slice(0, 24),
          rows: s.rows.slice(0, 10).map((r) => ({
            id: r.id,
            title: r.title.slice(0, 24),
            description: r.description ? r.description.slice(0, 72) : undefined,
          })),
        })),
      },
    },
  };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error("WA send list error", res.status, JSON.stringify(data));
  return { ok: res.ok, status: res.status, data };
}

// ============== MENÚS INTERACTIVOS ==============
// IDs estables de los botones/filas. Cualquier cambio aquí debe reflejarse en MENU_ID_TO_COMMAND.
const MENU_IDS = {
  // Principal
  facturas: "menu_facturas",
  gastos: "menu_gastos",
  resumen: "menu_resumen",
  gestoria: "menu_gestoria",
  clientes: "menu_clientes",
  empresa: "menu_empresa",
  ayuda: "menu_ayuda",
  volver: "volver_menu",
  // Facturas
  facturaCrear: "factura_crear",
  facturasPendientes: "facturas_pendientes",
  facturasCobradas: "facturas_cobradas",
  facturasMes: "facturas_mes",
  facturaCobro: "factura_cobro",
  facturaVer: "factura_ver",
  facturaPdf: "factura_pdf",
  facturaAnular: "factura_anular",
  // Gastos
  gastoCrear: "gasto_crear",
  gastoTicket: "gasto_ticket",
  gastosMes: "gastos_mes",
  gastosPendientes: "gastos_pendientes",
  // Resumen
  resumenMesActual: "resumen_mes_actual",
  resumenOtroMes: "resumen_otro_mes",
  // Gestoría
  gestoriaVerActual: "gestoria_ver_actual",
  gestoriaEnviarActual: "gestoria_enviar_actual",
  gestoriaOtroTrim: "gestoria_otro_trimestre",
  // Clientes
  clientesVer: "clientes_ver",
  clienteBuscar: "cliente_buscar",
  clienteCrear: "cliente_crear",
  clienteBorrar: "cliente_borrar",
  // Empresa
  empresaVer: "empresa_ver",
  empresaIva: "empresa_iva",
} as const;

// Mapea selección de menú → texto-comando interno. null = se gestiona aparte (mostrar otro menú o pedir input).
const MENU_ID_TO_COMMAND: Record<string, string | null> = {
  // Atajos directos a comandos existentes
  [MENU_IDS.facturasPendientes]: "FACTURAS pendientes",
  [MENU_IDS.facturasCobradas]: "FACTURAS cobradas",
  [MENU_IDS.facturasMes]: "FACTURAS mes",
  [MENU_IDS.gastosMes]: "GASTOS mes",
  [MENU_IDS.gastosPendientes]: "GASTOS pendientes",
  [MENU_IDS.resumenMesActual]: "RESUMEN",
  [MENU_IDS.empresaVer]: "EMPRESA",
  [MENU_IDS.clientesVer]: "CLIENTES",
  [MENU_IDS.ayuda]: "AYUDA",
  // El resto necesitan respuesta especial (instrucciones / submenús / preguntas)
  [MENU_IDS.facturas]: null,
  [MENU_IDS.gastos]: null,
  [MENU_IDS.resumen]: null,
  [MENU_IDS.gestoria]: null,
  [MENU_IDS.clientes]: null,
  [MENU_IDS.empresa]: null,
  [MENU_IDS.volver]: null,
  [MENU_IDS.facturaCrear]: null,
  [MENU_IDS.facturaCobro]: null,
  [MENU_IDS.facturaVer]: null,
  [MENU_IDS.facturaPdf]: null,
  [MENU_IDS.facturaAnular]: null,
  [MENU_IDS.gastoCrear]: null,
  [MENU_IDS.gastoTicket]: null,
  [MENU_IDS.resumenOtroMes]: null,
  [MENU_IDS.gestoriaVerActual]: null,
  [MENU_IDS.gestoriaEnviarActual]: null,
  [MENU_IDS.gestoriaOtroTrim]: null,
  [MENU_IDS.clienteBuscar]: null,
  [MENU_IDS.clienteCrear]: null,
  [MENU_IDS.clienteBorrar]: null,
  [MENU_IDS.empresaIva]: null,
};

// ¿El texto recibido es un disparador del menú principal?
function isMenuTrigger(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[!¡.?¿]/g, "");
  return ["hola", "menu", "menú", "ayuda", "buenas", "hello", "hi", "start", "inicio"].includes(t);
}

// Detecta si el texto viene de una selección interactiva (marcador del webhook).
function extractMenuSelection(text: string | null | undefined): string | null {
  if (!text) return null;
  // Los ids pueden contener ':' (ej: cliente_pick:new, cliente_pick:<uuid>)
  // así que capturamos hasta el primer espacio o fin de línea.
  const m = text.match(/^__MENU__:(\S+)/);
  return m?.[1] ?? null;
}

// Envía menú principal (lista, porque hay >3 opciones).
async function enviarMenuPrincipal(to: string) {
  const r = await sendWhatsAppList(to, "👋 *¡Hola!* Soy tu asistente de Papeleo Fácil. Elige una opción:", "Ver menú", [
    {
      title: "Menú principal",
      rows: [
        { id: MENU_IDS.facturas, title: "📄 Facturas", description: "Crear, ver, cobrar, anular" },
        { id: MENU_IDS.gastos, title: "🧾 Gastos", description: "Registrar gasto o ticket" },
        { id: MENU_IDS.resumen, title: "📊 Resumen", description: "Ingresos, gastos, IVA del mes" },
        { id: MENU_IDS.gestoria, title: "📁 Gestoría", description: "Trimestre y envío al gestor" },
        { id: MENU_IDS.clientes, title: "👥 Clientes", description: "Listar, buscar, crear" },
        { id: MENU_IDS.empresa, title: "🏢 Empresa", description: "Datos, cambiar IVA" },
        { id: MENU_IDS.ayuda, title: "❓ Ayuda", description: "Ver todos los comandos" },
      ],
    },
  ]);
  // Fallback a texto si Meta rechaza el interactivo
  if (!r.ok && !(r as any).skipped) {
    await sendWhatsAppText(to, "👋 Menú: escribe FACTURAS, GASTOS, RESUMEN, GESTORIA, CLIENTES, EMPRESA o AYUDA.");
  }
  return r;
}

// Submenús específicos. Cada uno incluye "Volver al menú principal".
async function enviarSubmenu(to: string, key: string): Promise<any> {
  const volverRow = { id: MENU_IDS.volver, title: "↩️ Menú principal" };
  let body = "";
  let title = "";
  let rows: any[] = [];

  if (key === MENU_IDS.facturas) {
    body = "📄 *Facturas* — elige una acción:";
    title = "Facturas";
    rows = [
      { id: MENU_IDS.facturaCrear, title: "➕ Crear factura" },
      { id: MENU_IDS.facturasPendientes, title: "⏳ Ver pendientes" },
      { id: MENU_IDS.facturasCobradas, title: "✅ Ver cobradas" },
      { id: MENU_IDS.facturasMes, title: "📅 Ver por mes" },
      { id: MENU_IDS.facturaCobro, title: "💶 Marcar cobro" },
      { id: MENU_IDS.facturaVer, title: "🔍 Ver factura" },
      { id: MENU_IDS.facturaPdf, title: "📎 Enviar PDF" },
      { id: MENU_IDS.facturaAnular, title: "🚫 Anular factura" },
      volverRow,
    ];
  } else if (key === MENU_IDS.gastos) {
    body = "🧾 *Gastos* — elige una acción:";
    title = "Gastos";
    rows = [
      { id: MENU_IDS.gastoCrear, title: "➕ Registrar gasto" },
      { id: MENU_IDS.gastoTicket, title: "📷 Enviar ticket" },
      { id: MENU_IDS.gastosMes, title: "📅 Gastos del mes" },
      { id: MENU_IDS.gastosPendientes, title: "⏳ Pendientes" },
      volverRow,
    ];
  } else if (key === MENU_IDS.resumen) {
    // Pocas opciones → botones
    return await sendWhatsAppButtons(to, "📊 *Resumen* — ¿qué quieres ver?", [
      { id: MENU_IDS.resumenMesActual, title: "Este mes" },
      { id: MENU_IDS.resumenOtroMes, title: "Otro mes" },
      { id: MENU_IDS.volver, title: "Menú" },
    ]);
  } else if (key === MENU_IDS.gestoria) {
    body = "📁 *Gestoría* — elige una acción:";
    title = "Gestoría";
    rows = [
      { id: MENU_IDS.gestoriaVerActual, title: "🔍 Trimestre actual" },
      { id: MENU_IDS.gestoriaEnviarActual, title: "📨 Enviar trimestre" },
      { id: MENU_IDS.gestoriaOtroTrim, title: "📅 Otro trimestre" },
      volverRow,
    ];
  } else if (key === MENU_IDS.clientes) {
    body = "👥 *Clientes* — elige una acción:";
    title = "Clientes";
    rows = [
      { id: MENU_IDS.clientesVer, title: "📋 Ver clientes" },
      { id: MENU_IDS.clienteBuscar, title: "🔎 Buscar cliente" },
      { id: MENU_IDS.clienteCrear, title: "➕ Crear cliente" },
      { id: MENU_IDS.clienteBorrar, title: "🗑️ Borrar cliente" },
      volverRow,
    ];
  } else if (key === MENU_IDS.empresa) {
    return await sendWhatsAppButtons(to, "🏢 *Empresa* — ¿qué quieres hacer?", [
      { id: MENU_IDS.empresaVer, title: "Ver datos" },
      { id: MENU_IDS.empresaIva, title: "Cambiar IVA" },
      { id: MENU_IDS.volver, title: "Menú" },
    ]);
  } else {
    return await enviarMenuPrincipal(to);
  }

  const r = await sendWhatsAppList(to, body, "Ver opciones", [{ title, rows }]);
  if (!r.ok && !(r as any).skipped) {
    await sendWhatsAppText(to, body + "\n\n" + rows.map((r) => `• ${r.title}`).join("\n"));
  }
  return r;
}

// ============== PDF generators ==============
// Construye dirección multilínea (calle / CP ciudad / provincia)
function direccionMultilinea(p: any): string[] {
  if (!p) return [];
  const linea1 = (p.direccion ?? "").trim();
  const cp = (p.codigo_postal ?? "").trim();
  const ciudad = (p.ciudad ?? "").trim();
  const prov = (p.provincia ?? "").trim();
  const linea2 = [cp, ciudad].filter(Boolean).join(" ");
  return [linea1, linea2, prov].filter((s: string) => s && s.length > 0);
}

// Estilos por plantilla — coherentes con src/lib/pdf.ts
const PDF_STYLES: Record<string, any> = {
  profesional: { font: "helvetica", primary: [28, 78, 145], primarySoft: [240, 245, 252], accent: [28, 78, 145], headerKind: "band", totalKind: "filled", titulo: "FACTURA" },
  creativa:    { font: "helvetica", primary: [255, 122, 41], primarySoft: [255, 240, 225], accent: [255, 122, 41], headerKind: "side", totalKind: "underline", titulo: "Factura" },
  corporativa: { font: "helvetica", primary: [25, 25, 25],   primarySoft: [240, 240, 240], accent: [25, 25, 25],   headerKind: "boxed", totalKind: "border", titulo: "FACTURA" },
  elegante:    { font: "times",     primary: [120, 90, 50],  primarySoft: [248, 244, 235], accent: [180, 160, 130], headerKind: "minimal", totalKind: "underline", titulo: "Factura" },
  personalizada: { font: "helvetica", primary: [40, 60, 90], primarySoft: [240, 244, 250], accent: [40, 60, 90], headerKind: "custom", totalKind: "filled", titulo: "FACTURA" },
};

function hexToRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null;
  const m = String(hex).replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function lightenRgb(rgb: [number, number, number], f = 0.9): [number, number, number] {
  return [Math.round(rgb[0] + (255 - rgb[0]) * f), Math.round(rgb[1] + (255 - rgb[1]) * f), Math.round(rgb[2] + (255 - rgb[2]) * f)];
}

// Genera PDF de factura conforme a RD 1619/2012 (versión simplificada del renderer web).
function pdfFactura(data: any): Uint8Array {
  const tplId = (data.template ?? "profesional") as string;
  let s = PDF_STYLES[tplId] ?? PDF_STYLES.profesional;
  if (tplId === "personalizada" && data.custom) {
    const p = hexToRgb(data.custom.color_primario);
    const a = hexToRgb(data.custom.color_acento);
    if (p) s = { ...s, primary: p, primarySoft: lightenRgb(p, 0.9), accent: a ?? p };
    else if (a) s = { ...s, accent: a };
  }
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  const ivaDef = Number(data.iva_porcentaje) || 0;
  const lineasIn: any[] = Array.isArray(data.lineas) && data.lineas.length
    ? data.lineas
    : [{ concepto: data.concepto, importe: Number(data.base_imponible) }];
  const lineas = lineasIn.map((l: any) => {
    const cantidad = Number(l.cantidad ?? 1) || 1;
    const precio_unitario = Number(l.precio_unitario ?? (Number(l.importe) / cantidad)) || 0;
    const descuento = Number(l.descuento_porcentaje ?? 0) || 0;
    const iva = Number(l.iva_porcentaje ?? ivaDef) || 0;
    const base = Number(l.importe ?? cantidad * precio_unitario * (1 - descuento / 100));
    return { concepto: String(l.concepto ?? ""), cantidad, precio_unitario, descuento_porcentaje: descuento, iva_porcentaje: iva, importe: +base.toFixed(2) };
  });

  // Desglose IVA agrupado por tipo
  const ivaMap = new Map<number, { base: number; cuota: number }>();
  for (const l of lineas) {
    const tipo = Number(l.iva_porcentaje) || 0;
    const base = Number(l.importe) || 0;
    const cuota = +(base * tipo / 100).toFixed(2);
    const acc = ivaMap.get(tipo) ?? { base: 0, cuota: 0 };
    acc.base = +(acc.base + base).toFixed(2);
    acc.cuota = +(acc.cuota + cuota).toFixed(2);
    ivaMap.set(tipo, acc);
  }
  const desglose = Array.from(ivaMap.entries()).sort((a, b) => a[0] - b[0]).map(([tipo, v]) => ({ tipo, base: v.base, cuota: v.cuota }));

  const baseTotal = +lineas.reduce((acc, l) => acc + (Number(l.importe) || 0), 0).toFixed(2);
  const ivaTotal = +desglose.reduce((acc, d) => acc + d.cuota, 0).toFixed(2);
  const irpfPct = Number(data.irpf_porcentaje ?? 0);
  const irpfImporte = data.irpf_importe != null ? Number(data.irpf_importe) : +(baseTotal * irpfPct / 100).toFixed(2);
  const total = data.total != null ? Number(data.total) : +(baseTotal + ivaTotal - irpfImporte).toFixed(2);

  const esRect = data.tipo === "rectificativa";
  const tituloDoc = esRect ? (s.titulo === "FACTURA" ? "FACTURA RECTIFICATIVA" : "Factura rectificativa") : s.titulo;

  // ===== CABECERA =====
  let y = 50;
  if (s.headerKind === "custom") {
    const c = data.custom ?? {};
    doc.setFillColor(s.primary[0], s.primary[1], s.primary[2]);
    doc.rect(0, 0, W, 6, "F");
    y = 50;
    let logoBottom = y;
    if (c.logo_data_url) {
      try {
        const fmt = String(c.logo_data_url).includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(c.logo_data_url, fmt, 40, y - 10, 110, 60, undefined, "FAST");
        logoBottom = y - 10 + 60;
      } catch { /* ignore */ }
    }
    doc.setFont(s.font, "bold"); doc.setFontSize(13); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
    const en = doc.splitTextToSize(data.emisor?.nombre ?? "", W / 2 - 20)[0];
    doc.text(en, W - 40, y, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(90);
    let yy = y + 14;
    if (data.emisor?.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 11; }
    if (data.emisor?.email) { doc.text(data.emisor.email, W - 40, yy, { align: "right" }); yy += 11; }
    if (data.emisor?.telefono) { doc.text(`Tel. ${data.emisor.telefono}`, W - 40, yy, { align: "right" }); yy += 11; }
    y = Math.max(logoBottom, yy) + 14;
    if (c.encabezado) {
      doc.setFont(s.font, "italic"); doc.setFontSize(9); doc.setTextColor(110);
      const lines = doc.splitTextToSize(c.encabezado, W - 80);
      doc.text(lines, 40, y);
      y += lines.length * 11 + 8;
    }
    doc.setDrawColor(s.accent[0], s.accent[1], s.accent[2]); doc.setLineWidth(0.6); doc.line(40, y, W - 40, y); y += 18;
    doc.setFont(s.font, "bold"); doc.setFontSize(esRect ? 16 : 20); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
    doc.text(tituloDoc, 40, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(`Nº ${data.numero}  ·  Expedición ${fechaCorta(data.fecha)}`, W - 40, y, { align: "right" });
    y += 18;
  } else if (s.headerKind === "band") {
    const emisorLineas = direccionMultilinea(data.emisor).length + (data.emisor?.nif ? 1 : 0);
    const bandH = Math.max(80, 36 + emisorLineas * 11 + 10);
    doc.setFillColor(s.primary[0], s.primary[1], s.primary[2]);
    doc.rect(0, 0, W, bandH, "F");
    doc.setTextColor(255);
    doc.setFont(s.font, "bold"); doc.setFontSize(esRect ? 18 : 24);
    doc.text(tituloDoc, 40, 40);
    doc.setFont(s.font, "normal"); doc.setFontSize(10);
    doc.text(`Nº ${data.numero}    ·    Expedición: ${fechaCorta(data.fecha)}`, 40, 58);
    doc.setFont(s.font, "bold"); doc.setFontSize(11);
    const emisorNombre = doc.splitTextToSize(data.emisor?.nombre ?? "", W / 2 - 20)[0];
    doc.text(emisorNombre, W - 40, 28, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(9);
    let yy = 42;
    if (data.emisor?.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 11; }
    y = bandH + 20;
  } else if (s.headerKind === "side") {
    doc.setFillColor(s.primary[0], s.primary[1], s.primary[2]); doc.rect(0, 0, 14, H, "F");
    doc.setFillColor(s.primarySoft[0], s.primarySoft[1], s.primarySoft[2]); doc.rect(14, 0, 6, H, "F");
    y = 60;
    doc.setFont(s.font, "bold"); doc.setFontSize(esRect ? 22 : 28); doc.setTextColor(40, 30, 25);
    doc.text(tituloDoc, 40, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(11); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
    doc.text(`#${data.numero}`, 40, y + 18);
    doc.setTextColor(110);
    doc.text(`Expedición: ${fechaCorta(data.fecha)}`, 40, y + 34);
    doc.setFont(s.font, "bold"); doc.setFontSize(12); doc.setTextColor(40);
    const en = doc.splitTextToSize(data.emisor?.nombre ?? "", W / 2 - 40)[0];
    doc.text(en, W - 40, y, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(110);
    let yy = y + 14;
    if (data.emisor?.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 11; }
    if (data.emisor?.email) { doc.text(data.emisor.email, W - 40, yy, { align: "right" }); yy += 11; }
    y = Math.max(y + 60, yy + 16);
  } else if (s.headerKind === "boxed") {
    doc.setFillColor(s.primary[0], s.primary[1], s.primary[2]); doc.rect(0, 0, W, 4, "F");
    doc.setFont(s.font, "bold"); doc.setFontSize(16); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
    const en = doc.splitTextToSize(data.emisor?.nombre ?? "", W - 240 - 40)[0];
    doc.text(en, 40, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(90);
    let yy = y + 14;
    if (data.emisor?.nif) { doc.text(`NIF: ${data.emisor.nif}`, 40, yy); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, 40, yy); yy += 11; }
    if (data.emisor?.telefono) { doc.text(`Tel. ${data.emisor.telefono}`, 40, yy); yy += 11; }
    if (data.emisor?.email) { doc.text(data.emisor.email, 40, yy); yy += 11; }
    doc.setDrawColor(s.primary[0], s.primary[1], s.primary[2]); doc.setLineWidth(0.8);
    const boxH = data.fecha_operacion ? 80 : 64;
    doc.rect(W - 220, y - 14, 180, boxH, "S");
    doc.setFont(s.font, "bold"); doc.setFontSize(11); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
    doc.text(tituloDoc, W - 210, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(90);
    doc.text(`Nº ${data.numero}`, W - 210, y + 14);
    doc.text(`Expedición: ${fechaCorta(data.fecha)}`, W - 210, y + 28);
    if (data.fecha_operacion) doc.text(`Operación: ${fechaCorta(data.fecha_operacion)}`, W - 210, y + 42);
    y = Math.max(yy, y - 14 + boxH) + 16;
  } else {
    // minimal (elegante)
    y = 60;
    doc.setFont(s.font, "italic"); doc.setFontSize(esRect ? 22 : 28); doc.setTextColor(60, 50, 40);
    doc.text(tituloDoc, 40, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(10); doc.setTextColor(120);
    doc.text(`Nº ${data.numero}  ·  Expedición ${fechaCorta(data.fecha)}`, 40, y + 16);
    doc.setFont(s.font, "bold"); doc.setFontSize(12); doc.setTextColor(60, 50, 40);
    const en = doc.splitTextToSize(data.emisor?.nombre ?? "", W / 2 - 40)[0];
    doc.text(en, W - 40, y, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(10); doc.setTextColor(110);
    let yy = y + 14;
    if (data.emisor?.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 12; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 12; }
    y = Math.max(y + 50, yy + 16);
    doc.setDrawColor(s.accent[0], s.accent[1], s.accent[2]); doc.setLineWidth(0.4); doc.line(40, y, W - 40, y); y += 24;
  }

  // ===== Fechas extra =====
  if (s.headerKind !== "boxed" && (data.fecha_operacion || data.fecha_vencimiento)) {
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(110);
    const parts: string[] = [];
    if (data.fecha_operacion) parts.push(`Fecha de operación: ${fechaCorta(data.fecha_operacion)}`);
    if (data.fecha_vencimiento) parts.push(`Vencimiento: ${fechaCorta(data.fecha_vencimiento)}`);
    doc.text(parts.join("  ·  "), 40, y);
    y += 16;
  }

  // ===== CLIENTE =====
  const cliDirLines = direccionMultilinea(data.cliente).length;
  const cliExtraLines = (data.cliente?.nif ? 1 : 0) + cliDirLines;
  const cliBoxH = Math.max(70, 40 + cliExtraLines * 11 + 10);
  doc.setFillColor(s.primarySoft[0], s.primarySoft[1], s.primarySoft[2]);
  doc.rect(40, y, W - 80, cliBoxH, "F");
  doc.setFont(s.font, "bold"); doc.setFontSize(10); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
  doc.text("FACTURAR A", 52, y + 16);
  doc.setTextColor(40); doc.setFontSize(11);
  if (data.cliente) {
    doc.text(data.cliente.nombre ?? "", 52, y + 32);
    doc.setFont(s.font, "normal"); doc.setFontSize(9);
    let cy = y + 46;
    if (data.cliente.nif) { doc.text(`NIF: ${data.cliente.nif}`, 52, cy); cy += 11; }
    for (const l of direccionMultilinea(data.cliente)) { doc.text(l, 52, cy); cy += 11; }
  } else {
    doc.text("Cliente sin asignar", 52, y + 32);
  }
  y += cliBoxH + 20;

  // ===== TABLA LÍNEAS =====
  const rightEdge = W - 40;
  const colImporte = rightEdge - 10;
  const colIva = colImporte - 75;
  const colDto = colIva - 50;
  const colPrecio = colDto - 55;
  const colCant = colPrecio - 70;
  const colConceptoX = 52;
  const conceptoMaxX = colCant - 50;
  doc.setFillColor(s.primary[0], s.primary[1], s.primary[2]);
  doc.rect(40, y, W - 80, 26, "F");
  doc.setFont(s.font, "bold"); doc.setFontSize(9); doc.setTextColor(255);
  doc.text("Concepto", colConceptoX, y + 17);
  doc.text("Cant.", colCant, y + 17, { align: "right" });
  doc.text("Precio", colPrecio, y + 17, { align: "right" });
  doc.text("Dto%", colDto, y + 17, { align: "right" });
  doc.text("IVA%", colIva, y + 17, { align: "right" });
  doc.text("Importe", colImporte, y + 17, { align: "right" });
  y += 26 + 18;
  doc.setTextColor(40); doc.setFont(s.font, "normal"); doc.setFontSize(9);
  for (const ln of lineas) {
    const wrapped = doc.splitTextToSize(ln.concepto, conceptoMaxX - colConceptoX);
    doc.text(wrapped, colConceptoX, y);
    doc.text(String(ln.cantidad), colCant, y, { align: "right" });
    doc.text(eur(ln.precio_unitario), colPrecio, y, { align: "right" });
    doc.text(ln.descuento_porcentaje ? `${ln.descuento_porcentaje}%` : "—", colDto, y, { align: "right" });
    doc.text(`${ln.iva_porcentaje}%`, colIva, y, { align: "right" });
    doc.text(eur(ln.importe), colImporte, y, { align: "right" });
    y += Math.max(wrapped.length * 12, 14) + 10;
    if (y > H - 200) { doc.addPage(); y = 60; }
  }

  // ===== TOTALES =====
  y += 10;
  doc.setDrawColor(s.accent[0], s.accent[1], s.accent[2]); doc.setLineWidth(0.6); doc.line(W - 280, y, W - 40, y); y += 16;
  doc.setFont(s.font, "normal"); doc.setFontSize(10); doc.setTextColor(40);
  doc.text("Base imponible", W - 280, y); doc.text(eur(baseTotal), W - 40, y, { align: "right" }); y += 14;
  for (const d of desglose) {
    const label = d.tipo === 0 ? "IVA exento (0%)" : `IVA ${d.tipo}% s/ ${eur(d.base)}`;
    doc.text(label, W - 280, y);
    doc.text(eur(d.cuota), W - 40, y, { align: "right" });
    y += 14;
  }
  if (irpfPct > 0 || irpfImporte !== 0) {
    doc.setTextColor(160, 30, 30);
    doc.text(`Retención IRPF (${irpfPct}%)`, W - 280, y);
    doc.text(`-${eur(Math.abs(irpfImporte))}`, W - 40, y, { align: "right" });
    y += 16;
    doc.setTextColor(40);
  } else {
    y += 4;
  }
  if (s.totalKind === "filled") {
    doc.setFillColor(s.primary[0], s.primary[1], s.primary[2]); doc.rect(W - 280, y - 14, 240, 30, "F");
    doc.setTextColor(255); doc.setFont(s.font, "bold"); doc.setFontSize(13);
    doc.text("TOTAL FACTURA", W - 270, y + 6);
    doc.text(eur(total), W - 50, y + 6, { align: "right" });
  } else if (s.totalKind === "border") {
    doc.setDrawColor(s.primary[0], s.primary[1], s.primary[2]); doc.setLineWidth(1); doc.line(W - 280, y - 4, W - 40, y - 4);
    doc.setFont(s.font, "bold"); doc.setFontSize(13); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
    doc.text("TOTAL FACTURA", W - 280, y + 12);
    doc.text(eur(total), W - 40, y + 12, { align: "right" });
  } else {
    doc.setDrawColor(s.primary[0], s.primary[1], s.primary[2]); doc.setLineWidth(0.8); doc.line(W - 280, y - 4, W - 40, y - 4);
    doc.setFont(s.font, "bold"); doc.setFontSize(15); doc.setTextColor(s.primary[0], s.primary[1], s.primary[2]);
    doc.text("TOTAL", W - 280, y + 14);
    doc.text(eur(total), W - 40, y + 14, { align: "right" });
  }
  y += 44;

  // ===== Forma de pago / Mención legal / Notas =====
  doc.setTextColor(60); doc.setFont(s.font, "normal"); doc.setFontSize(9);
  if (data.metodo_pago) { doc.text(`Forma de pago: ${data.metodo_pago}`, 40, y); y += 12; }
  if (data.mencion_legal) {
    doc.setFont(s.font, "bold");
    doc.text("Mención legal:", 40, y); y += 12;
    doc.setFont(s.font, "normal");
    const wrapped = doc.splitTextToSize(String(data.mencion_legal), W - 80);
    doc.text(wrapped, 40, y);
    y += wrapped.length * 11 + 4;
  }
  if (data.notas) {
    doc.setFont(s.font, "italic"); doc.setTextColor(110);
    const wrapped = doc.splitTextToSize(`Notas: ${data.notas}`, W - 80);
    doc.text(wrapped, 40, y);
    y += wrapped.length * 11;
  }
  if (data.template === "personalizada" && data.custom?.pie) {
    y += 8;
    doc.setDrawColor(s.accent[0], s.accent[1], s.accent[2]); doc.setLineWidth(0.4); doc.line(40, y, W - 40, y); y += 12;
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(90);
    const wrapped = doc.splitTextToSize(String(data.custom.pie), W - 80);
    doc.text(wrapped, 40, y);
  }

  // Pie
  doc.setFont(s.font, "normal"); doc.setFontSize(8); doc.setTextColor(140);
  doc.text(
    "Documento generado con Papeleo Fácil WhatsApp · Conserve esta factura durante al menos 4 años (RD 1619/2012).",
    W / 2,
    doc.internal.pageSize.getHeight() - 24,
    { align: "center" },
  );

  return new Uint8Array(doc.output("arraybuffer"));
}

function pdfResumenTrimestre(d: any): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 50;
  doc.setFillColor(34, 139, 80);
  doc.rect(0, 0, W, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(20, 60, 40);
  doc.text(`Resumen Trimestre ${d.trimestre}/${d.anio}`, 40, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(d.empresa, W - 40, y, { align: "right" });
  if (d.nif) {
    doc.setFont("helvetica", "normal");
    doc.text(`NIF: ${d.nif}`, W - 40, y + 16, { align: "right" });
  }
  y += 60;
  doc.setDrawColor(220);
  doc.line(40, y, W - 40, y);
  y += 30;
  doc.setTextColor(40);
  doc.setFontSize(11);
  const filas: [string, string][] = [
    ["Facturas emitidas", String(d.facturasCount)],
    ["Total ingresos", eur(d.ingresos)],
    ["IVA repercutido", eur(d.ivaRep)],
    ["", ""],
    ["Gastos registrados", String(d.gastosCount)],
    ["Total gastos", eur(d.gastos)],
    ["IVA soportado", eur(d.ivaSop)],
  ];
  for (const [k, v] of filas) {
    if (!k && !v) {
      y += 8;
      continue;
    }
    doc.setFont("helvetica", "normal");
    doc.text(k, 40, y);
    doc.setFont("helvetica", "bold");
    doc.text(v, W - 40, y, { align: "right" });
    y += 18;
  }
  y += 14;
  doc.setDrawColor(220);
  doc.line(40, y, W - 40, y);
  y += 24;
  doc.setFillColor(240, 248, 244);
  doc.rect(40, y - 18, W - 80, 80, "F");
  doc.setTextColor(20, 60, 40);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("RESULTADO BRUTO", 56, y);
  doc.setFontSize(16);
  doc.text(eur(d.ingresos - d.gastos), W - 56, y, { align: "right" });
  doc.setFontSize(10);
  y += 26;
  doc.text("IVA A LIQUIDAR", 56, y);
  doc.setFontSize(14);
  const ivaR = d.ivaRep - d.ivaSop;
  doc.text(`${ivaR >= 0 ? "A pagar " : "A devolver "}${eur(Math.abs(ivaR))}`, W - 56, y, { align: "right" });
  return new Uint8Array(doc.output("arraybuffer"));
}

// ============== Helpers de PDF + envío ==============
async function generarYEnviarFacturaPDF(supabase: any, invoiceId: string, replyTo: string) {
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "*, clients(nombre, nif, direccion, codigo_postal, ciudad, provincia), companies(nombre_comercial, nif, direccion, codigo_postal, ciudad, provincia, email, telefono, factura_template, factura_logo_url, factura_color_primario, factura_color_acento, factura_encabezado, factura_pie)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv) return { error: "Factura no encontrada" };
  // Cargar logo personalizado como data URL si aplica
  let logoDataUrl: string | null = null;
  if (inv.companies?.factura_template === "personalizada" && inv.companies?.factura_logo_url) {
    try {
      const r = await fetch(inv.companies.factura_logo_url);
      const ab = await r.arrayBuffer();
      const ct = r.headers.get("content-type") || "image/png";
      const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      logoDataUrl = `data:${ct};base64,${b64}`;
    } catch { /* ignore */ }
  }
  const { data: lineasDB } = await supabase
    .from("invoice_lines")
    .select("concepto, cantidad, precio_unitario, descuento_porcentaje, iva_porcentaje, iva_importe, importe, total, orden")
    .eq("invoice_id", invoiceId)
    .order("orden", { ascending: true });
  let rectInfo: { numero: string; fecha: string } | null = null;
  if (inv.factura_rectificada_id) {
    const { data: r } = await supabase
      .from("invoices")
      .select("numero, fecha")
      .eq("id", inv.factura_rectificada_id)
      .maybeSingle();
    if (r) rectInfo = { numero: r.numero, fecha: r.fecha };
  }
  const pdfBytes = pdfFactura({
    numero: inv.numero,
    serie: inv.serie,
    fecha: inv.fecha,
    fecha_operacion: inv.fecha_operacion,
    fecha_vencimiento: inv.fecha_vencimiento,
    concepto: inv.concepto,
    base_imponible: Number(inv.base_imponible),
    iva_porcentaje: Number(inv.iva_porcentaje),
    iva_importe: Number(inv.iva_importe),
    irpf_porcentaje: Number(inv.irpf_porcentaje ?? 0),
    irpf_importe: Number(inv.irpf_importe ?? 0),
    total: Number(inv.total),
    notas: inv.notas,
    metodo_pago: inv.metodo_pago,
    tipo: inv.tipo,
    factura_rectificada: rectInfo,
    motivo_rectificacion: inv.motivo_rectificacion,
    mencion_legal: inv.mencion_legal,
    template: inv.companies?.factura_template ?? "profesional",
    custom: inv.companies?.factura_template === "personalizada" ? {
      color_primario: inv.companies?.factura_color_primario,
      color_acento: inv.companies?.factura_color_acento,
      encabezado: inv.companies?.factura_encabezado,
      pie: inv.companies?.factura_pie,
      logo_data_url: logoDataUrl,
    } : null,
    lineas: (lineasDB ?? []).map((l: any) => ({
      concepto: l.concepto,
      cantidad: Number(l.cantidad ?? 1),
      precio_unitario: Number(l.precio_unitario ?? 0),
      descuento_porcentaje: Number(l.descuento_porcentaje ?? 0),
      iva_porcentaje: Number(l.iva_porcentaje ?? inv.iva_porcentaje ?? 0),
      importe: Number(l.importe ?? 0),
    })),
    emisor: {
      nombre: inv.companies?.nombre_comercial ?? "Empresa",
      nif: inv.companies?.nif,
      direccion: inv.companies?.direccion,
      codigo_postal: inv.companies?.codigo_postal,
      ciudad: inv.companies?.ciudad,
      provincia: inv.companies?.provincia,
      email: inv.companies?.email,
      telefono: inv.companies?.telefono,
    },
    cliente: inv.clients
      ? {
          nombre: inv.clients.nombre,
          nif: inv.clients.nif,
          direccion: inv.clients.direccion,
          codigo_postal: inv.clients.codigo_postal,
          ciudad: inv.clients.ciudad,
          provincia: inv.clients.provincia,
        }
      : null,
  });
  const path = `${inv.company_id}/factura-${inv.numero}.pdf`;
  await supabase.storage.from("invoices").upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
  await supabase.from("invoices").update({ pdf_path: path }).eq("id", invoiceId);
  const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(path, 60 * 60 * 24);
  if (signed?.signedUrl) {
    await sendWhatsAppDocument(
      replyTo,
      signed.signedUrl,
      `factura-${inv.numero}.pdf`,
      `Factura ${inv.numero} · ${eur(Number(inv.total))}`,
    );
  }
  return { ok: true, url: signed?.signedUrl };
}

// ============== OCR con Google Cloud Vision ==============
// Descarga el adjunto de Storage, lo manda a Vision y aplica heurísticas
// para devolver { fecha, proveedor, concepto, base, iva_porcentaje, iva_importe, total, categoria }.
function _ocrToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function _ocrParseAmount(s: string): number | null {
  if (!s) return null;
  let t = s.replace(/[^\d.,-]/g, "");
  if (t.includes(",") && t.includes(".")) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  }
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}
function _ocrParseDate(text: string): string | null {
  const m1 = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m1) {
    let [_, d, mo, y] = m1;
    if (y.length === 2) y = (parseInt(y) > 50 ? "19" : "20") + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}
function _ocrNormalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\r/g, "")
    .trim();
}

function _ocrSafeNumber(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

function _ocrUniqueNumbersFromText(text: string): number[] {
  const matches = text.match(/-?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2})|-?\d+[.,]\d{2}/g) ?? [];
  const nums = matches
    .map((m) => _ocrParseAmount(m))
    .filter((n): n is number => n != null && Number.isFinite(n) && Math.abs(n) < 100000);

  const seen = new Set<string>();
  return nums.filter((n) => {
    const k = n.toFixed(2);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function _ocrGuessCategoria(text: string): string {
  const t = _ocrNormalize(text).toLowerCase();

  const rules: { categoria: string; words: RegExp[] }[] = [
    {
      categoria: "combustible",
      words: [
        /\bgasolin/,
        /\bgasoil/,
        /\bdiesel/,
        /\bdi[ée]sel/,
        /\bcarburante/,
        /\bcombustible/,
        /\brepsol\b/,
        /\bcepsa\b/,
        /\bgalp\b/,
        /\bbp\b/,
        /\bshell\b/,
        /\bpetromiralles\b/,
      ],
    },
    {
      categoria: "dietas",
      words: [
        /\brestaurant/,
        /\brestaurante/,
        /\bbar\b/,
        /\bcafeter/,
        /\bmenu\b/,
        /\bmenu del dia\b/,
        /\bcomida\b/,
        /\bcena\b/,
        /\bdesayuno\b/,
        /\bdieta/,
        /\btapas\b/,
      ],
    },
    {
      categoria: "suministros",
      words: [
        /\bluz\b/,
        /\bagua\b/,
        /\belectric/,
        /\bgas natural\b/,
        /\bsuministro/,
        /\biberdrola\b/,
        /\bendesa\b/,
        /\bnaturgy\b/,
        /\bred electrica\b/,
      ],
    },
    {
      categoria: "material",
      words: [
        /\bferreter/,
        /\btornill/,
        /\bherramient/,
        /\bmaterial/,
        /\bbrico/,
        /\bbricomart\b/,
        /\bleroy\b/,
        /\bobra\b/,
        /\bpintura\b/,
        /\bmadera\b/,
      ],
    },
    {
      categoria: "transporte",
      words: [
        /\btaxi\b/,
        /\buber\b/,
        /\bcabify\b/,
        /\brenfe\b/,
        /\bave\b/,
        /\bbus\b/,
        /\bpeaje\b/,
        /\bparking\b/,
        /\baparcami/,
        /\bautopista\b/,
        /\bmetro\b/,
      ],
    },
    {
      categoria: "telefonia",
      words: [
        /\bmovistar\b/,
        /\bvodafone\b/,
        /\borange\b/,
        /\byoigo\b/,
        /\btelefono\b/,
        /\bmovil\b/,
        /\bfibra\b/,
        /\bsim\b/,
        /\bdatos\b/,
        /\binternet\b/,
      ],
    },
    {
      categoria: "software",
      words: [
        /\bmicrosoft\b/,
        /\bgoogle\b/,
        /\badobe\b/,
        /\bsaas\b/,
        /\bsoftware\b/,
        /\blicencia\b/,
        /\bsuscripci/,
        /\bhosting\b/,
        /\bdominio\b/,
        /\bopenai\b/,
      ],
    },
  ];

  let best = { categoria: "otros", score: 0 };

  for (const rule of rules) {
    const score = rule.words.reduce((acc, rx) => acc + (rx.test(t) ? 1 : 0), 0);
    if (score > best.score) best = { categoria: rule.categoria, score };
  }

  return best.categoria;
}

function _ocrGuessProveedor(lines: string[]): string | null {
  const blacklist = [
    /factura/i,
    /ticket/i,
    /recibo/i,
    /fecha/i,
    /hora/i,
    /cif/i,
    /nif/i,
    /iva/i,
    /base imponible/i,
    /subtotal/i,
    /total/i,
    /cliente/i,
    /pagina/i,
    /tpv/i,
  ];

  const scored = lines
    .slice(0, 8)
    .map((line) => {
      const clean = line.trim().replace(/\s{2,}/g, " ");
      if (!clean) return null;
      if (blacklist.some((rx) => rx.test(clean))) return null;
      if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(clean)) return null;

      let score = 0;
      if (/^[A-ZÁÉÍÓÚÑ0-9 .&\-]{4,}$/u.test(clean)) score += 3;
      if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(clean)) score += 2;
      if (clean.length >= 5 && clean.length <= 60) score += 2;
      if (!/\b\d{5,}\b/.test(clean)) score += 1;
      if (!/[€%]/.test(clean)) score += 1;

      return { line: clean.slice(0, 80), score };
    })
    .filter(Boolean) as { line: string; score: number }[];

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.line ?? null;
}

function _ocrFindLabeledAmount(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const rx = new RegExp(
      `${label}[^\\d-]{0,20}([\\-]?\\d{1,3}(?:[.\\s]\\d{3})*(?:[.,]\\d{2})|[\\-]?\\d+[.,]\\d{2})\\s*€?`,
      "i",
    );
    const m = text.match(rx);
    if (m?.[1]) {
      const n = _ocrParseAmount(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

function _ocrFindIvaPercent(text: string): number | null {
  const matches = [...text.matchAll(/\biva\b[^\d%]{0,12}(\d{1,2}(?:[.,]\d+)?)\s*%/gi)];
  for (const m of matches) {
    const n = _ocrParseAmount(m[1]);
    if (n != null && n >= 0 && n <= 100) return n;
  }

  const generic = [...text.matchAll(/\b(4|10|21)(?:[.,]0+)?\s*%/g)];
  for (const m of generic) {
    const n = _ocrParseAmount(m[1]);
    if (n != null) return n;
  }

  return null;
}

function _ocrFindLikelyTotal(text: string, lines: string[]): number | null {
  const normalized = _ocrNormalize(text);

  const labeled = _ocrFindLabeledAmount(normalized, [
    "total\\s+a\\s+pagar",
    "importe\\s+total",
    "total\\s+factura",
    "total",
  ]);
  if (labeled != null) return labeled;

  const bottomLines = lines.slice(-6).join("\n");
  const nums = _ocrUniqueNumbersFromText(bottomLines).sort((a, b) => b - a);

  return nums[0] ?? null;
}

function _ocrExtractFromText(fullText: string) {
  const normalized = _ocrNormalize(fullText);
  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let total: number | null = _ocrFindLikelyTotal(normalized, lines);

  let iva_importe: number | null = _ocrFindLabeledAmount(normalized, ["cuota\\s+iva", "iva", "i\\.v\\.a\\."]);

  let iva_porcentaje: number | null = _ocrFindIvaPercent(normalized);

  let base: number | null = _ocrFindLabeledAmount(normalized, ["base\\s+imponible", "subtotal", "base"]);

  const allNumbers = _ocrUniqueNumbersFromText(normalized).sort((a, b) => b - a);

  if (total == null && allNumbers.length) {
    total = allNumbers[0];
  }

  if (base == null && total != null && iva_importe != null) {
    const calcBase = +(total - iva_importe).toFixed(2);
    if (calcBase >= 0) base = calcBase;
  }

  if (iva_importe == null && total != null && base != null) {
    const calcIva = +(total - base).toFixed(2);
    if (calcIva >= 0) iva_importe = calcIva;
  }

  if (iva_porcentaje == null && base != null && iva_importe != null && base > 0) {
    const pct = (iva_importe / base) * 100;
    const rounded = Math.round(pct);
    if ([4, 10, 21].includes(rounded)) iva_porcentaje = rounded;
    else if (pct >= 0 && pct <= 100) iva_porcentaje = +pct.toFixed(2);
  }

  if (iva_porcentaje == null && iva_importe != null && iva_importe === 0) {
    iva_porcentaje = 0;
  }

  const fecha = _ocrParseDate(normalized) ?? new Date().toISOString().slice(0, 10);
  const proveedor = _ocrGuessProveedor(lines);
  const categoria = _ocrGuessCategoria(normalized);
  const concepto = proveedor ? `Compra en ${proveedor}` : "Ticket por WhatsApp";

  let confianza = 0;
  if (proveedor) confianza += 1;
  if (fecha) confianza += 1;
  if (total != null) confianza += 2;
  if (base != null) confianza += 1;
  if (iva_importe != null) confianza += 1;
  if (iva_porcentaje != null) confianza += 1;

  return {
    fecha,
    proveedor,
    concepto,
    base,
    iva_porcentaje,
    iva_importe,
    total,
    categoria,
    confianza, // 0-7
    raw_candidates: {
      all_numbers: allNumbers,
    },
  };
}

async function ocrTicketConIA(supabase: any, attachmentPath: string) {
  const visionKey = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
  if (!visionKey) return { error: "GOOGLE_CLOUD_VISION_API_KEY no configurada" };

  const { data: file, error: dlErr } = await supabase.storage.from("wa-attachments").download(attachmentPath);
  if (dlErr || !file) return { error: `descarga: ${dlErr?.message ?? "sin archivo"}` };
  const buf = new Uint8Array(await file.arrayBuffer());
  const b64 = _ocrToBase64(buf);

  const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: b64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          imageContext: { languageHints: ["es", "en"] },
        },
      ],
    }),
  });
  if (!visionRes.ok) {
    const t = await visionRes.text();
    return { error: `Vision ${visionRes.status}: ${t.slice(0, 200)}` };
  }
  const vJson = await visionRes.json();
  const fullText: string =
    vJson?.responses?.[0]?.fullTextAnnotation?.text ?? vJson?.responses?.[0]?.textAnnotations?.[0]?.description ?? "";
  if (!fullText) return { error: "Vision no detectó texto" };

  const extracted = _ocrExtractFromText(fullText);
  if (extracted.total == null) {
    return { error: "no se encontró importe total", extracted, raw_text: fullText };
  }
  return { extracted, raw_text: fullText };
}

// ============== Help ==============
const HELP_TEXT = `📋 *Comandos disponibles*

*FACTURACIÓN*
• FACTURA <importe> <concepto> a <cliente>
• FACTURAS pendientes  ·  FACTURAS mes
• FACTURA VER <nº>  ·  FACTURA PDF <nº>
• FACTURA ANULAR <nº>
• COBRO <nº factura>

*GASTOS*
• GASTO <concepto> <importe>
• GASTOS mes  ·  GASTOS pendientes
• 📷 Envía una *foto del ticket* para crear gasto automático

*CLIENTES*
• CLIENTE NUEVO <nombre> [tel] [email] [NIF]
• CLIENTES  (lista)
• CLIENTE BUSCAR <texto>
• CLIENTE BORRAR <nombre>

*EMPRESA / GESTORÍA*
• EMPRESA  (datos)
• EMPRESA IVA <%>
• RESUMEN <mes>
• GESTORIA trimestre <n>
• GESTORIA ENVIAR trimestre <n>  (manda PDF al gestor)

• AYUDA — este mensaje`;

// ============== Confirmación de TICKET (OCR) ==============
// IDs estables de los botones / filas usados en la confirmación.
const TICKET_IDS = {
  confirm: "ticket_confirm",
  edit: "ticket_edit",
  cancel: "ticket_cancel",
  // Campos editables — el id va con prefijo "ticket_field:<campo>"
  fields: ["proveedor", "concepto", "fecha", "categoria", "base", "iva_porcentaje", "total"] as const,
} as const;

const FIELD_LABELS: Record<string, string> = {
  proveedor: "🏷️ Proveedor",
  concepto: "📝 Concepto",
  fecha: "📅 Fecha",
  categoria: "📂 Categoría",
  base: "💶 Base imponible",
  iva_porcentaje: "📊 IVA %",
  total: "💰 Total",
};

function resumenTicket(d: any): string {
  return [
    `🧾 *Ticket detectado* — confirma o edita los datos:`,
    ``,
    `🏷️ Proveedor: ${d.proveedor ?? "—"}`,
    `📝 Concepto: ${d.concepto ?? "—"}`,
    `📅 Fecha: ${fechaCorta(d.fecha)}`,
    `📂 Categoría: ${d.categoria ?? "otros"}`,
    `💶 Base: ${eur(Number(d.base_imponible ?? 0))}`,
    `📊 IVA (${Number(d.iva_porcentaje ?? 0)}%): ${eur(Number(d.iva_importe ?? 0))}`,
    `💰 *Total: ${eur(Number(d.total ?? 0))}*`,
  ].join("\n");
}

async function enviarConfirmacionTicket(to: string, draft: any) {
  const body = resumenTicket(draft);
  const r = await sendWhatsAppButtons(to, body, [
    { id: TICKET_IDS.confirm, title: "✅ Confirmar" },
    { id: TICKET_IDS.edit, title: "✏️ Editar" },
    { id: TICKET_IDS.cancel, title: "❌ Cancelar" },
  ]);
  if (!r.ok && !(r as any).skipped) {
    await sendWhatsAppText(
      to,
      body + "\n\nResponde *SI* para guardar, *EDITAR* para corregir un campo o *NO* para descartar.",
    );
  }
  return r;
}

async function enviarMenuEdicionTicket(to: string) {
  const r = await sendWhatsAppList(to, "✏️ ¿Qué dato quieres corregir?", "Elegir campo", [
    {
      title: "Campos del ticket",
      rows: [
        { id: `ticket_field:proveedor`, title: "🏷️ Proveedor" },
        { id: `ticket_field:concepto`, title: "📝 Concepto" },
        { id: `ticket_field:fecha`, title: "📅 Fecha (dd/mm/aaaa)" },
        { id: `ticket_field:categoria`, title: "📂 Categoría" },
        { id: `ticket_field:base`, title: "💶 Base imponible (€)" },
        { id: `ticket_field:iva_porcentaje`, title: "📊 IVA % " },
        { id: `ticket_field:total`, title: "💰 Total (€)" },
        { id: TICKET_IDS.confirm, title: "✅ Confirmar y guardar" },
        { id: TICKET_IDS.cancel, title: "❌ Cancelar" },
      ],
    },
  ]);
  if (!r.ok && !(r as any).skipped) {
    await sendWhatsAppText(
      to,
      "✏️ Escribe el nombre del campo a editar: proveedor, concepto, fecha, categoria, base, iva o total.",
    );
  }
  return r;
}

// Aplica el nuevo valor (texto del usuario) sobre el draft. Devuelve { draft } o { error }.
function aplicarEdicionTicket(draft: any, field: string, value: string): { draft?: any; error?: string } {
  const v = value.trim();
  if (!v) return { error: "Valor vacío" };
  const out = { ...draft };
  if (field === "proveedor" || field === "concepto" || field === "categoria") {
    out[field] = v.slice(0, 200);
  } else if (field === "fecha") {
    // dd/mm/yyyy o yyyy-mm-dd
    const m1 = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m1) {
      let [_, d, mo, y] = m1;
      if (y.length === 2) y = (parseInt(y) > 50 ? "19" : "20") + y;
      out.fecha = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      out.fecha = v;
    } else {
      return { error: "Fecha inválida. Usa dd/mm/aaaa." };
    }
  } else if (field === "base" || field === "total") {
    const n = Number(v.replace(",", "."));
    if (!isFinite(n) || n < 0) return { error: "Importe inválido." };
    if (field === "base") out.base_imponible = +n.toFixed(2);
    else out.total = +n.toFixed(2);
  } else if (field === "iva_porcentaje") {
    const n = Number(v.replace(",", "."));
    if (!isFinite(n) || n < 0 || n > 100) return { error: "IVA inválido (0–100)." };
    out.iva_porcentaje = +n.toFixed(2);
  } else {
    return { error: "Campo no reconocido." };
  }
  // Recalcular IVA importe coherentemente cuando cambian base/iva%/total
  const b = Number(out.base_imponible ?? 0);
  const t = Number(out.total ?? 0);
  const p = Number(out.iva_porcentaje ?? 0);
  if (field === "base" || field === "iva_porcentaje") {
    out.iva_importe = +((b * p) / 100).toFixed(2);
    out.total = +(b + out.iva_importe).toFixed(2);
  } else if (field === "total") {
    // Mantener IVA % y recalcular base + iva importe
    out.base_imponible = +(t / (1 + p / 100)).toFixed(2);
    out.iva_importe = +(t - out.base_imponible).toFixed(2);
  }
  return { draft: out };
}

// ============== WIZARDS conversacionales ==============
// Cada flow es una serie de "steps" que preguntan un dato y al final ejecutan una acción.
// El estado se guarda en wa_messages.pending_action como:
//   { type: "wizard", flow: "factura_crear", step: 0, data: { ... } }
// El usuario puede escribir "cancelar" / "salir" / "menu" para abortar.

type WizardStep = {
  field: string;
  prompt: string; // pregunta al usuario
  optional?: boolean; // si true, "-" o "no" lo deja vacío
  validate?: (v: string) => string | null; // devuelve error o null
  parse?: (v: string) => any;
  picker?: "cliente"; // si está, el paso se pregunta con una lista interactiva
};

const SKIP_TOKENS = ["-", "no", "ninguno", "ninguna", "skip", "saltar", "vacio", "vacío"];
const CANCEL_TOKENS = ["cancelar", "salir", "menu", "menú", "stop"];

const isOptionalSkip = (v: string) => SKIP_TOKENS.includes(v.trim().toLowerCase());
const isCancel = (v: string) => CANCEL_TOKENS.includes(v.trim().toLowerCase());

const validators = {
  money: (v: string) => {
    const n = Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
    return isNaN(n) || n <= 0 ? "Importe no válido. Escribe solo el número (ej: 350)." : null;
  },
  noEmpty: (v: string) => (v.trim().length < 1 ? "No puede estar vacío." : null),
  email: (v: string) => (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(v.trim()) ? null : "Email no válido."),
  // Acepta tanto el formato antiguo (2026-0014) como el nuevo con prefijo de serie (A2026-0014, RA2026-0001).
  invoiceNumber: (v: string) =>
    (/^[A-Z]{0,3}[0-9]{4}-[0-9]{2,4}$/i.test(v.trim()) ? null : "Formato: A2026-0014"),
  mes: (v: string) => (parseMes(v) ? null : "Mes no válido (escribe 'marzo' o '3')."),
  trimestre: (v: string) => (/^[1-4]$/.test(v.trim()) ? null : "Trimestre debe ser 1, 2, 3 o 4."),
  iva: (v: string) => {
    const n = Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
    return isNaN(n) || n < 0 || n > 100 ? "IVA debe ser un número entre 0 y 100." : null;
  },
  yesNo: (v: string) => (["si", "sí", "no"].includes(v.trim().toLowerCase()) ? null : "Responde SI o NO."),
};

const FLOWS: Record<string, WizardStep[]> = {
  factura_crear: [
    {
      field: "concepto",
      prompt: "📝 ¿Cuál es el *concepto* de la línea?\nEj: *Reparación de tejado*",
      validate: validators.noEmpty,
    },
    {
      field: "importe",
      prompt: "💶 ¿Cuál es el *importe (sin IVA)* de esta línea?\nEscribe solo el número, ej: *350*",
      validate: validators.money,
      parse: (v) => Number(v.replace(",", ".").replace(/[^\d.]/g, "")),
    },
    {
      field: "otra_linea",
      prompt: "➕ ¿Quieres *añadir otra línea*?\nResponde *SI* o *NO*.",
      validate: validators.yesNo,
    },
    {
      field: "cliente",
      prompt: "👤 ¿A qué *cliente*?\nElige uno de la lista, crea uno nuevo o pulsa *Sin cliente*.",
      optional: true,
      picker: "cliente",
    },
  ],
  factura_cobro: [
    {
      field: "numero",
      prompt: "🔢 ¿Qué *nº de factura* has cobrado?\nFormato: *2026-0014*",
      validate: validators.invoiceNumber,
    },
  ],
  factura_ver: [
    {
      field: "numero",
      prompt: "🔢 ¿Qué *nº de factura* quieres ver?\nFormato: *2026-0014*",
      validate: validators.invoiceNumber,
    },
  ],
  factura_pdf: [
    {
      field: "numero",
      prompt: "🔢 ¿De qué *nº de factura* quieres el PDF?\nFormato: *2026-0014*",
      validate: validators.invoiceNumber,
    },
  ],
  factura_anular: [
    {
      field: "numero",
      prompt: "🔢 ¿Qué *nº de factura* quieres anular?\nFormato: *2026-0014*",
      validate: validators.invoiceNumber,
    },
  ],
  facturas_listar: [
    {
      field: "filtro",
      prompt:
        "🔎 ¿Qué facturas quieres ver?\nEscribe *pendientes*, *cobradas*, un *mes* (ej: marzo) o '-' para las últimas.",
    },
  ],
  gasto_crear: [
    { field: "concepto", prompt: "📝 ¿Cuál es el *concepto* del gasto?\nEj: *Gasolina*", validate: validators.noEmpty },
    {
      field: "importe",
      prompt: "💶 ¿Cuál es el *importe total* (con IVA)?\nEscribe solo el número, ej: *65*",
      validate: validators.money,
      parse: (v) => Number(v.replace(",", ".").replace(/[^\d.]/g, "")),
    },
  ],
  gastos_listar: [
    {
      field: "filtro",
      prompt: "🔎 ¿Qué gastos quieres ver?\nEscribe *pendientes*, un *mes* (ej: marzo) o '-' para los últimos.",
    },
  ],
  cliente_crear: [
    { field: "nombre", prompt: "👤 ¿Cuál es el *nombre* del cliente?", validate: validators.noEmpty },
    { field: "telefono", prompt: "📞 ¿*Teléfono*? (escribe '-' si no lo tienes)", optional: true },
    {
      field: "email",
      prompt: "✉️ ¿*Email*? (escribe '-' si no lo tienes)",
      optional: true,
      validate: (v) => (isOptionalSkip(v) ? null : validators.email(v)),
    },
    { field: "nif", prompt: "🪪 ¿*NIF/CIF*? (escribe '-' si no lo tienes)", optional: true },
    { field: "direccion", prompt: "🏠 ¿*Dirección fiscal*? (calle y número, '-' si no la tienes)", optional: true },
    { field: "codigo_postal", prompt: "📮 ¿*Código postal*? ('-' si no lo tienes)", optional: true },
    { field: "ciudad", prompt: "🏙️ ¿*Ciudad*? ('-' si no la tienes)", optional: true },
    { field: "provincia", prompt: "📍 ¿*Provincia*? ('-' si no la tienes)", optional: true },
  ],
  cliente_buscar: [
    { field: "q", prompt: "🔎 ¿Qué cliente quieres buscar? Escribe parte del nombre.", validate: validators.noEmpty },
  ],
  cliente_borrar: [
    { field: "q", prompt: "🗑️ ¿Qué cliente quieres borrar? Escribe parte del nombre.", validate: validators.noEmpty },
  ],
  resumen_otro_mes: [
    {
      field: "mes",
      prompt: "📅 ¿De qué *mes* quieres el resumen?\nEscribe el nombre (ej: *marzo*) o el número (1-12).",
      validate: validators.mes,
    },
  ],
  gestoria_otro_trim: [
    {
      field: "trimestre",
      prompt: "📅 ¿Qué *trimestre*? (1, 2, 3 o 4)",
      validate: validators.trimestre,
      parse: (v) => Number(v.trim()),
    },
  ],
  empresa_iva: [
    {
      field: "porcentaje",
      prompt: "💼 ¿Qué *% de IVA por defecto* quieres?\nEj: *21*",
      validate: validators.iva,
      parse: (v) => Number(v.replace(",", ".").replace(/[^\d.]/g, "")),
    },
  ],
};

function buildWizard(flow: string) {
  return { type: "wizard", flow, step: 0, data: {} as Record<string, any> };
}

// Pide al usuario el dato del paso actual.
async function preguntarPasoActual(to: string, wiz: any, supabase?: any, companyId?: string | null) {
  const steps = FLOWS[wiz.flow];
  if (!steps) return;
  const step = steps[wiz.step];
  if (!step) return;
  const total = steps.length;
  const header = `📍 Paso ${wiz.step + 1} de ${total}`;
  // Picker interactivo de clientes (lista WA con clientes existentes + crear / sin cliente)
  if (step.picker === "cliente" && supabase && companyId) {
    const { data: clientes } = await supabase
      .from("clients")
      .select("id, nombre, telefono")
      .eq("company_id", companyId)
      .order("nombre", { ascending: true })
      .limit(8); // dejamos hueco para 2 filas extra (crear / sin cliente) → máx 10
    const rows: { id: string; title: string; description?: string }[] = [];
    for (const c of clientes ?? []) {
      rows.push({
        id: `cliente_pick:${c.id}`,
        title: String(c.nombre).slice(0, 24),
        description: c.telefono ? `📞 ${c.telefono}` : undefined,
      });
    }
    rows.push({ id: "cliente_pick:new", title: "➕ Crear nuevo cliente", description: "Te pediré el nombre" });
    rows.push({ id: "cliente_pick:none", title: "➖ Sin cliente", description: "Factura sin cliente asignado" });
    const body = `${header}\n\n${step.prompt}\n\n_Escribe *cancelar* para salir._`;
    const r = await sendWhatsAppList(to, body, "Elegir cliente", [{ title: "Tus clientes", rows }]);
    if ((r as any).ok || (r as any).skipped) return;
    // Fallback texto si Meta rechaza el interactivo
    const lista = (clientes ?? []).map((c: any, i: number) => `${i + 1}. ${c.nombre}`).join("\n");
    await sendWhatsAppText(
      to,
      `${header}\n\n${step.prompt}\n${lista ? `\nClientes:\n${lista}\n` : ""}\nEscribe el *nombre* del cliente, *nuevo* para crear uno, o *-* para dejar vacío.\n\n_Escribe *cancelar* para salir._`,
    );
    return;
  }
  const tip = step.optional ? "\n_Escribe '-' para dejarlo vacío._" : "";
  await sendWhatsAppText(to, `${header}\n\n${step.prompt}${tip}\n\n_Escribe *cancelar* para salir._`);
}

// Ejecuta la acción al terminar el wizard. Devuelve { respuesta, pendingAction? }.
async function ejecutarWizard(
  supabase: any,
  msg: any,
  wiz: any,
  replyTo: string,
): Promise<{ respuesta: string; pendingAction?: any }> {
  const d = wiz.data;
  const companyId = msg.company_id;

  switch (wiz.flow) {
    case "factura_crear": {
      // Asegurar que la última línea (la que el usuario acaba de introducir antes
      // de pasar al picker de cliente) también queda añadida.
      const lineas: { concepto: string; importe: number }[] = Array.isArray(d.lineas) ? [...d.lineas] : [];
      if (
        d.concepto != null &&
        d.importe != null &&
        !lineas.some((l) => l.concepto === String(d.concepto) && Number(l.importe) === Number(d.importe))
      ) {
        lineas.push({ concepto: String(d.concepto).trim(), importe: Number(d.importe) });
      }
      if (!lineas.length) throw new Error("La factura debe tener al menos una línea.");
      const base = lineas.reduce((s, l) => s + Number(l.importe || 0), 0);
      const concepto =
        lineas.length === 1 ? lineas[0].concepto : lineas.map((l, i) => `${i + 1}. ${l.concepto}`).join(" · ");
      const cliente = d.cliente && !isOptionalSkip(String(d.cliente)) ? String(d.cliente).trim() : null;
      // Si el picker ya seleccionó (o creamos al vuelo) un cliente, usamos su id directamente.
      let clientId: string | null = (d.cliente_id as string | null) ?? null;
      let clienteNombre: string | null = cliente;
      if (!clientId && cliente) {
        const { data: cli } = await supabase
          .from("clients")
          .select("id, nombre")
          .eq("company_id", companyId)
          .ilike("nombre", `%${cliente}%`)
          .maybeSingle();
        clientId = cli?.id ?? null;
        if (cli?.nombre) clienteNombre = cli.nombre;
      }
      const { data: co } = await supabase
        .from("companies")
        .select("iva_default, irpf_default, serie_facturacion")
        .eq("id", companyId)
        .maybeSingle();
      const ivaPct = Number(co?.iva_default ?? 21);
      const irpfPct = Number(co?.irpf_default ?? 0);
      const ivaImp = +((base * ivaPct) / 100).toFixed(2);
      const irpfImp = +((base * irpfPct) / 100).toFixed(2);
      const total = +(base + ivaImp - irpfImp).toFixed(2);
      const serie = (co?.serie_facturacion ?? "A").toString();
      const year = new Date().getFullYear();
      const prefix = `${serie}${year}-`;
      const { data: last } = await supabase
        .from("invoices")
        .select("numero")
        .eq("company_id", companyId)
        .like("numero", `${prefix}%`)
        .order("numero", { ascending: false })
        .limit(1);
      const lastSeq = last?.[0]?.numero?.split("-").pop();
      const numero = `${prefix}${String(lastSeq ? Number(lastSeq) + 1 : 1).padStart(4, "0")}`;
      const mencion = irpfPct > 0
        ? `Operación sujeta a retención de IRPF al ${irpfPct}% conforme al art. 99 LIRPF.`
        : null;
      // 1) crear como borrador con todos los datos
      const { data: inv, error } = await supabase
        .from("invoices")
        .insert({
          company_id: companyId,
          client_id: clientId,
          numero,
          serie,
          fecha: new Date().toISOString().slice(0, 10),
          concepto,
          base_imponible: base,
          iva_porcentaje: ivaPct,
          iva_importe: ivaImp,
          irpf_porcentaje: irpfPct,
          irpf_importe: irpfImp,
          total,
          tipo: "ordinaria",
          mencion_legal: mencion,
          estado: "borrador",
        })
        .select()
        .single();
      if (error) throw error;
      // 2) Insertar líneas con IVA/totales por línea
      await supabase.from("invoice_lines").insert(
        lineas.map((l, i) => {
          const baseL = Number(l.importe);
          const ivaL = +(baseL * ivaPct / 100).toFixed(2);
          return {
            invoice_id: inv.id,
            company_id: companyId,
            orden: i,
            concepto: l.concepto,
            cantidad: 1,
            precio_unitario: baseL,
            descuento_porcentaje: 0,
            iva_porcentaje: ivaPct,
            iva_importe: ivaL,
            importe: baseL,
            total: +(baseL + ivaL).toFixed(2),
          };
        }),
      );
      // 3) Emitir (RD 1619/2012: factura por WhatsApp se considera ya emitida e inmutable)
      await supabase
        .from("invoices")
        .update({ estado: "emitida" as any })
        .eq("id", inv.id);
      await generarYEnviarFacturaPDF(supabase, inv.id, replyTo);
      const detalleLineas =
        lineas.length > 1
          ? `\n📋 *${lineas.length} líneas*:\n${lineas.map((l, i) => `  ${i + 1}. ${l.concepto} — ${eur(Number(l.importe))}`).join("\n")}\n`
          : `\nConcepto: ${concepto}\n`;
      const irpfTxt = irpfPct > 0 ? ` · IRPF ${irpfPct}%: -${eur(irpfImp)}` : "";
      return {
        respuesta: `✅ *Factura ${numero}* emitida${detalleLineas}${clienteNombre ? `Cliente: ${clienteNombre}${!clientId ? " ⚠️ (no encontrado)" : ""}\n` : ""}Base: ${eur(base)} · IVA ${ivaPct}%: ${eur(ivaImp)}${irpfTxt}\n*Total: ${eur(total)}*\n🔒 Inmutable (RD 1619/2012). Para corregir, emite una rectificativa desde la web.\n📎 PDF enviado.`,
      };
    }
    case "factura_cobro": {
      const numero = String(d.numero).trim();
      const { data: inv } = await supabase
        .from("invoices")
        .update({ estado: "cobrada" as any, fecha_cobro: new Date().toISOString().slice(0, 10) })
        .eq("company_id", companyId)
        .eq("numero", numero)
        .select()
        .maybeSingle();
      return {
        respuesta: inv ? `✅ Factura *${numero}* marcada como cobrada.` : `❌ No encuentro la factura *${numero}*.`,
      };
    }
    case "factura_ver": {
      const numero = String(d.numero).trim();
      const { data: inv } = await supabase
        .from("invoices")
        .select("*, clients(nombre)")
        .eq("company_id", companyId)
        .eq("numero", numero)
        .maybeSingle();
      if (!inv) return { respuesta: `❌ No encuentro la factura *${numero}*.` };
      return {
        respuesta: `📄 *Factura ${inv.numero}*\nFecha: ${fechaCorta(inv.fecha)}\nCliente: ${inv.clients?.nombre ?? "(sin asignar)"}\nConcepto: ${inv.concepto}\nBase: ${eur(Number(inv.base_imponible))}\nIVA ${inv.iva_porcentaje}%: ${eur(Number(inv.iva_importe))}\n*Total: ${eur(Number(inv.total))}*\nEstado: ${inv.estado}`,
      };
    }
    case "factura_pdf": {
      const numero = String(d.numero).trim();
      const { data: inv } = await supabase
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .eq("numero", numero)
        .maybeSingle();
      if (!inv) return { respuesta: `❌ No encuentro la factura *${numero}*.` };
      await generarYEnviarFacturaPDF(supabase, inv.id, replyTo);
      return { respuesta: `📎 PDF de la factura *${numero}* enviado.` };
    }
    case "factura_anular": {
      const numero = String(d.numero).trim();
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, numero, total")
        .eq("company_id", companyId)
        .eq("numero", numero)
        .maybeSingle();
      if (!inv) return { respuesta: `❌ No encuentro la factura *${numero}*.` };
      return {
        respuesta: `⚠️ ¿Anular factura *${inv.numero}* (${eur(Number(inv.total))})?\nResponde *SI* para confirmar o *NO* para cancelar.`,
        pendingAction: { type: "anular_factura", invoice_id: inv.id, numero: inv.numero },
      };
    }
    case "facturas_listar": {
      const filtro = String(d.filtro ?? "").toLowerCase();
      let q = supabase
        .from("invoices")
        .select("numero, fecha, total, estado, clients(nombre)")
        .eq("company_id", companyId)
        .order("fecha", { ascending: false })
        .limit(15);
      if (filtro.startsWith("pend")) q = q.neq("estado", "cobrada");
      else if (filtro.startsWith("cob")) q = q.eq("estado", "cobrada");
      else if (parseMes(filtro)) {
        const m = parseMes(filtro)!;
        const y = new Date().getFullYear();
        q = q
          .gte("fecha", `${y}-${String(m).padStart(2, "0")}-01`)
          .lte("fecha", `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`);
      }
      const { data } = await q;
      if (!data?.length) return { respuesta: "📭 No hay facturas con ese filtro." };
      return {
        respuesta:
          `📄 *Facturas* (${data.length})\n\n` +
          data
            .map(
              (i: any) =>
                `• ${i.numero} · ${fechaCorta(i.fecha)} · ${eur(Number(i.total))} · _${i.estado}_${i.clients?.nombre ? ` · ${i.clients.nombre}` : ""}`,
            )
            .join("\n"),
      };
    }
    case "gasto_crear": {
      const total = Number(d.importe);
      const concepto = String(d.concepto).trim();
      const { data: g, error } = await supabase
        .from("expenses")
        .insert({
          company_id: companyId,
          fecha: new Date().toISOString().slice(0, 10),
          concepto,
          categoria: "otros",
          base_imponible: total,
          iva_porcentaje: 0,
          iva_importe: 0,
          total,
          estado: "pendiente",
          origen: "whatsapp",
        })
        .select()
        .single();
      if (error) throw error;
      return { respuesta: `✅ *Gasto registrado*\nConcepto: ${concepto}\n*Total: ${eur(total)}*` };
    }
    case "gastos_listar": {
      const filtro = String(d.filtro ?? "").toLowerCase();
      let q = supabase
        .from("expenses")
        .select("fecha, concepto, total, estado, categoria")
        .eq("company_id", companyId)
        .order("fecha", { ascending: false })
        .limit(15);
      if (filtro.startsWith("pend")) q = q.eq("estado", "pendiente");
      else if (parseMes(filtro)) {
        const m = parseMes(filtro)!;
        const y = new Date().getFullYear();
        q = q
          .gte("fecha", `${y}-${String(m).padStart(2, "0")}-01`)
          .lte("fecha", `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`);
      }
      const { data } = await q;
      if (!data?.length) return { respuesta: "📭 No hay gastos con ese filtro." };
      const tot = data.reduce((s: number, g: any) => s + Number(g.total), 0);
      return {
        respuesta:
          `🧾 *Gastos* (${data.length} · ${eur(tot)})\n\n` +
          data
            .map((g: any) => `• ${fechaCorta(g.fecha)} · ${g.concepto} · ${eur(Number(g.total))} · _${g.categoria}_`)
            .join("\n"),
      };
    }
    case "cliente_crear": {
      const nombre = String(d.nombre).trim();
      const telefono = d.telefono && !isOptionalSkip(d.telefono) ? String(d.telefono).trim() : null;
      const email = d.email && !isOptionalSkip(d.email) ? String(d.email).trim() : null;
      const nif = d.nif && !isOptionalSkip(d.nif) ? String(d.nif).trim().toUpperCase() : null;
      const direccion = d.direccion && !isOptionalSkip(d.direccion) ? String(d.direccion).trim() : null;
      const codigo_postal = d.codigo_postal && !isOptionalSkip(d.codigo_postal) ? String(d.codigo_postal).trim() : null;
      const ciudad = d.ciudad && !isOptionalSkip(d.ciudad) ? String(d.ciudad).trim() : null;
      const provincia = d.provincia && !isOptionalSkip(d.provincia) ? String(d.provincia).trim() : null;
      const { data: c, error } = await supabase
        .from("clients")
        .insert({ company_id: companyId, nombre, telefono, email, nif, direccion, codigo_postal, ciudad, provincia })
        .select()
        .single();
      if (error) throw error;
      const dirTxt = [direccion, [codigo_postal, ciudad].filter(Boolean).join(" "), provincia].filter(Boolean).join("\n");
      return {
        respuesta: `✅ Cliente *${c.nombre}* creado.${telefono ? `\nTel: ${telefono}` : ""}${email ? `\nEmail: ${email}` : ""}${nif ? `\nNIF: ${nif}` : ""}${dirTxt ? `\n${dirTxt}` : ""}`,
      };
    }
    case "cliente_buscar": {
      const q = String(d.q).trim();
      const { data } = await supabase
        .from("clients")
        .select("nombre, telefono, email, nif")
        .eq("company_id", companyId)
        .ilike("nombre", `%${q}%`)
        .limit(10);
      return {
        respuesta: data?.length
          ? `🔎 *Resultados* (${data.length})\n\n` +
            data
              .map(
                (c: any) =>
                  `• ${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}${c.email ? ` · ${c.email}` : ""}${c.nif ? ` · ${c.nif}` : ""}`,
              )
              .join("\n")
          : `🔎 Sin resultados para "${q}".`,
      };
    }
    case "cliente_borrar": {
      const q = String(d.q).trim();
      const { data: c } = await supabase
        .from("clients")
        .select("id, nombre")
        .eq("company_id", companyId)
        .ilike("nombre", `%${q}%`)
        .maybeSingle();
      if (!c) return { respuesta: `❌ No encuentro un cliente que coincida con "${q}".` };
      return {
        respuesta: `⚠️ ¿Borrar al cliente *${c.nombre}*?\nResponde *SI* o *NO*.`,
        pendingAction: { type: "borrar_cliente", client_id: c.id, nombre: c.nombre },
      };
    }
    case "resumen_otro_mes": {
      const mes = parseMes(String(d.mes))!;
      msg.texto = `RESUMEN ${mes}`;
      return { respuesta: "__FALLTHROUGH__:RESUMEN " + mes };
    }
    case "gestoria_otro_trim": {
      const t = Number(d.trimestre);
      return { respuesta: "__FALLTHROUGH__:GESTORIA trimestre " + t };
    }
    case "empresa_iva": {
      const pct = Number(d.porcentaje);
      await supabase.from("companies").update({ iva_default: pct }).eq("id", companyId);
      return { respuesta: `✅ IVA por defecto cambiado a *${pct}%*.` };
    }
  }
  return { respuesta: "⚠️ Wizard no reconocido." };
}

// Mapea los IDs de menú que disparan un wizard al nombre del flow.
const MENU_ID_TO_FLOW: Record<string, string> = {
  [MENU_IDS.facturaCrear]: "factura_crear",
  [MENU_IDS.facturaCobro]: "factura_cobro",
  [MENU_IDS.facturaVer]: "factura_ver",
  [MENU_IDS.facturaPdf]: "factura_pdf",
  [MENU_IDS.facturaAnular]: "factura_anular",
  [MENU_IDS.gastoCrear]: "gasto_crear",
  [MENU_IDS.resumenOtroMes]: "resumen_otro_mes",
  [MENU_IDS.gestoriaOtroTrim]: "gestoria_otro_trim",
  [MENU_IDS.clienteBuscar]: "cliente_buscar",
  [MENU_IDS.clienteCrear]: "cliente_crear",
  [MENU_IDS.clienteBorrar]: "cliente_borrar",
  [MENU_IDS.empresaIva]: "empresa_iva",
};

// ============== MAIN ==============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  let messageId: string | undefined;
  try {
    const payload = await req.json();
    messageId = payload.messageId;
    if (!messageId)
      return new Response(JSON.stringify({ error: "messageId requerido" }), { status: 400, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: msg } = await supabase.from("wa_messages").select("*").eq("id", messageId).maybeSingle();
    if (!msg) return new Response(JSON.stringify({ error: "no encontrado" }), { status: 404, headers: corsHeaders });

    // Idempotencia: si este mensaje ya se procesó, no se vuelve a ejecutar nada.
    if (msg.estado === "procesado") {
      return new Response(JSON.stringify({ ok: true, duplicado: true }), { headers: corsHeaders });
    }

    const replyTo: string = msg.remitente;
    // Clave estable de la petición (id de Meta si lo tenemos) para no duplicar escrituras.
    const requestKey: string = msg.wa_message_id ?? `wa:${messageId}`;

    if (!msg.company_id) {
      // Fallback: intentar resolver la empresa por el número del remitente.
      // Esto cubre el caso en que el webhook no recibió `to_number` (display_phone_number)
      // o no encontró match por destino, pero el emisor sí está dado de alta.
      const sender = msg.remitente as string;
      const variants = new Set<string>();
      if (sender) {
        variants.add(sender);
        if (sender.startsWith("+")) variants.add(sender.slice(1));
        else variants.add("+" + sender);
        // Sin prefijo internacional (España) — últimos 9 dígitos
        const digits = sender.replace(/\D/g, "");
        if (digits.length >= 9) variants.add(digits.slice(-9));
      }
      const { data: matched } = await supabase
        .from("companies")
        .select("id, whatsapp_number, telefono")
        .or(
          Array.from(variants)
            .flatMap((v) => [`whatsapp_number.eq.${v}`, `telefono.eq.${v}`])
            .join(",")
        )
        .limit(1)
        .maybeSingle();
      if (matched?.id) {
        await supabase.from("wa_messages").update({ company_id: matched.id }).eq("id", messageId);
        msg.company_id = matched.id;
      }
    }

    // ============ GanaderOS: motor de IA (mismo que la app) ============
    const { data: flagRows } = await supabase
      .from("ai_feature_flags")
      .select("key, enabled")
      .in("key", ["whatsapp_ai", "ear_tag_ocr"]);
    const flags: Record<string, boolean> = {};
    for (const f of flagRows ?? []) flags[f.key] = !!f.enabled;
    let expGan: ExplotacionCtx | null = null;
    if (flags.whatsapp_ai !== false) {
      try {
        expGan = await resolverExplotacionWa(supabase, msg.company_id, replyTo);
      } catch (_e) {
        expGan = null;
      }
    }

    // GanaderOS: el canal de WhatsApp está orientado 100% a ganadería.
    // Los comandos heredados de Papeleo Fácil (facturas, clientes, gestoría, menús)
    // siguen en este fichero pero desactivados: poner LEGACY_PAPELEO_WA = true los reactiva.
    if (!expGan) {
      const txt =
        "❌ Tu número no está vinculado a ninguna explotación. Añádelo en GanaderOS → Configuración → WhatsApp.";
      await sendWhatsAppText(replyTo, txt);
      await supabase
        .from("wa_messages")
        .update({ estado: "error", resultado: { reply: txt } })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: false }), { headers: corsHeaders });
    }


    const procesarConIa = async (texto: string, comando: string) => {
      const r = await manejarTextoIaWa({
        sb: supabase,
        remitente: replyTo,
        texto,
        exp: expGan!,
        sendText: sendWhatsAppText,
        requestKey,
      });
      await supabase
        .from("wa_messages")
        .update({ estado: "procesado", comando, resultado: { ia: true, tools: r.tools, reply: r.reply.slice(0, 1000) } })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    };

    // Nota de voz → transcripción → mismo motor de intenciones
    if (msg.tipo === "audio" && expGan && msg.adjunto_path) {
      try {
        const texto = await transcribirAdjuntoWa(supabase, "wa-attachments", msg.adjunto_path);
        if (texto.trim()) {
          await sendWhatsAppText(replyTo, `🎙️ He entendido: "${texto.trim()}"`);
          return await procesarConIa(texto.trim(), "IA_AUDIO");
        }
      } catch (e) {
        console.error("wa audio ia", e);
      }
    }

    // Foto → clasificar antes de aplicar el OCR de facturas
    if (msg.tipo === "imagen" && expGan && msg.adjunto_path && flags.ear_tag_ocr !== false) {
      try {
        const cls = await clasificarAdjuntoWa(supabase, "wa-attachments", msg.adjunto_path);
        if (cls.tipo === "crotal" && cls.crotal) {
          const txt = await responderCrotalWa(supabase, expGan, String(cls.crotal));
          await sendWhatsAppText(replyTo, txt);
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "IA_CROTAL", resultado: { crotal: cls.crotal, reply: txt } })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        if (cls.tipo !== "crotal" && !msg.company_id) {
          const txt = `📷 He recibido la foto${cls.descripcion ? ` (${cls.descripcion})` : ""}. Dime qué quieres que haga con ella (por ejemplo: un gasto, un documento del animal…).`;
          await sendWhatsAppText(replyTo, txt);
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "IA_FOTO", resultado: { clasificacion: cls } })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      } catch (e) {
        console.error("wa foto ia", e);
      }
    }

    // Todo el texto de WhatsApp va al motor ganadero (los comandos antiguos quedan inactivos).
    if (expGan && msg.tipo !== "imagen" && msg.tipo !== "documento") {
      const t = (msg.texto ?? "").trim();
      if (t) return await procesarConIa(t, "IA_TEXTO");
      await supabase
        .from("wa_messages")
        .update({ estado: "procesado", comando: "IGNORADO_SIN_TEXTO", resultado: {} })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: corsHeaders });
    }



    // ============ OCR de imagen/documento — extraer y pedir confirmación ============
    if (msg.tipo === "imagen" || msg.tipo === "documento") {
      if (!msg.adjunto_path) {
        const txt = "⚠️ No he podido descargar el archivo. Vuelve a enviarlo, por favor.";
        await sendWhatsAppText(replyTo, txt);
        await supabase
          .from("wa_messages")
          .update({ estado: "error", resultado: { reply: txt } })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: false }), { headers: corsHeaders });
      }
      const ocr = await ocrTicketConIA(supabase, msg.adjunto_path);
      if (ocr.error && !ocr.extracted) {
        const txt = `⚠️ No he podido leer el ticket (${ocr.error}). Puedes enviarlo como GASTO <concepto> <importe>.`;
        await sendWhatsAppText(replyTo, txt);
        await supabase.from("wa_messages").update({ estado: "error", resultado: { ocr } }).eq("id", messageId);
        return new Response(JSON.stringify({ ok: false }), { headers: corsHeaders });
      }
      const e: any = (ocr as any).extracted ?? {};
      const total = Number(e.total ?? 0);
      const base = Number(e.base ?? (total || 0));
      const ivaPct = e.iva_porcentaje != null ? Number(e.iva_porcentaje) : 21;
      const ivaImp = e.iva_importe != null ? Number(e.iva_importe) : +(total - base).toFixed(2);
      const draft = {
        fecha: e.fecha ?? new Date().toISOString().slice(0, 10),
        proveedor: e.proveedor ?? null,
        concepto: e.concepto ?? "Ticket por WhatsApp",
        categoria: e.categoria ?? "otros",
        base_imponible: base,
        iva_porcentaje: ivaPct,
        iva_importe: ivaImp,
        total,
      };
      const pa = { type: "ticket_confirm", draft, adjunto_path: msg.adjunto_path };
      await enviarConfirmacionTicket(replyTo, draft);
      await supabase
        .from("wa_messages")
        .update({
          estado: "procesado",
          comando: "TICKET_OCR_DRAFT",
          pending_action: pa,
          resultado: { extracted: e, raw_text: (ocr as any).raw_text?.slice(0, 1000) ?? null },
        })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // Audio u otros tipos no soportados → respuesta clara, sin fallback de "comando no reconocido"
    if (msg.tipo === "audio") {
      const txt =
        "🎙️ Aún no proceso notas de voz. Envíame el ticket como *foto* o escribe el comando (ej: GASTO gasolina 45).";
      await sendWhatsAppText(replyTo, txt);
      await supabase
        .from("wa_messages")
        .update({ estado: "procesado", comando: "AUDIO_UNSUPPORTED", resultado: { reply: txt } })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ============ NAVEGACIÓN POR MENÚ INTERACTIVO ============
    // 1) Selección desde botón/lista (marcador __MENU__:<id> insertado por el webhook).
    const selectionId = extractMenuSelection(msg.texto);
    if (selectionId) {
      // === Confirmación de TICKET (OCR) ===
      if (
        selectionId === TICKET_IDS.confirm ||
        selectionId === TICKET_IDS.edit ||
        selectionId === TICKET_IDS.cancel ||
        selectionId.startsWith("ticket_field:")
      ) {
        // Buscar pending_action ticket_confirm reciente
        const sinceTk = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: tkRows } = await supabase
          .from("wa_messages")
          .select("id, pending_action")
          .eq("remitente", replyTo)
          .not("pending_action", "is", null)
          .gte("recibido_en", sinceTk)
          .order("recibido_en", { ascending: false })
          .limit(1);
        const tkRow = tkRows?.[0];
        const activeTk = tkRow?.pending_action?.type === "ticket_confirm" ? tkRow.pending_action : null;
        if (!activeTk) {
          await sendWhatsAppText(replyTo, "ℹ️ Esa confirmación ya no está disponible. Envíame otra foto del ticket.");
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "TICKET_STALE", resultado: { selectionId } })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        if (selectionId === TICKET_IDS.cancel) {
          await supabase.from("wa_messages").update({ pending_action: null }).eq("id", tkRow!.id);
          await sendWhatsAppText(replyTo, "❌ Ticket descartado. No se ha guardado nada.");
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "TICKET_CANCEL" })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        if (selectionId === TICKET_IDS.edit) {
          await enviarMenuEdicionTicket(replyTo);
          // Mantener el pending_action vivo
          await supabase.from("wa_messages").update({ pending_action: null }).eq("id", tkRow!.id);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "TICKET_EDIT_MENU",
              pending_action: activeTk,
            })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        if (selectionId.startsWith("ticket_field:")) {
          const field = selectionId.slice("ticket_field:".length);
          if (!TICKET_IDS.fields.includes(field as any)) {
            await sendWhatsAppText(replyTo, "🤔 Campo no válido.");
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
          const newPa = { ...activeTk, awaiting_field: field };
          await supabase.from("wa_messages").update({ pending_action: null }).eq("id", tkRow!.id);
          const prompts: Record<string, string> = {
            proveedor: "🏷️ Escribe el *proveedor* correcto:",
            concepto: "📝 Escribe el *concepto* correcto:",
            fecha: "📅 Escribe la *fecha* (dd/mm/aaaa):",
            categoria:
              "📂 Escribe la *categoría* (combustible, dietas, suministros, material, transporte, telefonia, software, otros):",
            base: "💶 Escribe la *base imponible* en € (ej: 12.34):",
            iva_porcentaje: "📊 Escribe el *IVA %* (ej: 21):",
            total: "💰 Escribe el *total* en € (ej: 14.92):",
          };
          await sendWhatsAppText(replyTo, prompts[field] + "\n\n_Escribe *cancelar* para salir._");
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "TICKET_EDIT_FIELD",
              pending_action: newPa,
              resultado: { field },
            })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }

        // CONFIRMAR → guardar gasto
        const d = activeTk.draft;
        try {
          const { data: g, error } = await supabase
            .from("expenses")
            .insert({
              company_id: msg.company_id,
              fecha: d.fecha,
              proveedor: d.proveedor,
              concepto: d.concepto,
              categoria: d.categoria ?? "otros",
              base_imponible: Number(d.base_imponible ?? 0),
              iva_porcentaje: Number(d.iva_porcentaje ?? 0),
              iva_importe: Number(d.iva_importe ?? 0),
              total: Number(d.total ?? 0),
              estado: "pendiente",
              origen: "whatsapp-ocr",
              archivo_path: activeTk.adjunto_path ?? null,
            })
            .select()
            .single();
          if (error) throw error;
          await supabase.from("wa_messages").update({ pending_action: null }).eq("id", tkRow!.id);
          const txt = `✅ *Gasto guardado*\n${resumenTicket(d).split("\n").slice(2).join("\n")}\n\n_Estado: pendiente de revisión_`;
          await sendWhatsAppText(replyTo, txt);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "TICKET_CONFIRM",
              resultado: { gasto_id: g.id, draft: d },
            })
            .eq("id", messageId);
        } catch (e) {
          await sendWhatsAppText(replyTo, `⚠️ No he podido guardar: ${String(e).slice(0, 140)}`);
          await supabase
            .from("wa_messages")
            .update({ estado: "error", resultado: { error: String(e) } })
            .eq("id", messageId);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // 1.a) Selección de cliente desde el picker de un wizard (factura_crear, etc.)
      if (selectionId.startsWith("cliente_pick:")) {
        const pickValue = selectionId.slice("cliente_pick:".length); // "<uuid>" | "new" | "none"
        // Buscar wizard activo
        const sinceWizPick = new Date(Date.now() - 10 * 60_000).toISOString();
        const { data: wizPickRows } = await supabase
          .from("wa_messages")
          .select("id, pending_action")
          .eq("remitente", replyTo)
          .not("pending_action", "is", null)
          .gte("recibido_en", sinceWizPick)
          .order("recibido_en", { ascending: false })
          .limit(1);
        const wizPickRow = wizPickRows?.[0];
        const activeWizPick = wizPickRow?.pending_action?.type === "wizard" ? wizPickRow.pending_action : null;
        const stepPick = activeWizPick ? FLOWS[activeWizPick.flow]?.[activeWizPick.step] : null;
        if (!activeWizPick || stepPick?.picker !== "cliente") {
          await sendWhatsAppText(replyTo, "ℹ️ Esa opción ya no es válida. Escribe *menú* para empezar de nuevo.");
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "MENU_STALE", resultado: { selectionId } })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        // Caso "crear nuevo cliente": guardamos un marcador y pedimos el nombre como texto
        if (pickValue === "new") {
          const newWizCN = { ...activeWizPick, awaiting_new_client: true };
          await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizPickRow!.id);
          await sendWhatsAppText(
            replyTo,
            "➕ Vamos a crear un *nuevo cliente*.\n\n¿Cuál es su *nombre*? (escribe solo el nombre, los demás datos los puedes añadir después con *CLIENTE NUEVO*)\n\n_Escribe *cancelar* para salir._",
          );
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "WIZARD_PICK_NEW_CLIENT",
              pending_action: newWizCN,
              resultado: { wizard: activeWizPick.flow, picker: "cliente_new" },
            })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        // Caso "sin cliente" o uuid concreto → avanzar el wizard como si el usuario hubiera respondido
        let pickedName: string | null = null;
        let pickedId: string | null = null;
        if (pickValue !== "none") {
          const { data: cli } = await supabase
            .from("clients")
            .select("id, nombre")
            .eq("company_id", msg.company_id)
            .eq("id", pickValue)
            .maybeSingle();
          pickedId = cli?.id ?? null;
          pickedName = cli?.nombre ?? null;
        }
        const newDataPick = { ...activeWizPick.data, [stepPick.field]: pickedName, cliente_id: pickedId };
        const newStepPick = activeWizPick.step + 1;
        const stepsPick = FLOWS[activeWizPick.flow];
        await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizPickRow!.id);
        if (newStepPick < stepsPick.length) {
          const newWizPick = { ...activeWizPick, step: newStepPick, data: newDataPick };
          await preguntarPasoActual(replyTo, newWizPick, supabase, msg.company_id);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "WIZARD_NEXT",
              pending_action: newWizPick,
              resultado: { wizard: activeWizPick.flow, step: newStepPick, picked_client: pickedId ?? "none" },
            })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        // último paso → ejecutar
        const finalWizPick = { ...activeWizPick, data: newDataPick };
        try {
          const { respuesta, pendingAction } = await ejecutarWizard(supabase, msg, finalWizPick, replyTo);
          await sendWhatsAppText(replyTo, respuesta);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "WIZARD_DONE",
              pending_action: pendingAction ?? null,
              resultado: { wizard: activeWizPick.flow, data: newDataPick, reply: respuesta },
            })
            .eq("id", messageId);
        } catch (e) {
          await sendWhatsAppText(replyTo, `⚠️ Error: ${String(e).slice(0, 140)}`);
          await supabase
            .from("wa_messages")
            .update({ estado: "error", resultado: { error: String(e) } })
            .eq("id", messageId);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // Volver al menú principal
      if (selectionId === MENU_IDS.volver) {
        await enviarMenuPrincipal(replyTo);
        await supabase
          .from("wa_messages")
          .update({ estado: "procesado", comando: "MENU", resultado: { menu: "principal" } })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // Submenús (la opción es uno de los grupos del menú principal)
      if (
        [
          MENU_IDS.facturas,
          MENU_IDS.gastos,
          MENU_IDS.resumen,
          MENU_IDS.gestoria,
          MENU_IDS.clientes,
          MENU_IDS.empresa,
        ].includes(selectionId as any)
      ) {
        await enviarSubmenu(replyTo, selectionId);
        await supabase
          .from("wa_messages")
          .update({ estado: "procesado", comando: "MENU", resultado: { submenu: selectionId } })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // Si la selección dispara un WIZARD paso a paso, iniciamos el flow.
      const flow = MENU_ID_TO_FLOW[selectionId];
      if (flow) {
        const wiz = buildWizard(flow);
        await preguntarPasoActual(replyTo, wiz, supabase, msg.company_id);
        await supabase
          .from("wa_messages")
          .update({
            estado: "procesado",
            comando: "WIZARD_START",
            pending_action: wiz,
            resultado: { wizard: flow },
          })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // Mapeo directo a comando interno → reescribimos msg.texto y dejamos que siga el flujo normal.
      const mapped = MENU_ID_TO_COMMAND[selectionId];
      if (mapped) {
        msg.texto = mapped;
      } else if (selectionId === MENU_IDS.gestoriaVerActual) {
        msg.texto = `GESTORIA trimestre ${Math.ceil((new Date().getMonth() + 1) / 3)}`;
      } else if (selectionId === MENU_IDS.gestoriaEnviarActual) {
        msg.texto = `GESTORIA ENVIAR trimestre ${Math.ceil((new Date().getMonth() + 1) / 3)}`;
      } else if (selectionId === MENU_IDS.gastoTicket) {
        await sendWhatsAppText(replyTo, "📷 Envíame ahora una *foto del ticket* y lo registro automáticamente.");
        await supabase
          .from("wa_messages")
          .update({ estado: "procesado", comando: "MENU_PROMPT", resultado: { selectionId } })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      } else {
        await sendWhatsAppText(replyTo, "🤔 Opción no reconocida. Escribe *menú*.");
        await supabase
          .from("wa_messages")
          .update({ estado: "procesado", comando: "MENU_UNKNOWN", resultado: { selectionId } })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }

    // 2) Disparadores naturales del menú principal ("hola", "menu", "menú", "ayuda", etc.)
    //    OJO: si el usuario escribió AYUDA mostramos el menú interactivo + texto de ayuda al final del flujo.
    if (!selectionId && isMenuTrigger(msg.texto)) {
      await enviarMenuPrincipal(replyTo);
      await supabase
        .from("wa_messages")
        .update({ estado: "procesado", comando: "MENU", resultado: { menu: "principal", trigger: msg.texto } })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ============ WIZARD ACTIVO: ¿hay un flow paso-a-paso en curso? ============
    // Buscamos el último pending_action de tipo "wizard" del remitente en los últimos 10 min.
    const sinceWiz = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: wizRows } = await supabase
      .from("wa_messages")
      .select("id, pending_action")
      .eq("remitente", replyTo)
      .not("pending_action", "is", null)
      .gte("recibido_en", sinceWiz)
      .order("recibido_en", { ascending: false })
      .limit(1);
    const wizRow = wizRows?.[0];
    const activeWiz = wizRow?.pending_action?.type === "wizard" ? wizRow.pending_action : null;

    // ============ TICKET: usuario está editando un campo (texto) ============
    if (!selectionId && msg.texto) {
      const sinceTk2 = new Date(Date.now() - 30 * 60_000).toISOString();
      const { data: tk2Rows } = await supabase
        .from("wa_messages")
        .select("id, pending_action")
        .eq("remitente", replyTo)
        .not("pending_action", "is", null)
        .gte("recibido_en", sinceTk2)
        .order("recibido_en", { ascending: false })
        .limit(1);
      const tk2Row = tk2Rows?.[0];
      const activeTk2 =
        tk2Row?.pending_action?.type === "ticket_confirm" && tk2Row.pending_action?.awaiting_field
          ? tk2Row.pending_action
          : null;
      if (activeTk2) {
        const userInput = msg.texto.trim();
        if (isCancel(userInput)) {
          await supabase.from("wa_messages").update({ pending_action: null }).eq("id", tk2Row!.id);
          await sendWhatsAppText(replyTo, "❌ Edición cancelada. Ticket descartado.");
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "TICKET_CANCEL_EDIT" })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        const res = aplicarEdicionTicket(activeTk2.draft, activeTk2.awaiting_field, userInput);
        if (res.error || !res.draft) {
          await sendWhatsAppText(replyTo, `⚠️ ${res.error}\n\nVuelve a escribir el valor o *cancelar*.`);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "TICKET_EDIT_RETRY",
              pending_action: activeTk2,
            })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        const newPa = { type: "ticket_confirm", draft: res.draft, adjunto_path: activeTk2.adjunto_path };
        await supabase.from("wa_messages").update({ pending_action: null }).eq("id", tk2Row!.id);
        await enviarConfirmacionTicket(replyTo, res.draft);
        await supabase
          .from("wa_messages")
          .update({
            estado: "procesado",
            comando: "TICKET_EDIT_APPLIED",
            pending_action: newPa,
            resultado: { field: activeTk2.awaiting_field, new_value: userInput },
          })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }

    if (activeWiz && msg.texto && !selectionId) {
      const userInput = msg.texto.trim();
      // Cancelar
      if (isCancel(userInput)) {
        await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizRow!.id);
        await sendWhatsAppText(replyTo, "❌ Operación cancelada.");
        await enviarMenuPrincipal(replyTo);
        await supabase
          .from("wa_messages")
          .update({ estado: "procesado", comando: "WIZARD_CANCEL" })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // ---- Caso especial: el usuario eligió "➕ Crear nuevo cliente" en el picker
      // y ahora está escribiendo el NOMBRE del cliente nuevo a crear sobre la marcha.
      if (activeWiz.awaiting_new_client) {
        const stepsAW = FLOWS[activeWiz.flow];
        const stepAW = stepsAW?.[activeWiz.step];
        const nombre = userInput;
        if (nombre.length < 2) {
          await sendWhatsAppText(
            replyTo,
            "⚠️ El nombre es demasiado corto. Escribe el *nombre del cliente* o *cancelar*.",
          );
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "WIZARD_RETRY" })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        // Crea el cliente al vuelo
        const { data: nuevoCli, error: errCli } = await supabase
          .from("clients")
          .insert({ company_id: msg.company_id, nombre })
          .select("id, nombre")
          .single();
        if (errCli || !nuevoCli) {
          await sendWhatsAppText(replyTo, `⚠️ No pude crear el cliente: ${String(errCli?.message ?? "error")}.`);
          await supabase
            .from("wa_messages")
            .update({ estado: "error", resultado: { error: String(errCli) } })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        await sendWhatsAppText(replyTo, `✅ Cliente *${nuevoCli.nombre}* creado y asignado.`);
        // Avanzamos el wizard como si hubiera seleccionado este cliente desde la lista
        const newDataNC = { ...activeWiz.data, [stepAW.field]: nuevoCli.nombre, cliente_id: nuevoCli.id };
        const newStepNC = activeWiz.step + 1;
        await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizRow!.id);
        if (newStepNC < stepsAW.length) {
          const newWizNC = { type: "wizard", flow: activeWiz.flow, step: newStepNC, data: newDataNC };
          await preguntarPasoActual(replyTo, newWizNC, supabase, msg.company_id);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "WIZARD_NEXT",
              pending_action: newWizNC,
              resultado: { wizard: activeWiz.flow, step: newStepNC, created_client: nuevoCli.id },
            })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        // Último paso → ejecutar
        const finalWizNC = { type: "wizard", flow: activeWiz.flow, step: activeWiz.step, data: newDataNC };
        try {
          const { respuesta, pendingAction } = await ejecutarWizard(supabase, msg, finalWizNC, replyTo);
          await sendWhatsAppText(replyTo, respuesta);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "WIZARD_DONE",
              pending_action: pendingAction ?? null,
              resultado: { wizard: activeWiz.flow, data: newDataNC, reply: respuesta },
            })
            .eq("id", messageId);
        } catch (e) {
          await sendWhatsAppText(replyTo, `⚠️ Error: ${String(e).slice(0, 140)}`);
          await supabase
            .from("wa_messages")
            .update({ estado: "error", resultado: { error: String(e) } })
            .eq("id", messageId);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      const steps = FLOWS[activeWiz.flow];
      const step = steps?.[activeWiz.step];
      if (!step) {
        // Wizard inválido → limpiar
        await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizRow!.id);
      } else {
        // Validar input
        const skipped = step.optional && isOptionalSkip(userInput);
        const validationError = skipped ? null : step.validate ? step.validate(userInput) : null;
        if (validationError) {
          await sendWhatsAppText(
            replyTo,
            `⚠️ ${validationError}\n\n${step.prompt}\n\n_Escribe *cancelar* para salir._`,
          );
          await supabase
            .from("wa_messages")
            .update({ estado: "procesado", comando: "WIZARD_RETRY" })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        // Guardar valor
        const value = skipped ? null : step.parse ? step.parse(userInput) : userInput;
        const newData = { ...activeWiz.data, [step.field]: value };
        let newStep = activeWiz.step + 1;

        // ----- Caso especial multi-línea (factura_crear): paso "otra_linea" SI/NO -----
        if (activeWiz.flow === "factura_crear" && step.field === "otra_linea") {
          const lineas = Array.isArray(newData.lineas) ? [...newData.lineas] : [];
          // Empujamos la línea recién terminada (concepto + importe).
          if (newData.concepto != null && newData.importe != null) {
            lineas.push({ concepto: String(newData.concepto), importe: Number(newData.importe) });
          }
          newData.lineas = lineas;
          const quiereOtra = String(value ?? "")
            .trim()
            .toLowerCase()
            .startsWith("s");
          if (quiereOtra) {
            // Volvemos al paso "concepto" (índice 0) y limpiamos los campos de la línea anterior.
            delete newData.concepto;
            delete newData.importe;
            delete newData.otra_linea;
            const newWiz = { ...activeWiz, step: 0, data: newData };
            await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizRow!.id);
            const total = lineas.reduce((s, l) => s + Number(l.importe || 0), 0);
            await sendWhatsAppText(
              replyTo,
              `📋 Líneas hasta ahora (${lineas.length}) · Subtotal: ${eur(total)}\n${lineas.map((l, i) => `${i + 1}. ${l.concepto} — ${eur(Number(l.importe))}`).join("\n")}\n\n➡️ Vamos con la siguiente línea.`,
            );
            await preguntarPasoActual(replyTo, newWiz, supabase, msg.company_id);
            await supabase
              .from("wa_messages")
              .update({
                estado: "procesado",
                comando: "WIZARD_ADD_LINE",
                pending_action: newWiz,
                resultado: { wizard: activeWiz.flow, lineas_count: lineas.length },
              })
              .eq("id", messageId);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
          // NO → continuamos al paso "cliente"
        }

        if (newStep < steps.length) {
          // Siguiente paso
          const newWiz = { ...activeWiz, step: newStep, data: newData };
          await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizRow!.id);
          await preguntarPasoActual(replyTo, newWiz, supabase, msg.company_id);
          await supabase
            .from("wa_messages")
            .update({
              estado: "procesado",
              comando: "WIZARD_NEXT",
              pending_action: newWiz,
              resultado: { wizard: activeWiz.flow, step: newStep },
            })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        // Último paso → ejecutar
        await supabase.from("wa_messages").update({ pending_action: null }).eq("id", wizRow!.id);
        const finalWiz = { ...activeWiz, data: newData };
        try {
          const { respuesta, pendingAction } = await ejecutarWizard(supabase, msg, finalWiz, replyTo);
          // Permitir "fall-through" a otro comando (resumen/gestoria) reescribiendo msg.texto
          if (respuesta.startsWith("__FALLTHROUGH__:")) {
            msg.texto = respuesta.replace("__FALLTHROUGH__:", "");
            // sigue al parser de comandos abajo
          } else {
            await sendWhatsAppText(replyTo, respuesta);
            await supabase
              .from("wa_messages")
              .update({
                estado: "procesado",
                comando: "WIZARD_DONE",
                pending_action: pendingAction ?? null,
                resultado: { wizard: activeWiz.flow, data: newData, reply: respuesta },
              })
              .eq("id", messageId);
            return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
          }
        } catch (e) {
          await sendWhatsAppText(replyTo, `⚠️ Error: ${String(e).slice(0, 140)}`);
          await supabase
            .from("wa_messages")
            .update({ estado: "error", resultado: { error: String(e) } })
            .eq("id", messageId);
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
      }
    }

    // ============ Confirmaciones SI/NO sobre acción pendiente ============
    const upperText = (msg.texto ?? "").trim().toUpperCase();
    if (upperText === "SI" || upperText === "SÍ" || upperText === "NO") {
      // Buscar la última pending_action de este remitente en últimos 5 min
      const since = new Date(Date.now() - 5 * 60_000).toISOString();
      const { data: pendings } = await supabase
        .from("wa_messages")
        .select("id, pending_action")
        .eq("remitente", replyTo)
        .not("pending_action", "is", null)
        .gte("recibido_en", since)
        .order("recibido_en", { ascending: false })
        .limit(1);
      const pend = pendings?.[0];
      if (!pend?.pending_action) {
        if (expGan) return await procesarConIa(msg.texto ?? upperText, "IA_CONFIRM");
        await sendWhatsAppText(replyTo, "ℹ️ No tienes ninguna acción pendiente de confirmar.");
        await supabase
          .from("wa_messages")
          .update({ estado: "procesado", comando: upperText, resultado: { info: "sin pending" } })
          .eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // Limpiar pending
      await supabase.from("wa_messages").update({ pending_action: null }).eq("id", pend.id);
      if (upperText === "NO") {
        await sendWhatsAppText(replyTo, "❌ Acción cancelada.");
        await supabase.from("wa_messages").update({ estado: "procesado", comando: "NO" }).eq("id", messageId);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      // SI → ejecutar
      const action = pend.pending_action;
      let respuesta = "✅ Hecho.";
      try {
        if (action.type === "anular_factura") {
          const { data } = await supabase
            .from("invoices")
            .update({ estado: "anulada" as any })
            .eq("company_id", msg.company_id)
            .eq("id", action.invoice_id)
            .select()
            .maybeSingle();
          respuesta = data ? `🚫 Factura *${data.numero}* anulada.` : "❌ No se pudo anular.";
        } else if (action.type === "borrar_cliente") {
          await supabase.from("clients").delete().eq("company_id", msg.company_id).eq("id", action.client_id);
          respuesta = `🗑️ Cliente *${action.nombre}* eliminado.`;
        } else if (action.type === "enviar_gestoria") {
          // Generar PDF resumen y enviarlo
          const { trimestre, anio } = action;
          const meses = [(trimestre - 1) * 3 + 1, (trimestre - 1) * 3 + 2, trimestre * 3];
          const desde = `${anio}-${String(meses[0]).padStart(2, "0")}-01`;
          const hastaDate = new Date(anio, meses[2], 0);
          const hasta = `${anio}-${String(meses[2]).padStart(2, "0")}-${String(hastaDate.getDate()).padStart(2, "0")}`;
          const [{ data: invs }, { data: gas }, { data: co }] = await Promise.all([
            supabase
              .from("invoices")
              .select("total,iva_importe")
              .eq("company_id", msg.company_id)
              .gte("fecha", desde)
              .lte("fecha", hasta),
            supabase
              .from("expenses")
              .select("total,iva_importe")
              .eq("company_id", msg.company_id)
              .gte("fecha", desde)
              .lte("fecha", hasta),
            supabase
              .from("companies")
              .select("nombre_comercial,nif,gestoria_email")
              .eq("id", msg.company_id)
              .maybeSingle(),
          ]);
          const ingresos = (invs ?? []).reduce((s, i) => s + Number(i.total), 0);
          const gastos = (gas ?? []).reduce((s, g) => s + Number(g.total), 0);
          const ivaRep = (invs ?? []).reduce((s, i) => s + Number(i.iva_importe), 0);
          const ivaSop = (gas ?? []).reduce((s, g) => s + Number(g.iva_importe), 0);
          const pdf = pdfResumenTrimestre({
            empresa: co?.nombre_comercial ?? "Empresa",
            nif: co?.nif,
            trimestre,
            anio,
            ingresos,
            gastos,
            ivaRep,
            ivaSop,
            facturasCount: (invs ?? []).length,
            gastosCount: (gas ?? []).length,
          });
          const zip = new JSZip();
          zip.file(`resumen-T${trimestre}-${anio}.pdf`, pdf);
          const zipBytes = await zip.generateAsync({ type: "uint8array" });
          const zipPath = `${msg.company_id}/T${trimestre}-${anio}.zip`;
          await supabase.storage
            .from("invoices")
            .upload(zipPath, zipBytes, { contentType: "application/zip", upsert: true });
          const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(zipPath, 60 * 60 * 24 * 7);
          if (signed?.signedUrl) {
            await sendWhatsAppDocument(
              replyTo,
              signed.signedUrl,
              `T${trimestre}-${anio}.zip`,
              `Trimestre ${trimestre}/${anio}`,
            );
          }
          // Marcar cierres
          for (const m of meses) {
            await supabase.from("monthly_closures").upsert(
              {
                company_id: msg.company_id,
                anio,
                mes: m,
                trimestre_listo: true,
                enviado_gestoria_en: new Date().toISOString(),
              },
              { onConflict: "company_id,anio,mes" },
            );
          }
          respuesta = `📁 Trimestre *${trimestre}/${anio}* enviado${co?.gestoria_email ? ` (gestor: ${co.gestoria_email})` : ""}.`;
        }
      } catch (e) {
        respuesta = `⚠️ Error ejecutando: ${String(e).slice(0, 120)}`;
      }
      await sendWhatsAppText(replyTo, respuesta);
      await supabase
        .from("wa_messages")
        .update({ estado: "procesado", comando: "SI", resultado: { action, reply: respuesta } })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const textoLimpio = (msg.texto ?? "").trim();

    // Si no hay texto y tampoco es un tipo que necesite parseo por comando,
    // no respondemos con AYUDA para evitar mensajes basura/duplicados.
    if (!textoLimpio) {
      await supabase
        .from("wa_messages")
        .update({
          estado: "procesado",
          comando: "IGNORADO_SIN_TEXTO",
          resultado: { info: "mensaje sin texto ignorado" },
        })
        .eq("id", messageId);

      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: corsHeaders,
      });
    }

    const parsed = parseCommand(textoLimpio);
    if (!parsed) {
      if (expGan) {
        try {
          return await procesarConIa(textoLimpio, "IA_TEXTO");
        } catch (e) {
          console.error("wa texto ia", e);
        }
      }
      const txt = "🤔 No reconozco el comando. Escribe *AYUDA*.\n\n" + HELP_TEXT;
      await sendWhatsAppText(replyTo, txt);
      await supabase
        .from("wa_messages")
        .update({ estado: "pendiente", resultado: { reply: txt } })
        .eq("id", messageId);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const { cmd, rest } = parsed;
    let resultado: any = { cmd };
    let respuesta = "";
    let pendingAction: any = null;

    // Si el usuario escribe el comando "pelado" (sin parámetros), iniciamos el wizard correspondiente.
    const startWizardIfEmpty = async (flow: string): Promise<boolean> => {
      const wiz = buildWizard(flow);
      await preguntarPasoActual(replyTo, wiz, supabase, msg.company_id);
      await supabase
        .from("wa_messages")
        .update({
          estado: "procesado",
          comando: `WIZARD_START:${cmd}`,
          pending_action: wiz,
          resultado: { wizard: flow, trigger: "comando_vacio" },
        })
        .eq("id", messageId);
      return true;
    };
    if (!rest) {
      if (cmd === "FACTURA") {
        await startWizardIfEmpty("factura_crear");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (cmd === "GASTO") {
        await startWizardIfEmpty("gasto_crear");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (cmd === "COBRO") {
        await startWizardIfEmpty("factura_cobro");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (cmd === "FACTURAS") {
        await startWizardIfEmpty("facturas_listar");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (cmd === "GASTOS") {
        await startWizardIfEmpty("gastos_listar");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }
    if (cmd === "CLIENTE") {
      const subUpper = rest.toUpperCase();
      const sub = subUpper.split(/\s+/)[0] ?? "";
      const args = rest.slice(sub.length).trim();
      if (sub === "NUEVO" && !args) {
        await startWizardIfEmpty("cliente_crear");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (sub === "BUSCAR" && !args) {
        await startWizardIfEmpty("cliente_buscar");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if ((sub === "BORRAR" || sub === "ELIMINAR") && !args) {
        await startWizardIfEmpty("cliente_borrar");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (!sub) {
        await startWizardIfEmpty("cliente_crear");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }
    if (cmd === "FACTURA" && rest) {
      const subUpper = rest.toUpperCase();
      const sub = subUpper.split(/\s+/)[0] ?? "";
      const args = rest.slice(sub.length).trim();
      if (sub === "VER" && !args) {
        await startWizardIfEmpty("factura_ver");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (sub === "PDF" && !args) {
        await startWizardIfEmpty("factura_pdf");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
      if (sub === "ANULAR" && !args) {
        await startWizardIfEmpty("factura_anular");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }
    }
    if (cmd === "EMPRESA" && rest.toUpperCase() === "IVA") {
      await startWizardIfEmpty("empresa_iva");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // ===================== FACTURA / FACTURAS =====================
    if (cmd === "FACTURAS") {
      const filtro = rest.toLowerCase();
      let q = supabase
        .from("invoices")
        .select("numero, fecha, total, estado, clients(nombre)")
        .eq("company_id", msg.company_id)
        .order("fecha", { ascending: false })
        .limit(15);
      if (filtro.startsWith("pend")) q = q.neq("estado", "cobrada");
      else if (filtro.startsWith("cob")) q = q.eq("estado", "cobrada");
      else if (parseMes(filtro)) {
        const m = parseMes(filtro)!;
        const y = new Date().getFullYear();
        q = q
          .gte("fecha", `${y}-${String(m).padStart(2, "0")}-01`)
          .lte("fecha", `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`);
      }
      const { data } = await q;
      if (!data?.length) respuesta = "📭 No hay facturas con ese filtro.";
      else
        respuesta =
          `📄 *Facturas* (${data.length})\n\n` +
          data
            .map(
              (i: any) =>
                `• ${i.numero} · ${fechaCorta(i.fecha)} · ${eur(Number(i.total))} · _${i.estado}_${i.clients?.nombre ? ` · ${i.clients.nombre}` : ""}`,
            )
            .join("\n");
    } else if (cmd === "FACTURA") {
      const sub = rest.toUpperCase();
      if (sub.startsWith("VER ") || sub.startsWith("PDF ") || sub.startsWith("ANULAR ")) {
        const numMatch = rest.match(/([0-9]{4}-[0-9]{2,4})/);
        if (!numMatch) {
          respuesta = "❌ Indica el nº de factura. Ej: *FACTURA VER 2026-0001*";
        } else {
          const numero = numMatch[1];
          const { data: inv } = await supabase
            .from("invoices")
            .select("*, clients(nombre, nif)")
            .eq("company_id", msg.company_id)
            .eq("numero", numero)
            .maybeSingle();
          if (!inv) respuesta = `❌ No encuentro la factura *${numero}*.`;
          else if (sub.startsWith("VER ")) {
            respuesta = `📄 *Factura ${inv.numero}*\nFecha: ${fechaCorta(inv.fecha)}\nCliente: ${inv.clients?.nombre ?? "(sin asignar)"}\nConcepto: ${inv.concepto}\nBase: ${eur(Number(inv.base_imponible))}\nIVA ${inv.iva_porcentaje}%: ${eur(Number(inv.iva_importe))}\n*Total: ${eur(Number(inv.total))}*\nEstado: ${inv.estado}`;
          } else if (sub.startsWith("PDF ")) {
            const r = await generarYEnviarFacturaPDF(supabase, inv.id, replyTo);
            respuesta = r.ok ? `📎 PDF de la factura *${numero}* enviado.` : `⚠️ Error generando PDF.`;
          } else {
            // ANULAR
            pendingAction = { type: "anular_factura", invoice_id: inv.id, numero: inv.numero };
            respuesta = `⚠️ ¿Anular factura *${inv.numero}* (${eur(Number(inv.total))})?\nResponde *SI* para confirmar o *NO* para cancelar.`;
          }
        }
      } else {
        // Crear nueva factura
        const importe = extractMoney(rest);
        if (!importe) {
          respuesta = "❌ Falta el importe.\nEj: *FACTURA 350 reparar tejado a Juan*";
        } else {
          const concepto =
            rest
              .replace(/\d+[.,]?\d*/, "")
              .replace(/\b(a|para|cliente)\s+.+$/i, "")
              .trim() || "Factura por WhatsApp";
          const cliente = extractClientName(rest);
          let clientId: string | null = null;
          let clienteNombre = cliente;
          if (cliente) {
            const { data: cli } = await supabase
              .from("clients")
              .select("id, nombre")
              .eq("company_id", msg.company_id)
              .ilike("nombre", `%${cliente}%`)
              .maybeSingle();
            clientId = cli?.id ?? null;
            if (cli?.nombre) clienteNombre = cli.nombre;
          }
          const { data: co } = await supabase
            .from("companies")
            .select("iva_default, irpf_default, serie_facturacion")
            .eq("id", msg.company_id)
            .maybeSingle();
          const ivaPct = Number(co?.iva_default ?? 21);
          const irpfPct = Number(co?.irpf_default ?? 0);
          const base = importe;
          const ivaImp = +((base * ivaPct) / 100).toFixed(2);
          const irpfImp = +((base * irpfPct) / 100).toFixed(2);
          const total = +(base + ivaImp - irpfImp).toFixed(2);
          const serie = (co?.serie_facturacion ?? "A").toString();
          const year = new Date().getFullYear();
          const prefix = `${serie}${year}-`;
          const { data: last } = await supabase
            .from("invoices")
            .select("numero")
            .eq("company_id", msg.company_id)
            .like("numero", `${prefix}%`)
            .order("numero", { ascending: false })
            .limit(1);
          const lastSeq = last?.[0]?.numero?.split("-").pop();
          const numero = `${prefix}${String(lastSeq ? Number(lastSeq) + 1 : 1).padStart(4, "0")}`;
          const mencion = irpfPct > 0
            ? `Operación sujeta a retención de IRPF al ${irpfPct}% conforme al art. 99 LIRPF.`
            : null;
          const { data: inv, error } = await supabase
            .from("invoices")
            .insert({
              company_id: msg.company_id,
              client_id: clientId,
              numero,
              serie,
              fecha: new Date().toISOString().slice(0, 10),
              concepto,
              base_imponible: base,
              iva_porcentaje: ivaPct,
              iva_importe: ivaImp,
              irpf_porcentaje: irpfPct,
              irpf_importe: irpfImp,
              total,
              tipo: "ordinaria",
              mencion_legal: mencion,
              estado: "borrador",
            })
            .select()
            .single();
          if (error) throw error;
          // Una sola línea con IVA por línea
          await supabase.from("invoice_lines").insert({
            invoice_id: inv.id,
            company_id: msg.company_id,
            orden: 0,
            concepto,
            cantidad: 1,
            precio_unitario: base,
            descuento_porcentaje: 0,
            iva_porcentaje: ivaPct,
            iva_importe: ivaImp,
            importe: base,
            total: +(base + ivaImp).toFixed(2),
          });
          // Emitir (RD 1619/2012)
          await supabase
            .from("invoices")
            .update({ estado: "emitida" as any })
            .eq("id", inv.id);
          // Generar y enviar PDF
          await generarYEnviarFacturaPDF(supabase, inv.id, replyTo);
          resultado = { ...resultado, factura_id: inv.id, numero, total };
          const irpfTxt = irpfPct > 0 ? ` · IRPF ${irpfPct}%: -${eur(irpfImp)}` : "";
          respuesta = `✅ *Factura ${numero}* emitida\nConcepto: ${concepto}\n${clienteNombre ? `Cliente: ${clienteNombre}${!clientId ? " ⚠️ (no encontrado)" : ""}\n` : ""}Base: ${eur(base)} · IVA ${ivaPct}%: ${eur(ivaImp)}${irpfTxt}\n*Total: ${eur(total)}*\n🔒 Inmutable (RD 1619/2012). Para corregir, emite una rectificativa desde la web.\n📎 PDF enviado.`;
        }
      }
    }
    // ===================== GASTO / GASTOS =====================
    else if (cmd === "GASTOS") {
      const filtro = rest.toLowerCase();
      let q = supabase
        .from("expenses")
        .select("fecha, concepto, total, estado, categoria")
        .eq("company_id", msg.company_id)
        .order("fecha", { ascending: false })
        .limit(15);
      if (filtro.startsWith("pend")) q = q.eq("estado", "pendiente");
      else if (parseMes(filtro)) {
        const m = parseMes(filtro)!;
        const y = new Date().getFullYear();
        q = q
          .gte("fecha", `${y}-${String(m).padStart(2, "0")}-01`)
          .lte("fecha", `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`);
      }
      const { data } = await q;
      if (!data?.length) respuesta = "📭 No hay gastos con ese filtro.";
      else {
        const tot = data.reduce((s: number, g: any) => s + Number(g.total), 0);
        respuesta =
          `🧾 *Gastos* (${data.length} · ${eur(tot)})\n\n` +
          data
            .map((g: any) => `• ${fechaCorta(g.fecha)} · ${g.concepto} · ${eur(Number(g.total))} · _${g.categoria}_`)
            .join("\n");
      }
    } else if (cmd === "GASTO") {
      const importe = extractMoney(rest);
      if (!importe) respuesta = "❌ Falta el importe.\nEj: *GASTO gasoil 65*";
      else {
        const concepto = rest.replace(/\d+[.,]?\d*/, "").trim() || "Gasto por WhatsApp";
        const total = importe;
        const { data: g, error } = await supabase
          .from("expenses")
          .insert({
            company_id: msg.company_id,
            fecha: new Date().toISOString().slice(0, 10),
            concepto,
            categoria: "otros",
            base_imponible: total,
            iva_porcentaje: 0,
            iva_importe: 0,
            total,
            estado: "pendiente",
            origen: "whatsapp",
          })
          .select()
          .single();
        if (error) throw error;
        resultado = { ...resultado, gasto_id: g.id, total };
        respuesta = `✅ *Gasto registrado*\nConcepto: ${concepto}\n*Total: ${eur(total)}*`;
      }
    }
    // ===================== COBRO =====================
    else if (cmd === "COBRO") {
      const numMatch = rest.match(/([0-9]{4}-[0-9]{2,4})/);
      if (!numMatch) respuesta = "❌ Indica el nº de factura.\nEj: *COBRO 2026-0014*";
      else {
        const numero = numMatch[1];
        const { data: inv } = await supabase
          .from("invoices")
          .update({ estado: "cobrada" as any, fecha_cobro: new Date().toISOString().slice(0, 10) })
          .eq("company_id", msg.company_id)
          .eq("numero", numero)
          .select()
          .maybeSingle();
        respuesta = inv ? `✅ Factura *${numero}* marcada como cobrada.` : `❌ No encuentro la factura *${numero}*.`;
      }
    }
    // ===================== CLIENTE / CLIENTES =====================
    else if (cmd === "CLIENTES") {
      const { data } = await supabase
        .from("clients")
        .select("nombre, telefono, email")
        .eq("company_id", msg.company_id)
        .order("nombre")
        .limit(30);
      if (!data?.length) respuesta = "📭 No tienes clientes. Crea uno con *CLIENTE NUEVO <nombre>*.";
      else
        respuesta =
          `👥 *Clientes* (${data.length})\n\n` +
          data
            .map((c: any) => `• ${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}${c.email ? ` · ${c.email}` : ""}`)
            .join("\n");
    } else if (cmd === "CLIENTE") {
      const sub = rest.toUpperCase();
      if (sub.startsWith("NUEVO ") || sub.startsWith("ALTA ")) {
        const body = rest.replace(/^(NUEVO|ALTA)\s+/i, "").trim();
        if (!body) respuesta = "❌ Indica al menos el nombre. Ej: *CLIENTE NUEVO Juan Pérez 600111222 juan@mail.com*";
        else {
          const email = extractEmail(body);
          const tel = extractPhone(body);
          const nif = extractNif(body);
          const nombre = body
            .replace(email ?? "", "")
            .replace(tel ?? "", "")
            .replace(nif ?? "", "")
            .trim()
            .replace(/\s+/g, " ");
          if (!nombre) respuesta = "❌ Falta el nombre.";
          else {
            const { data: c, error } = await supabase
              .from("clients")
              .insert({
                company_id: msg.company_id,
                nombre,
                email,
                telefono: tel,
                nif,
              })
              .select()
              .single();
            if (error) throw error;
            respuesta = `✅ Cliente *${c.nombre}* creado.${tel ? `\nTel: ${tel}` : ""}${email ? `\nEmail: ${email}` : ""}${nif ? `\nNIF: ${nif}` : ""}`;
          }
        }
      } else if (sub.startsWith("BUSCAR ")) {
        const q = rest.slice(7).trim();
        const { data } = await supabase
          .from("clients")
          .select("nombre, telefono, email, nif")
          .eq("company_id", msg.company_id)
          .ilike("nombre", `%${q}%`)
          .limit(10);
        respuesta = data?.length
          ? `🔎 *Resultados* (${data.length})\n\n` +
            data
              .map(
                (c: any) =>
                  `• ${c.nombre}${c.telefono ? ` · ${c.telefono}` : ""}${c.email ? ` · ${c.email}` : ""}${c.nif ? ` · ${c.nif}` : ""}`,
              )
              .join("\n")
          : `🔎 Sin resultados para "${q}".`;
      } else if (sub.startsWith("BORRAR ") || sub.startsWith("ELIMINAR ")) {
        const q = rest.replace(/^(BORRAR|ELIMINAR)\s+/i, "").trim();
        const { data: c } = await supabase
          .from("clients")
          .select("id, nombre")
          .eq("company_id", msg.company_id)
          .ilike("nombre", `%${q}%`)
          .maybeSingle();
        if (!c) respuesta = `❌ No encuentro un cliente que coincida con "${q}".`;
        else {
          pendingAction = { type: "borrar_cliente", client_id: c.id, nombre: c.nombre };
          respuesta = `⚠️ ¿Borrar al cliente *${c.nombre}*?\nResponde *SI* o *NO*.`;
        }
      } else {
        respuesta =
          "🤔 Subcomando no reconocido.\n\n• CLIENTE NUEVO <nombre> [tel] [email]\n• CLIENTE BUSCAR <texto>\n• CLIENTE BORRAR <nombre>\n• CLIENTES (lista)";
      }
    }
    // ===================== EMPRESA =====================
    else if (cmd === "EMPRESA") {
      const sub = rest.toUpperCase();
      if (sub.startsWith("IVA ")) {
        const pct = extractMoney(rest);
        if (pct == null) respuesta = "❌ Indica el % de IVA. Ej: *EMPRESA IVA 10*";
        else {
          await supabase.from("companies").update({ iva_default: pct }).eq("id", msg.company_id);
          respuesta = `✅ IVA por defecto cambiado a *${pct}%*.`;
        }
      } else if (sub.startsWith("IRPF ")) {
        const pct = extractMoney(rest);
        if (pct == null) respuesta = "❌ Indica el % de IRPF. Ej: *EMPRESA IRPF 15*";
        else {
          await supabase.from("companies").update({ irpf_default: pct }).eq("id", msg.company_id);
          respuesta = `✅ IRPF por defecto cambiado a *${pct}%*.`;
        }
      } else {
        const { data: co } = await supabase.from("companies").select("*").eq("id", msg.company_id).maybeSingle();
        const dirCompleta = [co?.direccion, [co?.codigo_postal, co?.ciudad].filter(Boolean).join(" "), co?.provincia]
          .filter(Boolean).join(" · ") || "—";
        respuesta = `🏢 *${co?.nombre_comercial}*\n${co?.razon_social ? `${co.razon_social}\n` : ""}NIF: ${co?.nif ?? "—"}\nDirección: ${dirCompleta}\nEmail: ${co?.email ?? "—"}\nTel: ${co?.telefono ?? "—"}\nSerie facturación: ${co?.serie_facturacion ?? "A"}\nIVA por defecto: ${co?.iva_default}%\nIRPF por defecto: ${co?.irpf_default ?? 0}%\nGestor: ${co?.gestoria_nombre ?? "—"} · ${co?.gestoria_email ?? "—"}\nPara cambiar IVA: *EMPRESA IVA 10*\nPara cambiar IRPF: *EMPRESA IRPF 15*`;
      }
    }
    // ===================== RESUMEN =====================
    else if (cmd === "RESUMEN") {
      const mes = parseMes(rest) ?? new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const desde = `${year}-${String(mes).padStart(2, "0")}-01`;
      const hasta = `${year}-${String(mes).padStart(2, "0")}-${String(new Date(year, mes, 0).getDate()).padStart(2, "0")}`;
      const [{ data: invs }, { data: gas }] = await Promise.all([
        supabase
          .from("invoices")
          .select("base_imponible,iva_importe,total,estado")
          .eq("company_id", msg.company_id)
          .gte("fecha", desde)
          .lte("fecha", hasta),
        supabase
          .from("expenses")
          .select("base_imponible,iva_importe,total")
          .eq("company_id", msg.company_id)
          .gte("fecha", desde)
          .lte("fecha", hasta),
      ]);
      const ingresos = (invs ?? []).reduce((s, i) => s + Number(i.total), 0);
      const ivaRep = (invs ?? []).reduce((s, i) => s + Number(i.iva_importe), 0);
      const gastos = (gas ?? []).reduce((s, g) => s + Number(g.total), 0);
      const ivaSop = (gas ?? []).reduce((s, g) => s + Number(g.iva_importe), 0);
      const cobradas = (invs ?? []).filter((i) => i.estado === "cobrada").length;
      const pendientes = (invs ?? []).filter((i) => i.estado !== "cobrada").length;
      respuesta = `📊 *Resumen ${MES_NOMBRES[mes - 1]} ${year}*\n\nFacturas: ${(invs ?? []).length} (${cobradas} cob, ${pendientes} pend)\nIngresos: *${eur(ingresos)}*\nGastos: *${eur(gastos)}*\nBeneficio: *${eur(ingresos - gastos)}*\n\nIVA repercutido: ${eur(ivaRep)}\nIVA soportado: ${eur(ivaSop)}\nIVA a liquidar: *${eur(ivaRep - ivaSop)}*`;
    }
    // ===================== GESTORIA =====================
    else if (cmd === "GESTORIA") {
      const enviar = /ENVIAR/i.test(rest);
      const tMatch = rest.match(/(\d)/);
      const trimestre = tMatch ? Number(tMatch[1]) : Math.ceil((new Date().getMonth() + 1) / 3);
      const year = new Date().getFullYear();
      if (enviar) {
        const { data: co } = await supabase
          .from("companies")
          .select("gestoria_email, gestoria_nombre")
          .eq("id", msg.company_id)
          .maybeSingle();
        pendingAction = { type: "enviar_gestoria", trimestre, anio: year };
        respuesta = `⚠️ ¿Enviar trimestre *${trimestre}/${year}* a la gestoría${co?.gestoria_email ? ` (${co.gestoria_email})` : ""}?\nGeneraré el PDF y te lo mando por aquí.\nResponde *SI* o *NO*.`;
      } else {
        const meses = [(trimestre - 1) * 3 + 1, (trimestre - 1) * 3 + 2, trimestre * 3];
        const desde = `${year}-${String(meses[0]).padStart(2, "0")}-01`;
        const hasta = `${year}-${String(meses[2]).padStart(2, "0")}-${String(new Date(year, meses[2], 0).getDate()).padStart(2, "0")}`;
        const [{ data: invs }, { data: gas }] = await Promise.all([
          supabase
            .from("invoices")
            .select("total,iva_importe")
            .eq("company_id", msg.company_id)
            .gte("fecha", desde)
            .lte("fecha", hasta),
          supabase
            .from("expenses")
            .select("total,iva_importe")
            .eq("company_id", msg.company_id)
            .gte("fecha", desde)
            .lte("fecha", hasta),
        ]);
        const ingresos = (invs ?? []).reduce((s, i) => s + Number(i.total), 0);
        const gastos = (gas ?? []).reduce((s, g) => s + Number(g.total), 0);
        const ivaRep = (invs ?? []).reduce((s, i) => s + Number(i.iva_importe), 0);
        const ivaSop = (gas ?? []).reduce((s, g) => s + Number(g.iva_importe), 0);
        respuesta = `📁 *Trimestre ${trimestre}/${year}*\n\nFacturas: ${(invs ?? []).length} · ${eur(ingresos)}\nGastos: ${(gas ?? []).length} · ${eur(gastos)}\nIVA a liquidar: *${eur(ivaRep - ivaSop)}*\n\nPara enviarlo al gestor: *GESTORIA ENVIAR trimestre ${trimestre}*`;
      }
    }
    // ===================== AYUDA =====================
    else if (cmd === "AYUDA") {
      respuesta = HELP_TEXT;
    }

    if (!respuesta) respuesta = "🤔 No entendí el subcomando. Escribe *AYUDA*.";
    const sendRes = await sendWhatsAppText(replyTo, respuesta);
    resultado.reply = respuesta;
    resultado.send = sendRes;

    await supabase
      .from("wa_messages")
      .update({
        estado: "procesado",
        comando: cmd,
        resultado,
        tipo: "comando" as any,
        pending_action: pendingAction,
      })
      .eq("id", messageId);
    return new Response(JSON.stringify({ ok: true, resultado }), { headers: corsHeaders });
  } catch (e) {
    console.error("wa-process-message", e);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    try {
      if (messageId) {
        const { data: msg } = await supabase.from("wa_messages").select("remitente").eq("id", messageId).maybeSingle();
        if (msg?.remitente)
          await sendWhatsAppText(msg.remitente, "⚠️ Ha ocurrido un error procesando tu mensaje. Inténtalo de nuevo.");
        await supabase
          .from("wa_messages")
          .update({ estado: "error", resultado: { error: String(e) } })
          .eq("id", messageId);
      }
    } catch {}
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
