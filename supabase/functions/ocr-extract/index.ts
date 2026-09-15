// OCR con Google Cloud Vision API (DOCUMENT_TEXT_DETECTION)
// Recibe: { storage_path: string, bucket?: "expenses"|"invoices"|"wa-attachments" }
//   o bien: { image_base64: string }
// Devuelve: { ok, extracted: { fecha, proveedor, base_imponible, iva_porcentaje, iva_importe, total, tipo }, raw_text, requiere_revision_manual }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VISION_KEY = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function parseAmount(s: string): number | null {
  if (!s) return null;
  // "1.234,56" o "1234.56" o "1,234.56"
  let t = s.replace(/[^\d.,-]/g, "");
  if (t.includes(",") && t.includes(".")) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      t = t.replace(/\./g, "").replace(",", ".");
    } else {
      t = t.replace(/,/g, "");
    }
  } else if (t.includes(",")) {
    t = t.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  }
  const n = parseFloat(t);
  return isFinite(n) ? n : null;
}

function parseDate(text: string): string | null {
  // dd/mm/yyyy o dd-mm-yyyy o yyyy-mm-dd
  const m1 = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m1) {
    let [_, d, mo, y] = m1;
    if (y.length === 2) y = (parseInt(y) > 50 ? "19" : "20") + y;
    const dd = d.padStart(2, "0");
    const mm = mo.padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  const m2 = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

function extractFields(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const upper = text.toUpperCase();

  // Total
  let total: number | null = null;
  const totalRegex = /(TOTAL(?:\s+A\s+PAGAR)?|IMPORTE\s+TOTAL|TOTAL\s+FACTURA)[^\d-]*([\-]?[\d.,]+)\s*€?/i;
  const mTotal = text.match(totalRegex);
  if (mTotal) total = parseAmount(mTotal[2]);

  // IVA importe + %
  let iva_importe: number | null = null;
  let iva_porcentaje: number | null = null;
  const ivaPctMatch = text.match(/IVA\s*\(?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i);
  if (ivaPctMatch) iva_porcentaje = parseAmount(ivaPctMatch[1]);
  const ivaImpMatch = text.match(/IVA[^\n\d-]*(?:\d{1,2}(?:[.,]\d+)?\s*%)?[^\n\d-]*([\-]?[\d.,]+)\s*€?/i);
  if (ivaImpMatch) iva_importe = parseAmount(ivaImpMatch[1]);

  // Base imponible
  let base_imponible: number | null = null;
  const baseMatch = text.match(/(BASE\s+IMPONIBLE|SUBTOTAL|BASE)[^\d-]*([\-]?[\d.,]+)\s*€?/i);
  if (baseMatch) base_imponible = parseAmount(baseMatch[2]);

  // Si tenemos total e IVA pero falta base
  if (base_imponible == null && total != null && iva_importe != null) {
    base_imponible = +(total - iva_importe).toFixed(2);
  }
  if (iva_porcentaje == null && base_imponible && iva_importe != null && base_imponible > 0) {
    iva_porcentaje = Math.round((iva_importe / base_imponible) * 100);
  }

  // Fecha
  const fecha = parseDate(text) ?? new Date().toISOString().slice(0, 10);

  // Proveedor: heurística — primera línea no numérica con letras
  let proveedor: string | null = null;
  for (const l of lines.slice(0, 6)) {
    if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/.test(l) && !/factura|ticket|recibo|fecha|cif|nif/i.test(l)) {
      proveedor = l.slice(0, 80);
      break;
    }
  }

  // Tipo: factura vs ticket
  const tipo = /FACTURA/.test(upper) ? "factura" : "ticket";

  const requiere_revision_manual = total == null || base_imponible == null;

  return {
    extracted: { fecha, proveedor, base_imponible, iva_porcentaje, iva_importe, total, tipo },
    requiere_revision_manual,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!VISION_KEY) {
      return new Response(
        JSON.stringify({ error: "Falta GOOGLE_CLOUD_VISION_API_KEY en los secretos" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    let imageB64: string | null = body?.image_base64 ?? null;

    if (!imageB64 && body?.storage_path) {
      const bucket = body?.bucket ?? "expenses";
      const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data, error } = await sb.storage.from(bucket).download(body.storage_path);
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: `No se pudo descargar el archivo: ${error?.message ?? "desconocido"}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const buf = new Uint8Array(await data.arrayBuffer());
      imageB64 = toBase64(buf);
    }

    if (!imageB64) {
      return new Response(
        JSON.stringify({ error: "Debes enviar 'storage_path' (+ bucket) o 'image_base64'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_KEY}`;
    const visionPayload = {
      requests: [
        {
          image: { content: imageB64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          imageContext: { languageHints: ["es", "en"] },
        },
      ],
    };

    const vRes = await fetch(visionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(visionPayload),
    });

    if (!vRes.ok) {
      const errText = await vRes.text();
      return new Response(
        JSON.stringify({ error: "Google Vision error", status: vRes.status, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const vJson = await vRes.json();
    const fullText: string =
      vJson?.responses?.[0]?.fullTextAnnotation?.text ??
      vJson?.responses?.[0]?.textAnnotations?.[0]?.description ??
      "";

    if (!fullText) {
      return new Response(
        JSON.stringify({ ok: true, extracted: null, raw_text: "", requiere_revision_manual: true, info: "Vision no detectó texto" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = extractFields(fullText);

    return new Response(
      JSON.stringify({ ok: true, raw_text: fullText, ...parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
