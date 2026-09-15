import jsPDF from "jspdf";
import { eur, fechaCorta } from "./format";

export type FacturaTemplate = "profesional" | "creativa" | "corporativa" | "elegante" | "personalizada";

export const FACTURA_TEMPLATES: { id: FacturaTemplate; nombre: string; descripcion: string }[] = [
  { id: "profesional", nombre: "Profesional", descripcion: "Azul corporativo, limpia y formal." },
  { id: "creativa",    nombre: "Creativa",    descripcion: "Acento naranja y tipografía moderna." },
  { id: "corporativa", nombre: "Corporativa", descripcion: "Gris y negro, sobria y seria." },
  { id: "elegante",    nombre: "Elegante",    descripcion: "Tipografía serif refinada, líneas finas." },
  { id: "personalizada", nombre: "Personalizada", descripcion: "Tu logo, tus colores y tu encabezado." },
];

export type LineaPDF = {
  concepto: string;
  cantidad?: number;
  precio_unitario?: number;
  descuento_porcentaje?: number;
  iva_porcentaje?: number;
  importe: number; // base de la línea (sin IVA, con descuento aplicado)
};

export type InvoicePDFData = {
  numero: string;
  serie?: string | null;
  fecha: string;
  fecha_operacion?: string | null;
  fecha_vencimiento?: string | null;
  concepto: string;
  base_imponible: number;
  iva_porcentaje: number; // tipo dominante (legacy / fallback)
  iva_importe: number;
  irpf_porcentaje?: number;
  irpf_importe?: number;
  total: number;
  notas?: string | null;
  lineas?: LineaPDF[];
  emisor: {
    nombre: string; nif?: string | null;
    direccion?: string | null; codigo_postal?: string | null; ciudad?: string | null; provincia?: string | null;
    email?: string | null; telefono?: string | null;
  };
  cliente?: {
    nombre: string; nif?: string | null;
    direccion?: string | null; codigo_postal?: string | null; ciudad?: string | null; provincia?: string | null;
  } | null;
  template?: FacturaTemplate;
  metodo_pago?: string | null;
  tipo?: "ordinaria" | "rectificativa";
  factura_rectificada?: { numero: string; fecha: string } | null;
  motivo_rectificacion?: string | null;
  mencion_legal?: string | null;
  /** Para plantilla "personalizada" */
  custom?: {
    color_primario?: string | null;   // hex "#RRGGBB"
    color_acento?: string | null;
    encabezado?: string | null;       // texto multilínea bajo el logo
    pie?: string | null;              // texto al pie
    logo_data_url?: string | null;    // data URL (PNG/JPEG)
  } | null;
};

const FOOTER = "Documento generado con GanaderOS · Conserve esta factura durante al menos 4 años (RD 1619/2012).";

function drawFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
  doc.text(FOOTER, W / 2, doc.internal.pageSize.getHeight() - 24, { align: "center" });
}

function lineasFinales(data: InvoicePDFData) {
  const ivaDef = Number(data.iva_porcentaje) || 0;
  const arr = data.lineas && data.lineas.length
    ? data.lineas
    : [{ concepto: data.concepto, importe: data.base_imponible }];
  return arr.map((l) => {
    const cantidad = Number(l.cantidad ?? 1) || 1;
    const precio_unitario = Number(l.precio_unitario ?? (Number(l.importe) / cantidad)) || 0;
    const descuento = Number(l.descuento_porcentaje ?? 0) || 0;
    const iva = Number(l.iva_porcentaje ?? ivaDef) || 0;
    const baseLinea = Number(l.importe ?? (cantidad * precio_unitario * (1 - descuento / 100)));
    return { concepto: String(l.concepto ?? ""), cantidad, precio_unitario, descuento_porcentaje: descuento, iva_porcentaje: iva, importe: +baseLinea.toFixed(2) };
  });
}

function direccionMultilinea(p?: { direccion?: string | null; codigo_postal?: string | null; ciudad?: string | null; provincia?: string | null } | null): string[] {
  if (!p) return [];
  const linea1 = p.direccion?.trim();
  const cp = p.codigo_postal?.trim();
  const ciudad = p.ciudad?.trim();
  const prov = p.provincia?.trim();
  const linea2 = [cp, ciudad].filter(Boolean).join(" ");
  const linea3 = prov;
  return [linea1, linea2, linea3].filter((s): s is string => !!s && s.length > 0);
}

