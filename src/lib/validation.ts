import { z } from "zod";

const trimNonEmpty = (msg: string) => z.string().trim().min(1, msg);
const optionalText = (max = 255) => z.string().trim().max(max).nullish().or(z.literal("")).transform((v) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
});
const optionalEmail = z.string().trim().email("Email no válido").max(255).nullish().or(z.literal("")).transform((v) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
});
const optionalPhone = z.string().trim().max(30, "Teléfono demasiado largo").nullish().or(z.literal("")).transform((v) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
});
// Phone field without format validation — only length cap, accepts anything
const freePhone = z.string().max(30).nullish().or(z.literal("")).transform((v) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
});
// NIF/CIF sin validación estricta de formato — solo cap de longitud
const optionalNif = z.string().max(20).nullish().or(z.literal("")).transform((v) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t.toUpperCase();
});

export const companySchema = z.object({
  nombre_comercial: trimNonEmpty("El nombre comercial es obligatorio").max(120),
  razon_social: optionalText(160),
  nif: optionalNif,
  telefono: freePhone,
  email: optionalEmail,
  whatsapp_number: freePhone,
  serie_facturacion: z.string().trim().max(8).default("A"),
  iva_default: z.coerce.number().min(0, "IVA mínimo 0").max(50, "IVA máximo 50"),
  irpf_default: z.coerce.number().min(0, "IRPF mínimo 0").max(50, "IRPF máximo 50").default(0),
  gestoria_nombre: optionalText(120),
  gestoria_email: optionalEmail,
  direccion: optionalText(255),
  codigo_postal: optionalText(10),
  ciudad: optionalText(120),
  provincia: optionalText(120),
  notas_internas: optionalText(2000),
  factura_template: z.enum(["profesional","creativa","corporativa","elegante","personalizada"]).default("profesional"),
  factura_logo_url: z.string().url().nullish().or(z.literal("")),
  factura_color_primario: z.string().regex(/^#?[0-9a-fA-F]{6}$/, "Color hex inválido").nullish().or(z.literal("")),
  factura_color_acento: z.string().regex(/^#?[0-9a-fA-F]{6}$/, "Color hex inválido").nullish().or(z.literal("")),
  factura_encabezado: optionalText(500),
  factura_pie: optionalText(500),
});

export const clientSchema = z.object({
  nombre: trimNonEmpty("El nombre es obligatorio").max(160),
  nif: optionalNif,
  telefono: freePhone,
  email: optionalEmail,
  direccion: optionalText(255),
  codigo_postal: optionalText(10),
  ciudad: optionalText(120),
  provincia: optionalText(120),
  observaciones: optionalText(2000),
});

export const invoiceSchema = z.object({
  numero: trimNonEmpty("Falta el número").max(40),
  serie: z.string().trim().max(8).default("A"),
  fecha: trimNonEmpty("Falta la fecha"),
  fecha_operacion: z.string().nullish().or(z.literal("")).transform((v) => {
    const t = typeof v === "string" ? v.trim() : "";
    return t === "" ? null : t;
  }),
  fecha_vencimiento: z.string().optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  concepto: trimNonEmpty("Falta el concepto").max(500),
  base_imponible: z.coerce.number().min(0, "Base mínima 0").max(1_000_000),
  iva_porcentaje: z.coerce.number().min(0).max(50),
  irpf_porcentaje: z.coerce.number().min(0).max(50).default(0),
  estado: z.enum(["borrador", "enviada", "cobrada", "vencida"]),
  metodo_pago: z.enum(["transferencia", "efectivo", "bizum", "tarjeta", "otro"]).optional().nullable(),
  tipo: z.enum(["ordinaria","rectificativa"]).default("ordinaria"),
  factura_rectificada_id: z.string().uuid().optional().nullable(),
  motivo_rectificacion: optionalText(500),
  mencion_legal: optionalText(500),
  notas: optionalText(2000),
});

export const expenseSchema = z.object({
  fecha: trimNonEmpty("Falta la fecha"),
  proveedor: optionalText(160),
  concepto: trimNonEmpty("Falta el concepto").max(500),
  categoria: z.enum(["combustible","material","herramienta","comida","alojamiento","transporte","suministros","otros"]),
  base_imponible: z.coerce.number().min(0).max(1_000_000),
  iva_porcentaje: z.coerce.number().min(0).max(50),
  estado: z.enum(["pendiente", "revisado", "rechazado"]),
  observaciones: optionalText(2000),
});

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Datos inválidos";
}
