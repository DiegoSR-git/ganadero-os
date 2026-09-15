import { createClient } from "npm:@supabase/supabase-js@2";
import { SMTPClient } from "npm:emailjs@4.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: userErr } = await supabase.auth.getClaims(token);
    if (userErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { companyId, anio, mes, zipBase64, filename, resumenTexto } = body;

    if (!companyId || !anio || !mes || !zipBase64 || !filename) {
      return new Response(JSON.stringify({ error: "Faltan datos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar acceso del usuario a la empresa (RLS hará el filtro)
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, nombre_comercial, email, gestoria_nombre, gestoria_email")
      .eq("id", companyId)
      .maybeSingle();

    if (cErr || !company) {
      return new Response(JSON.stringify({ error: "Empresa no encontrada o sin acceso" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!company.gestoria_email) {
      return new Response(JSON.stringify({ error: "La empresa no tiene email de gestoría configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SMTP_HOST = Deno.env.get("SMTP_HOST")!;
    const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 465);
    const SMTP_USER = Deno.env.get("SMTP_USER")!;
    const SMTP_PASS = Deno.env.get("SMTP_PASS")!;
    const SMTP_FROM_ENV = Deno.env.get("SMTP_FROM");
    if (!SMTP_FROM_ENV) {
      console.warn("SMTP_FROM no está configurado; usando SMTP_USER como remitente.");
    }
    const SMTP_FROM = SMTP_FROM_ENV ?? SMTP_USER;

    const client = new SMTPClient({
      user: SMTP_USER,
      password: SMTP_PASS,
      host: SMTP_HOST,
      port: SMTP_PORT,
      ssl: SMTP_PORT === 465,
      tls: SMTP_PORT !== 465,
    });

    // El remitente real SIEMPRE debe ser una cuenta del dominio autenticado en SMTP.
    // Hostinger rechaza cualquier 'from' que no sea propiedad del usuario SMTP.
    const fromHeader = `Papeleo Fácil <${SMTP_FROM}>`;

    // Validación básica de email para usarlo como reply-to
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const clienteEmail = typeof company.email === "string" ? company.email.trim() : "";
    const replyToValido = clienteEmail && emailRegex.test(clienteEmail) ? clienteEmail : null;
    if (clienteEmail && !replyToValido) {
      console.warn(`Email del cliente inválido, se omite reply-to: ${clienteEmail}`);
    }

    const zipBytes = Uint8Array.from(atob(zipBase64), (c) => c.charCodeAt(0));

    const mesStr = String(mes).padStart(2, "0");
    const nombreCliente = company.nombre_comercial ?? "Cliente";
    const subject = `Documentación para gestoría · ${nombreCliente} (${mesStr}/${anio})`;

    const textoPlano = [
      `Hola${company.gestoria_nombre ? ` ${company.gestoria_nombre}` : ""},`,
      "",
      "Le enviamos la documentación preparada de su cliente.",
      "",
      "────────────────────────────",
      "DATOS DEL CLIENTE",
      "────────────────────────────",
      `Cliente: ${nombreCliente}`,
      company.nif ? `NIF: ${company.nif}` : null,
      company.telefono ? `Teléfono: ${company.telefono}` : null,
      clienteEmail ? `Email: ${clienteEmail}` : null,
      `Periodo: ${mesStr}/${anio}`,
      "",
      "────────────────────────────",
      "RESUMEN",
      "────────────────────────────",
      resumenTexto?.trim() || "No se ha incluido un resumen adicional.",
      "",
      "────────────────────────────",
      "INFORMACIÓN DEL ENVÍO",
      "────────────────────────────",
      "Este correo ha sido generado por Papeleo Fácil en nombre del cliente.",
      "Se adjunta la documentación correspondiente en el archivo anexo.",
      "",
      "Quedamos a su disposición para cualquier aclaración.",
      "",
      "Un saludo,",
      "Papeleo Fácil",
      "autonomo@papeleofacil.es",
    ]
      .filter(Boolean)
      .join("\n");

    // Versión HTML "bonita" del correo
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const resumenHtml = (resumenTexto?.trim() || "No se ha incluido un resumen adicional.")
      .split("\n")
      .map((l: string) => esc(l))
      .join("<br/>");

    const fila = (label: string, value?: string | null) =>
      value
        ? `<tr>
            <td style="padding:6px 0;color:#64748b;font-size:13px;width:110px;">${esc(label)}</td>
            <td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:500;">${esc(value)}</td>
          </tr>`
        : "";

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#16a34a 0%,#0d9488 100%);padding:28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:10px;padding:8px 12px;font-size:20px;line-height:1;">📄</div>
                    <span style="margin-left:10px;font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#ffffff;vertical-align:middle;">Papeleo Fácil</span>
                  </td>
                  <td align="right" style="color:rgba(255,255,255,0.85);font-size:12px;font-weight:500;">
                    ${esc(`${mesStr}/${anio}`)}
                  </td>
                </tr>
              </table>
              <div style="margin-top:18px;color:#ffffff;font-size:22px;font-weight:600;line-height:1.3;">
                Documentación lista para gestoría
              </div>
              <div style="margin-top:6px;color:rgba(255,255,255,0.85);font-size:14px;">
                Cliente: <strong style="color:#ffffff;">${esc(nombreCliente)}</strong>
              </div>
            </td>
          </tr>

          <!-- SALUDO -->
          <tr>
            <td style="padding:28px 32px 8px 32px;font-size:15px;line-height:1.6;color:#334155;">
              Hola${company.gestoria_nombre ? ` <strong>${esc(company.gestoria_nombre)}</strong>` : ""},
              <br/>Le enviamos la documentación preparada del periodo correspondiente. Encontrará el detalle más abajo y el archivo completo adjunto.
            </td>
          </tr>

          <!-- DATOS CLIENTE -->
          <tr>
            <td style="padding:16px 32px;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#16a34a;text-transform:uppercase;margin-bottom:10px;">Datos del cliente</div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${fila("Cliente", nombreCliente)}
                  ${fila("NIF", company.nif as any)}
                  ${fila("Teléfono", company.telefono as any)}
                  ${fila("Email", clienteEmail || null)}
                  ${fila("Periodo", `${mesStr}/${anio}`)}
                </table>
              </div>
            </td>
          </tr>

          <!-- RESUMEN -->
          <tr>
            <td style="padding:8px 32px 16px 32px;">
              <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#0d9488;text-transform:uppercase;margin-bottom:10px;">Resumen del periodo</div>
                <div style="font-size:14px;line-height:1.6;color:#334155;">
                  ${resumenHtml}
                </div>
              </div>
            </td>
          </tr>

          <!-- ADJUNTO -->
          <tr>
            <td style="padding:8px 32px 24px 32px;">
              <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:16px 20px;display:flex;align-items:center;">
                <div style="font-size:22px;margin-right:12px;">📎</div>
                <div>
                  <div style="font-size:14px;font-weight:600;color:#065f46;">Archivo adjunto</div>
                  <div style="font-size:13px;color:#047857;">${esc(filename)}</div>
                </div>
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <div style="border-top:1px solid #e2e8f0;padding-top:18px;font-size:12px;color:#64748b;line-height:1.6;">
                Este correo ha sido generado por <strong style="color:#0f172a;">Papeleo Fácil</strong> en nombre del cliente.<br/>
                Si necesita aclarar cualquier dato, puede responder directamente a este correo${replyToValido ? " — su respuesta llegará al cliente." : "."}
              </div>
            </td>
          </tr>
        </table>

        <div style="max-width:600px;margin:14px auto 0;text-align:center;font-size:11px;color:#94a3b8;">
          Papeleo Fácil · Gestión documental para autónomos<br/>
          autonomo@papeleofacil.es
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const message: any = {
      from: fromHeader,
      to: company.gestoria_email,
      subject,
      text: textoPlano,
      attachment: [
        { data: html, alternative: true, type: "text/html" },
        { data: zipBytes, type: "application/zip", name: filename },
      ],
    };
    if (replyToValido) {
      message["reply-to"] = replyToValido;
    }

    await new Promise<void>((resolve, reject) => {
      client.send(message, (err: any) => (err ? reject(err) : resolve()));
    });

    return new Response(JSON.stringify({ ok: true, sentTo: company.gestoria_email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-gestoria-email error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Error desconocido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