/** Agrupa las líneas por tipo de IVA y devuelve el desglose para el PDF */
function desgloseIVA(lineas: ReturnType<typeof lineasFinales>) {
  const map = new Map<number, { base: number; cuota: number }>();
  for (const l of lineas) {
    const tipo = Number(l.iva_porcentaje) || 0;
    const base = Number(l.importe) || 0;
    const cuota = +(base * tipo / 100).toFixed(2);
    const acc = map.get(tipo) ?? { base: 0, cuota: 0 };
    acc.base = +(acc.base + base).toFixed(2);
    acc.cuota = +(acc.cuota + cuota).toFixed(2);
    map.set(tipo, acc);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([tipo, v]) => ({ tipo, base: v.base, cuota: v.cuota }));
}

export function generarFacturaPDF(data: InvoicePDFData): jsPDF {
  const tpl = data.template ?? "profesional";
  const style = STYLES[tpl] ?? STYLES.profesional;
  return renderFactura(data, style);
}

// ─────────────────────────────────────────────────────────────
// Renderer común parametrizado por estilo (RD 1619/2012)
// ─────────────────────────────────────────────────────────────

type Style = {
  font: "helvetica" | "times";
  primary: [number, number, number];
  primarySoft: [number, number, number];
  accent: [number, number, number];
  headerKind: "band" | "side" | "boxed" | "minimal" | "custom";
  totalKind: "filled" | "border" | "underline";
  titulo: string;
};

const STYLES: Record<FacturaTemplate, Style> = {
  profesional: { font: "helvetica", primary: [28, 78, 145], primarySoft: [240, 245, 252], accent: [28, 78, 145], headerKind: "band",   totalKind: "filled",    titulo: "FACTURA" },
  creativa:    { font: "helvetica", primary: [255, 122, 41], primarySoft: [255, 240, 225], accent: [255, 122, 41], headerKind: "side",    totalKind: "underline", titulo: "Factura" },
  corporativa: { font: "helvetica", primary: [25, 25, 25],   primarySoft: [240, 240, 240], accent: [25, 25, 25],   headerKind: "boxed",   totalKind: "border",    titulo: "FACTURA" },
  elegante:    { font: "times",     primary: [120, 90, 50],  primarySoft: [248, 244, 235], accent: [180, 160, 130], headerKind: "minimal", totalKind: "underline", titulo: "Factura" },
  personalizada: { font: "helvetica", primary: [40, 60, 90], primarySoft: [240, 244, 250], accent: [40, 60, 90], headerKind: "custom", totalKind: "filled", titulo: "FACTURA" },
};

