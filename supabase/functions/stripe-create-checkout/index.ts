// Crea un registro provisional en pending_registrations y devuelve la URL de Stripe Checkout.
// Sin auth: cualquiera puede iniciar el alta. Solo el webhook activa la cuenta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  try {
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    const priceId = Deno.env.get("STRIPE_PRICE_BASIC");
    if (!stripeSecret || !priceId) return bad("Stripe no configurado", 500);

    const body = await req.json().catch(() => ({}));
    const {
      email, password, nombre_comercial,
      razon_social, nif, telefono, whatsapp_number,
      gestoria_email,
      pending_id, // opcional: reintento de checkout para registro existente
    } = body ?? {};

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let pending: any = null;

    // ---- Reintento: usar registro existente si sigue vigente ----
    if (pending_id) {
      const { data } = await supabase
        .from("pending_registrations")
        .select("*")
        .eq("id", pending_id)
        .maybeSingle();
      if (!data) return bad("Registro no encontrado", 404);
      if (data.status === "completed") return bad("Este registro ya está activo. Inicia sesión.", 409);
      if (new Date(data.expires_at).getTime() < Date.now()) return bad("El registro ha caducado, vuelve a empezar.", 410);
      pending = data;
    } else {
      // ---- Nuevo registro provisional ----
      if (!email || !password || !nombre_comercial) return bad("Faltan datos obligatorios");
      if (String(password).length < 6) return bad("Contraseña mínima 6 caracteres");

      // Si ya existe un usuario con ese email, no permitir crear otro
      const { data: existing } = await supabase.auth.admin.listUsers();
      if (existing?.users?.some((u) => (u.email ?? "").toLowerCase() === String(email).toLowerCase())) {
        return bad("Ya existe una cuenta con ese email. Inicia sesión.", 409);
      }

      // Reutilizar pending vigente con mismo email para evitar duplicados
      const { data: live } = await supabase
        .from("pending_registrations")
        .select("*")
        .ilike("email", email)
        .eq("status", "pending_payment")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // bcryptjs es JS puro y funciona en Edge Runtime (no usa Web Workers).
      // Generamos hash $2a$ compatible con Supabase Auth (password_hash en createUser).
      const password_hash = bcrypt.hashSync(String(password), 10);

      if (live) {
        const { data: upd } = await supabase
          .from("pending_registrations")
          .update({
            password_hash,
            nombre_comercial, razon_social: razon_social || null,
            nif: nif || null, telefono: telefono || null,
            whatsapp_number: whatsapp_number || null,
          })
          .eq("id", live.id).select("*").maybeSingle();
        pending = upd ?? live;
      } else {
        const { data: ins, error } = await supabase
          .from("pending_registrations")
          .insert({
            email, password_hash, nombre_comercial,
            razon_social: razon_social || null, nif: nif || null,
            telefono: telefono || null, whatsapp_number: whatsapp_number || null,
          })
          .select("*").single();
        if (error) return bad(error.message, 500);
        pending = ins;
      }
    }

    // ---- Stripe Checkout ----
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" });
    const origin = req.headers.get("origin") ?? new URL(req.url).origin;

    // ¿La empresa se vincula a una gestoría activa? → aplicar cupón 50%
    const couponId = Deno.env.get("STRIPE_COUPON_50") || undefined;
    let discounts: any[] | undefined = undefined;
    let gestoriaIdForMeta: string | null = null;
    const gEmail = (gestoria_email ?? (pending && (pending as any).raw_payload?.gestoria_email) ?? "").toString().trim().toLowerCase();
    if (gEmail) {
      const { data: g } = await supabase
        .from("gestorias")
        .select("id, is_active")
        .eq("email", gEmail)
        .eq("is_active", true)
        .maybeSingle();
      if (g) {
        gestoriaIdForMeta = g.id;
        if (couponId) discounts = [{ coupon: couponId }];
      }
    }

    // Persistir gestoria_email en raw_payload del pending para que el webhook lo recoja
    if (gEmail) {
      await supabase
        .from("pending_registrations")
        .update({ raw_payload: { ...(pending.raw_payload ?? {}), gestoria_email: gEmail, gestoria_id: gestoriaIdForMeta } })
        .eq("id", pending.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: pending.email,
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing/cancel?pending_id=${pending.id}`,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      metadata: {
        pending_registration_id: pending.id,
        app_name: "GanaderOS",
        ...(gestoriaIdForMeta ? { gestoria_id: gestoriaIdForMeta } : {}),
      },
      subscription_data: {
        metadata: {
          pending_registration_id: pending.id,
          app_name: "GanaderOS",
          ...(gestoriaIdForMeta ? { gestoria_id: gestoriaIdForMeta } : {}),
        },
      },
    });

    await supabase
      .from("pending_registrations")
      .update({ stripe_checkout_session_id: session.id, status: "pending_payment" })
      .eq("id", pending.id);

    return new Response(JSON.stringify({ url: session.url, pending_id: pending.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stripe-create-checkout error", e);
    return bad((e as Error).message ?? "Error inesperado", 500);
  }
});