// Webhook entrante de WhatsApp Cloud API. STUB documentado.
// Verificación + recepción. Inserta el mensaje crudo y dispara wa-process-message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);

  // Verificación del webhook (Meta)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "papeleo-facil-dev";
    if (mode === "subscribe" && token === expected) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  try {
    const body = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Estructura típica WA Cloud API: entry[].changes[].value.messages[]
    const entries = body.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const toNumber = value.metadata?.display_phone_number ? `+${value.metadata.display_phone_number}` : null;
        // identificar empresa por nº WA destino
        let companyId: string | null = null;
        if (toNumber) {
          const { data } = await supabase.from("companies").select("id").eq("whatsapp_number", toNumber).maybeSingle();
          companyId = data?.id ?? null;
        }
        for (const m of value.messages ?? []) {
          // Tipo: texto, imagen, documento, audio. Los interactivos (botón/lista) los tratamos como texto
          // mapeando el id seleccionado a un comando interno equivalente.
          const tipo = m.type === "text" ? "texto"
            : m.type === "image" ? "imagen"
            : m.type === "document" ? "documento"
            : m.type === "audio" ? "audio"
            : m.type === "interactive" ? "texto"
            : m.type === "button" ? "texto"
            : "texto";

          // Extraer texto / selección interactiva
          let texto: string | null = m.text?.body ?? m.image?.caption ?? m.document?.caption ?? null;
          if (m.type === "interactive") {
            const inter = m.interactive ?? {};
            const selId: string | null = inter.button_reply?.id ?? inter.list_reply?.id ?? null;
            const selTitle: string | null = inter.button_reply?.title ?? inter.list_reply?.title ?? null;
            if (selId) {
              // Marcador especial que el procesador detecta. Conserva el id estable.
              texto = `__MENU__:${selId}` + (selTitle ? ` (${selTitle})` : "");
            }
          } else if (m.type === "button") {
            // Quick-reply de plantillas: payload + texto
            const payload = m.button?.payload ?? m.button?.text ?? null;
            if (payload) texto = `__MENU__:${payload}`;
          }

          // Descargar media si es imagen/documento y subir a storage
          let adjuntoPath: string | null = null;
          const mediaId = m.image?.id ?? m.document?.id ?? m.audio?.id ?? null;
          if (mediaId) {
            try {
              const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
              const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const metaJson = await metaRes.json();
              if (metaJson?.url) {
                const fileRes = await fetch(metaJson.url, { headers: { Authorization: `Bearer ${token}` } });
                const blob = await fileRes.arrayBuffer();
                const ct = metaJson.mime_type ?? fileRes.headers.get("content-type") ?? "application/octet-stream";
                const ext = ct.includes("jpeg") ? "jpg" : ct.includes("png") ? "png" : ct.includes("pdf") ? "pdf" : ct.split("/")[1] ?? "bin";
                const path = `${companyId ?? "sin-empresa"}/${Date.now()}-${mediaId}.${ext}`;
                const { error: upErr } = await supabase.storage.from("wa-attachments").upload(path, blob, { contentType: ct, upsert: true });
                if (!upErr) adjuntoPath = path;
              }
            } catch (e) { console.error("media download error", e); }
          }

          // Idempotencia: Meta reintenta los webhooks. El id del mensaje es único,
          // así que un reintento choca con el índice único y no se procesa dos veces.
          const { data: inserted, error: insErr } = await supabase.from("wa_messages").insert({
            company_id: companyId,
            remitente: `+${m.from}`,
            to_number: toNumber,
            wa_message_id: m.id ?? null,
            texto, tipo,
            adjunto_path: adjuntoPath,
            estado: "pendiente",
          }).select("id").maybeSingle();
          if (insErr) {
            if (String((insErr as any).code) === "23505") {
              console.log("webhook duplicado ignorado", m.id);
              continue;
            }
            console.error("wa_messages insert error", insErr);
            continue;
          }
          if (inserted?.id) {
            // procesar en segundo plano
            fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-process-message`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
              body: JSON.stringify({ messageId: inserted.id }),
            }).catch(() => {});
          }
        }
      }
    }
    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("wa-webhook error", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