function hexToRgb(hex?: string | null): [number, number, number] | null {
  if (!hex) return null;
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function lighten(rgb: [number, number, number], f = 0.9): [number, number, number] {
  return [Math.round(rgb[0] + (255 - rgb[0]) * f), Math.round(rgb[1] + (255 - rgb[1]) * f), Math.round(rgb[2] + (255 - rgb[2]) * f)];
}

function renderFactura(data: InvoicePDFData, s: Style): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  // Aplicar colores personalizados si la plantilla es "personalizada"
  if (data.template === "personalizada" && data.custom) {
    const p = hexToRgb(data.custom.color_primario);
    const a = hexToRgb(data.custom.color_acento);
    if (p) { s = { ...s, primary: p, primarySoft: lighten(p, 0.9), accent: a ?? p }; }
    else if (a) { s = { ...s, accent: a }; }
  }
  const lineas = lineasFinales(data);
  const desglose = desgloseIVA(lineas);
  const baseTotal = +lineas.reduce((s, l) => s + (Number(l.importe) || 0), 0).toFixed(2);
  const ivaTotal = +desglose.reduce((s, d) => s + d.cuota, 0).toFixed(2);
  const irpfPct = Number(data.irpf_porcentaje ?? 0);
  const irpfImporte = data.irpf_importe != null ? Number(data.irpf_importe) : +(baseTotal * irpfPct / 100).toFixed(2);
  const totalCalc = +(baseTotal + ivaTotal - irpfImporte).toFixed(2);
  const total = data.total != null ? Number(data.total) : totalCalc;

  const esRect = data.tipo === "rectificativa";
  const tituloDoc = esRect ? (s.titulo === "FACTURA" ? "FACTURA RECTIFICATIVA" : "Factura rectificativa") : s.titulo;

  // ===== CABECERA =====
  let y = 50;
  if (s.headerKind === "custom") {
    const c = data.custom ?? {};
    // Banda superior fina con color primario
    doc.setFillColor(...s.primary);
    doc.rect(0, 0, W, 6, "F");
    y = 50;
    // Logo a la izquierda
    let logoBottom = y;
    if (c.logo_data_url) {
      try {
        const fmt = c.logo_data_url.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(c.logo_data_url, fmt, 40, y - 10, 110, 60, undefined, "FAST");
        logoBottom = y - 10 + 60;
      } catch { /* ignore */ }
    }
    // Datos del emisor a la derecha
    doc.setFont(s.font, "bold"); doc.setFontSize(13); doc.setTextColor(...s.primary);
    const en = doc.splitTextToSize(data.emisor.nombre, W / 2 - 20)[0];
    doc.text(en, W - 40, y, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(90);
    let yy = y + 14;
    if (data.emisor.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 11; }
    if (data.emisor.email) { doc.text(data.emisor.email, W - 40, yy, { align: "right" }); yy += 11; }
    if (data.emisor.telefono) { doc.text(`Tel. ${data.emisor.telefono}`, W - 40, yy, { align: "right" }); yy += 11; }
    y = Math.max(logoBottom, yy) + 14;
    // Encabezado personalizado (texto)
    if (c.encabezado) {
      doc.setFont(s.font, "italic"); doc.setFontSize(9); doc.setTextColor(110);
      const lines = doc.splitTextToSize(c.encabezado, W - 80);
      doc.text(lines, 40, y);
      y += lines.length * 11 + 8;
    }
    // Línea separadora
    doc.setDrawColor(...s.accent); doc.setLineWidth(0.6); doc.line(40, y, W - 40, y); y += 18;
    // Título y nº factura
    doc.setFont(s.font, "bold"); doc.setFontSize(esRect ? 16 : 20); doc.setTextColor(...s.primary);
    doc.text(tituloDoc, 40, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(`Nº ${data.numero}  ·  Expedición ${fechaCorta(data.fecha)}`, W - 40, y, { align: "right" });
    y += 18;
  } else if (s.headerKind === "band") {
    // Calcular alto dinámico de la banda según contenido del emisor
    const emisorLineas = direccionMultilinea(data.emisor).length + (data.emisor.nif ? 1 : 0);
    const bandH = Math.max(80, 36 + emisorLineas * 11 + 10);
    doc.setFillColor(...s.primary);
    doc.rect(0, 0, W, bandH, "F");
    doc.setTextColor(255);
    doc.setFont(s.font, "bold"); doc.setFontSize(esRect ? 18 : 24);
    doc.text(tituloDoc, 40, 40);
    doc.setFont(s.font, "normal"); doc.setFontSize(10);
    doc.text(`Nº ${data.numero}    ·    Expedición: ${fechaCorta(data.fecha)}`, 40, 58);
    // Emisor a la derecha, sin invadir el título (límite a media página)
    doc.setFont(s.font, "bold"); doc.setFontSize(11);
    const emisorNombre = doc.splitTextToSize(data.emisor.nombre, W / 2 - 20)[0];
    doc.text(emisorNombre, W - 40, 28, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(9);
    let yy = 42;
    if (data.emisor.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 11; }
    y = bandH + 20;
  } else if (s.headerKind === "side") {
    doc.setFillColor(...s.primary); doc.rect(0, 0, 14, H, "F");
    doc.setFillColor(...s.primarySoft); doc.rect(14, 0, 6, H, "F");
    y = 60;
    doc.setFont(s.font, "bold"); doc.setFontSize(esRect ? 22 : 28); doc.setTextColor(40, 30, 25);
    doc.text(tituloDoc, 40, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(11); doc.setTextColor(...s.primary);
    doc.text(`#${data.numero}`, 40, y + 18);
    doc.setTextColor(110);
    doc.text(`Expedición: ${fechaCorta(data.fecha)}`, 40, y + 34);
    doc.setFont(s.font, "bold"); doc.setFontSize(12); doc.setTextColor(40);
    const emisorNombreSide = doc.splitTextToSize(data.emisor.nombre, W / 2 - 40)[0];
    doc.text(emisorNombreSide, W - 40, y, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(110);
    let yy = y + 14;
    if (data.emisor.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 11; }
    if (data.emisor.email) { doc.text(data.emisor.email, W - 40, yy, { align: "right" }); yy += 11; }
    y = Math.max(y + 60, yy + 16);
  } else if (s.headerKind === "boxed") {
    doc.setFillColor(...s.primary); doc.rect(0, 0, W, 4, "F");
    doc.setFont(s.font, "bold"); doc.setFontSize(16); doc.setTextColor(...s.primary);
    // Limitar el nombre del emisor para no chocar con el cuadro de la derecha (ancho 180, margen 40)
    const emisorNombreBox = doc.splitTextToSize(data.emisor.nombre, W - 240 - 40)[0];
    doc.text(emisorNombreBox, 40, y);
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(90);
    let yy = y + 14;
    if (data.emisor.nif) { doc.text(`NIF: ${data.emisor.nif}`, 40, yy); yy += 11; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, 40, yy); yy += 11; }
    if (data.emisor.telefono) { doc.text(`Tel. ${data.emisor.telefono}`, 40, yy); yy += 11; }
    if (data.emisor.email) { doc.text(data.emisor.email, 40, yy); yy += 11; }
    doc.setDrawColor(...s.primary); doc.setLineWidth(0.8);
    const boxH = data.fecha_operacion ? 80 : 64;
    doc.rect(W - 220, y - 14, 180, boxH, "S");
    doc.setFont(s.font, "bold"); doc.setFontSize(11); doc.setTextColor(...s.primary);
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
    // Recortar nombre emisor para evitar solape con el título
    const emisorNombreMin = doc.splitTextToSize(data.emisor.nombre, W / 2 - 40)[0];
    doc.text(emisorNombreMin, W - 40, y, { align: "right" });
    doc.setFont(s.font, "normal"); doc.setFontSize(10); doc.setTextColor(110);
    let yy = y + 14;
    if (data.emisor.nif) { doc.text(`NIF: ${data.emisor.nif}`, W - 40, yy, { align: "right" }); yy += 12; }
    for (const l of direccionMultilinea(data.emisor)) { doc.text(l, W - 40, yy, { align: "right" }); yy += 12; }
    y = Math.max(y + 50, yy + 16);
    doc.setDrawColor(...s.accent); doc.setLineWidth(0.4); doc.line(40, y, W - 40, y); y += 24;
  }

  // ===== Fechas extra (si no se imprimieron en cabecera) =====
  if (s.headerKind !== "boxed") {
    if (data.fecha_operacion || data.fecha_vencimiento) {
      doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(110);
      const parts: string[] = [];
      if (data.fecha_operacion) parts.push(`Fecha de operación: ${fechaCorta(data.fecha_operacion)}`);
      if (data.fecha_vencimiento) parts.push(`Vencimiento: ${fechaCorta(data.fecha_vencimiento)}`);
      doc.text(parts.join("  ·  "), 40, y);
      y += 16;
    }
  }

  // ===== Aviso rectificativa =====
  if (esRect && data.factura_rectificada) {
    doc.setFillColor(255, 240, 220);
    doc.rect(40, y, W - 80, 36, "F");
    doc.setTextColor(160, 80, 0); doc.setFont(s.font, "bold"); doc.setFontSize(10);
    doc.text(`Rectifica a la factura ${data.factura_rectificada.numero} de ${fechaCorta(data.factura_rectificada.fecha)}`, 50, y + 15);
    if (data.motivo_rectificacion) {
      doc.setFont(s.font, "normal"); doc.setFontSize(9);
      doc.text(`Motivo: ${data.motivo_rectificacion}`, 50, y + 28);
    }
    y += 46;
  }

  // ===== CLIENTE (alto dinámico) =====
  const cliDirLines = direccionMultilinea(data.cliente).length;
  const cliExtraLines = (data.cliente?.nif ? 1 : 0) + cliDirLines;
  const cliBoxH = Math.max(70, 40 + cliExtraLines * 11 + 10);
  doc.setFillColor(...s.primarySoft);
  doc.rect(40, y, W - 80, cliBoxH, "F");
  doc.setFont(s.font, "bold"); doc.setFontSize(10); doc.setTextColor(...s.primary);
  doc.text("FACTURAR A", 52, y + 16);
  doc.setTextColor(40); doc.setFontSize(11);
  if (data.cliente) {
    doc.text(data.cliente.nombre, 52, y + 32);
    doc.setFont(s.font, "normal"); doc.setFontSize(9);
    let cy = y + 46;
    if (data.cliente.nif) { doc.text(`NIF: ${data.cliente.nif}`, 52, cy); cy += 11; }
    for (const l of direccionMultilinea(data.cliente)) { doc.text(l, 52, cy); cy += 11; }
  } else {
    doc.text("Cliente sin asignar", 52, y + 32);
  }
  y += cliBoxH + 20;

  // ===== TABLA LÍNEAS =====
  // Columnas: Concepto | Cant. | Precio | Dto% | IVA% | Importe
  // Anchos calculados desde la derecha para evitar solapes
  const rightEdge = W - 40;
  const colImporte = rightEdge - 10;          // valor alineado a derecha
  const colIva = colImporte - 75;             // ~75pt para "Importe"
  const colDto = colIva - 50;                 // 50pt para "IVA%"
  const colPrecio = colDto - 55;              // 55pt para "Dto%"
  const colCant = colPrecio - 70;             // 70pt para "Precio"
  const colConceptoX = 52;
  const conceptoMaxX = colCant - 50;          // 50pt para "Cant."

  doc.setFillColor(...s.primary);
  doc.rect(40, y, W - 80, 26, "F");
  doc.setFont(s.font, "bold"); doc.setFontSize(9); doc.setTextColor(255);
  doc.text("Concepto", colConceptoX, y + 17);
  doc.text("Cant.", colCant, y + 17, { align: "right" });
  doc.text("Precio", colPrecio, y + 17, { align: "right" });
  doc.text("Dto%", colDto, y + 17, { align: "right" });
  doc.text("IVA%", colIva, y + 17, { align: "right" });
  doc.text("Importe", colImporte, y + 17, { align: "right" });
  y += 26 + 18; // alto del header + aire antes de la primera fila

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
  doc.setDrawColor(...s.accent); doc.setLineWidth(0.6); doc.line(W - 280, y, W - 40, y); y += 16;
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

  // Total final
  if (s.totalKind === "filled") {
    doc.setFillColor(...s.primary); doc.rect(W - 280, y - 14, 240, 30, "F");
    doc.setTextColor(255); doc.setFont(s.font, "bold"); doc.setFontSize(13);
    doc.text("TOTAL FACTURA", W - 270, y + 6);
    doc.text(eur(total), W - 50, y + 6, { align: "right" });
  } else if (s.totalKind === "border") {
    doc.setDrawColor(...s.primary); doc.setLineWidth(1); doc.line(W - 280, y - 4, W - 40, y - 4);
    doc.setFont(s.font, "bold"); doc.setFontSize(13); doc.setTextColor(...s.primary);
    doc.text("TOTAL FACTURA", W - 280, y + 12);
    doc.text(eur(total), W - 40, y + 12, { align: "right" });
  } else {
    doc.setDrawColor(...s.primary); doc.setLineWidth(0.8); doc.line(W - 280, y - 4, W - 40, y - 4);
    doc.setFont(s.font, "bold"); doc.setFontSize(15); doc.setTextColor(...s.primary);
    doc.text("TOTAL", W - 280, y + 14);
    doc.text(eur(total), W - 40, y + 14, { align: "right" });
  }
  y += 44;

  // ===== Forma de pago / Mención legal / Notas =====
  doc.setTextColor(60); doc.setFont(s.font, "normal"); doc.setFontSize(9);
  if (data.metodo_pago) {
    doc.text(`Forma de pago: ${data.metodo_pago}`, 40, y);
    y += 12;
  }
  if (data.mencion_legal) {
    doc.setFont(s.font, "bold");
    doc.text("Mención legal:", 40, y); y += 12;
    doc.setFont(s.font, "normal");
    const wrapped = doc.splitTextToSize(data.mencion_legal, W - 80);
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
    doc.setDrawColor(...s.accent); doc.setLineWidth(0.4); doc.line(40, y, W - 40, y); y += 12;
    doc.setFont(s.font, "normal"); doc.setFontSize(9); doc.setTextColor(90);
    const wrapped = doc.splitTextToSize(data.custom.pie, W - 80);
    doc.text(wrapped, 40, y);
  }

  drawFooter(doc);
  return doc;
}

// ─────────────────────────────────────────────────────────────
// Resumen mensual (sin cambios)
// ─────────────────────────────────────────────────────────────
export type SummaryPDFData = {
  empresa: string;
  nif?: string | null;
  anio: number;
  mes: number;
  ingresos: number;
  gastos: number;
  ivaRep: number;
  ivaSop: number;
  cobrosPend: number;
  gastosPend: number;
  facturasCount: number;
  gastosCount: number;
};

const NOMBRE_MES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

export function generarResumenMensualPDF(d: SummaryPDFData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 50;

  doc.setFillColor(34, 139, 80);
  doc.rect(0, 0, W, 8, "F");

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(20, 60, 40);
  doc.text("Resumen mensual", 40, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(80);
  doc.text(`${NOMBRE_MES[d.mes - 1]} ${d.anio}`, 40, y + 18);

  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 60, 40);
  doc.text(d.empresa, W - 40, y, { align: "right" });
  if (d.nif) {
    doc.setFont("helvetica", "normal"); doc.setTextColor(80);
    doc.text(`NIF: ${d.nif}`, W - 40, y + 16, { align: "right" });
  }

  y += 60;
  doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 30;

  doc.setTextColor(40);
  const filas: [string, string][] = [
    ["Facturas emitidas", String(d.facturasCount)],
    ["Total ingresos", eur(d.ingresos)],
    ["IVA repercutido (estimado)", eur(d.ivaRep)],
    ["", ""],
    ["Gastos registrados", String(d.gastosCount)],
    ["Total gastos", eur(d.gastos)],
    ["IVA soportado (estimado)", eur(d.ivaSop)],
    ["", ""],
    ["Cobros pendientes", eur(d.cobrosPend)],
    ["Gastos por revisar", String(d.gastosPend)],
  ];

  doc.setFontSize(11);
  for (const [k, v] of filas) {
    if (!k && !v) { y += 8; continue; }
    doc.setFont("helvetica", "normal"); doc.text(k, 40, y);
    doc.setFont("helvetica", "bold"); doc.text(v, W - 40, y, { align: "right" });
    y += 18;
  }

  y += 14;
  doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 24;

  const resultado = d.ingresos - d.gastos;
  const ivaResultado = d.ivaRep - d.ivaSop;
  doc.setFillColor(240, 248, 244);
  doc.rect(40, y - 18, W - 80, 80, "F");
  doc.setTextColor(20, 60, 40); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("RESULTADO BRUTO", 56, y);
  doc.setFontSize(16); doc.text(eur(resultado), W - 56, y, { align: "right" });
  doc.setFontSize(10); y += 26;
  doc.text("RESULTADO IVA ORIENTATIVO", 56, y);
  doc.setFontSize(14);
  doc.text(`${ivaResultado >= 0 ? "A pagar " : "A devolver "}${eur(Math.abs(ivaResultado))}`, W - 56, y, { align: "right" });

  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(140);
  doc.text(
    "Documento orientativo generado por GanaderOS. La presentación fiscal corresponde a la gestoría o asesor fiscal.",
    W / 2, doc.internal.pageSize.getHeight() - 24, { align: "center" }
  );

  return doc;
}
