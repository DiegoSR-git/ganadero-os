export const TIPOS_EVENTO = [
  "nacimiento", "alta", "baja", "parto", "aborto", "cubricion", "inseminacion",
  "gestacion", "tratamiento", "vacuna", "incidencia", "movimiento", "pesaje",
  "revision", "compra", "venta", "cambio_lote", "cambio_parcela", "observacion",
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const EVENTO_LABEL: Record<string, string> = {
  nacimiento: "Nacimiento", alta: "Alta", baja: "Baja", parto: "Parto", aborto: "Aborto",
  cubricion: "Cubrición", inseminacion: "Inseminación", gestacion: "Gestación",
  tratamiento: "Tratamiento", vacuna: "Vacuna", incidencia: "Incidencia",
  movimiento: "Movimiento", pesaje: "Pesaje", revision: "Revisión", compra: "Compra",
  venta: "Venta", cambio_lote: "Cambio de lote", cambio_parcela: "Cambio de parcela",
  observacion: "Observación",
};

export const CATEGORIAS_GASTO = [
  "alimentacion", "veterinario", "medicamentos", "combustible", "maquinaria",
  "reparaciones", "seguros", "personal", "suministros", "transporte",
  "compra_animales", "instalaciones", "otros",
] as const;

export const GASTO_LABEL: Record<string, string> = {
  alimentacion: "Alimentación", veterinario: "Veterinario", medicamentos: "Medicamentos",
  combustible: "Combustible", maquinaria: "Maquinaria", reparaciones: "Reparaciones",
  seguros: "Seguros", personal: "Personal", suministros: "Suministros",
  transporte: "Transporte", compra_animales: "Compra de animales",
  instalaciones: "Instalaciones", otros: "Otros",
};

export const CATEGORIAS_INGRESO = ["venta_animales", "subvenciones", "seguros", "otros"] as const;
export const INGRESO_LABEL: Record<string, string> = {
  venta_animales: "Venta de animales", subvenciones: "Subvenciones",
  seguros: "Seguros", otros: "Otros",
};

export const CATEGORIAS_DOCUMENTO = [
  "factura", "ticket", "receta", "guia", "documento_sanitario", "certificado",
  "seguro", "pac", "contrato", "otros",
] as const;

export const DOCUMENTO_LABEL: Record<string, string> = {
  factura: "Factura", ticket: "Ticket", receta: "Receta", guia: "Guía",
  documento_sanitario: "Documento sanitario", certificado: "Certificado",
  seguro: "Seguro", pac: "PAC", contrato: "Contrato", otros: "Otros",
};

export const RAZAS_BOVINO = [
  "Limusina", "Charolesa", "Avileña", "Retinta", "Morucha", "Rubia Gallega",
  "Frisona", "Parda", "Angus", "Blonda", "Cruce", "Otra",
];

export const ESTADOS_REPRODUCTIVOS = ["vacia", "gestante", "parida", "lactante", "no_aplica"] as const;
export const REPRO_LABEL: Record<string, string> = {
  vacia: "Vacía", gestante: "Gestante", parida: "Parida", lactante: "Lactante", no_aplica: "No aplica",
};

/** Edad legible a partir de la fecha de nacimiento. */
export function edadTexto(fechaNacimiento?: string | null): string {
  if (!fechaNacimiento) return "—";
  const nac = new Date(fechaNacimiento);
  if (Number.isNaN(nac.getTime())) return "—";
  const hoy = new Date();
  let meses = (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());
  if (hoy.getDate() < nac.getDate()) meses -= 1;
  if (meses < 0) return "—";
  if (meses < 24) return `${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  return resto ? `${anios} a. ${resto} m.` : `${anios} años`;
}

export function mesesEdad(fechaNacimiento?: string | null): number | null {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento);
  if (Number.isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let meses = (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());
  if (hoy.getDate() < nac.getDate()) meses -= 1;
  return meses;
}

/** Clasificación bovina básica por sexo y edad. */
export function categoriaAnimal(a: { sexo?: string | null; fecha_nacimiento?: string | null }): "vaca" | "novilla" | "ternero" | "toro" {
  const m = mesesEdad(a.fecha_nacimiento);
  const macho = (a.sexo ?? "").toLowerCase().startsWith("m");
  if (m !== null && m < 12) return "ternero";
  if (macho) return "toro";
  if (m !== null && m < 30) return "novilla";
  return "vaca";
}

/** Criterios de categoría por especie: meses de cría y meses hasta adulta. */
export const CRITERIOS_CATEGORIA: Record<string, { cria: number; joven: number; labels: [string, string, string, string, string] }> = {
  // labels: [cría, hembra joven, hembra adulta, macho joven, macho adulto]
  bovino: { cria: 12, joven: 30, labels: ["Ternero/a", "Novilla", "Vaca", "Novillo", "Toro"] },
  ovino: { cria: 6, joven: 12, labels: ["Cordero/a", "Borrega", "Oveja", "Borrego", "Carnero"] },
  caprino: { cria: 6, joven: 12, labels: ["Cabrito/a", "Chiva", "Cabra", "Chivo", "Macho cabrío"] },
  porcino: { cria: 4, joven: 8, labels: ["Lechón", "Cerda joven", "Cerda", "Cerdo joven", "Verraco"] },
  equino: { cria: 12, joven: 36, labels: ["Potro/a", "Potra", "Yegua", "Potro", "Caballo"] },
};

/** Categoría funcional calculada (nunca almacenada) a partir de especie, sexo y edad. */
export function categoriaLabel(a: { especie?: string | null; sexo?: string | null; fecha_nacimiento?: string | null }): string {
  const c = CRITERIOS_CATEGORIA[(a.especie ?? "bovino").toLowerCase()] ?? CRITERIOS_CATEGORIA.bovino;
  const m = mesesEdad(a.fecha_nacimiento);
  const macho = (a.sexo ?? "").toLowerCase().startsWith("m");
  if (m !== null && m < c.cria) return c.labels[0];
  if (m !== null && m < c.joven) return macho ? c.labels[3] : c.labels[1];
  return macho ? c.labels[4] : c.labels[2];
}
