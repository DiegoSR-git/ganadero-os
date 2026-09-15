// Alta de gestoría: crea registro en gestorias + Stripe Checkout 25€/mes
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

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
    const priceId = Deno.env.get("STRIPE_PRICE_GESTORIA");
    if (!stripeSecret || !priceId) return bad("Stripe gestoría no configurado", 500);

    // Requiere usuario autenticado
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return bad("No autenticado", 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes } = await supabase.auth.getUser(token);
    const user = userRes?.user;
    if (!user) return bad("Sesión no válida", 401);

    const { gestoria_id } = await req.json().catch(() => ({}));
    if (!gestoria_id) return bad("Falta gestoria_id");

    const { data: gest } = await supabase
      .from("gestorias")
      .select("*")
      .eq("id", gestoria_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!gest) return bad("Gestoría no encontrada", 404);
    if (gest.is_active && gest.subscription_status === "active") {
      return bad("Tu gestoría ya tiene suscripción activa", 409);
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" });
    const origin = req.headers.get("origin") ?? new URL(req.url).origin;

    // Crear o reutilizar customer
    let customerId = gest.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: gest.email,
        name: gest.nombre,
        metadata: { gestoria_id: gest.id, kind: "gestoria" },
      });
      customerId = customer.id;
      await supabase.from("gestorias").update({ stripe_customer_id: customerId }).eq("id", gest.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app?gestoria_alta=ok`,
      cancel_url: `${origin}/app?gestoria_alta=cancel`,
      allow_promotion_codes: true,
      metadata: { gestoria_id: gest.id, kind: "gestoria" },
      subscription_data: {
        metadata: { gestoria_id: gest.id, kind: "gestoria" },
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stripe-create-checkout-gestoria error", e);
    return bad((e as Error).message ?? "Error inesperado", 500);
  }
});