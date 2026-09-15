// Webhook de Stripe. Fuente de verdad para activar empresas.
// IMPORTANT: verify_jwt = false. Validamos la firma de Stripe en código.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
};

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY")!;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const stripe = new Stripe(stripeSecret, { apiVersion: "2024-11-20.acacia" });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Activa la empresa: crea usuario auth si hace falta, crea companies + user_role + profile.current_company_id */
async function completeRegistration(pendingId: string, sub: {
  customer_id?: string | null;
  subscription_id?: string | null;
  price_id?: string | null;
  status?: string | null;
  current_period_end?: number | null;
}) {
  const { data: pending } = await supabase
    .from("pending_registrations").select("*").eq("id", pendingId).maybeSingle();
  if (!pending) { console.warn("pending no encontrado", pendingId); return; }
  if (pending.status === "completed" && pending.company_id) {
    // Ya completado: solo actualizar datos de suscripción si hace falta
    if (sub.subscription_id) {
      await supabase.from("companies").update({
        stripe_customer_id: sub.customer_id ?? undefined,
        stripe_subscription_id: sub.subscription_id ?? undefined,
        stripe_price_id: sub.price_id ?? undefined,
        subscription_status: sub.status ?? undefined,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        is_active: ["active", "trialing"].includes(sub.status ?? ""),
      }).eq("id", pending.company_id);
    }
    return;
  }

  // 1) Crear usuario auth (auto-confirmado) usando el password_hash bcrypt
  let userId = pending.user_id as string | null;
  if (!userId) {
    const { data: created, error: cErr } = await supabase.auth.admin.createUser({
      email: pending.email,
      password_hash: pending.password_hash,
      email_confirm: true,
      user_metadata: { display_name: pending.nombre_comercial },
    });
    if (cErr) {
      // Si el usuario ya existe (caso raro de carrera), buscarlo
      const { data: list } = await supabase.auth.admin.listUsers();
      const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === pending.email.toLowerCase());
      if (!found) { console.error("createUser error y no encontrado:", cErr); throw cErr; }
      userId = found.id;
    } else {
      userId = created.user!.id;
    }
  }

  // 2) Crear empresa
  let companyId = pending.company_id as string | null;
  if (!companyId) {
    const { data: comp, error: eComp } = await supabase.from("companies").insert({
      nombre_comercial: pending.nombre_comercial,
      razon_social: pending.razon_social,
      nif: pending.nif,
      telefono: pending.telefono,
      email: pending.email,
      whatsapp_number: pending.whatsapp_number,
      stripe_customer_id: sub.customer_id ?? null,
      stripe_subscription_id: sub.subscription_id ?? null,
      stripe_price_id: sub.price_id ?? null,
      subscription_status: sub.status ?? "active",
      current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      is_active: true,
    }).select("id").single();
    if (eComp) throw eComp;
    companyId = comp.id;
  }

  // 3) Asignar rol y profile.current_company_id
  await supabase.from("user_roles").upsert(
    { user_id: userId!, company_id: companyId!, role: "cliente_empresa" },
    { onConflict: "user_id,role,company_id" } as any,
  );
  await supabase.from("profiles").update({ current_company_id: companyId }).eq("user_id", userId!);

  // 3b) Si el alta venía con gestoría vinculada, crear link accepted
  const gestoriaIdRaw = (pending.raw_payload as any)?.gestoria_id ?? null;
  if (gestoriaIdRaw) {
    const { data: g } = await supabase
      .from("gestorias").select("id, is_active").eq("id", gestoriaIdRaw).maybeSingle();
    if (g?.is_active) {
      await supabase.from("gestoria_empresa_links").insert({
        gestoria_id: g.id, company_id: companyId, status: "accepted", requested_by: "auto",
      } as any);
    }
  }

  // 4) Marcar pending como completado y borrar password_hash
  await supabase.from("pending_registrations").update({
    status: "completed",
    completed_at: new Date().toISOString(),
    company_id: companyId,
    user_id: userId,
    stripe_customer_id: sub.customer_id ?? null,
    stripe_subscription_id: sub.subscription_id ?? null,
    password_hash: "__consumed__",
  }).eq("id", pendingId);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const periodEnd = subscription.current_period_end;

  // ¿Es una suscripción de gestoría?
  const meta = (subscription.metadata as any) ?? {};
  const gestoriaId = meta.gestoria_id ?? null;
  if (meta.kind === "gestoria" || gestoriaId) {
    const isActive = ["active", "trialing"].includes(subscription.status);
    const { data: gByMeta } = gestoriaId
      ? await supabase.from("gestorias").select("id").eq("id", gestoriaId).maybeSingle()
      : { data: null };
    const { data: gByCustomer } = !gByMeta
      ? await supabase.from("gestorias").select("id").eq("stripe_customer_id", customerId).maybeSingle()
      : { data: null };
    const targetGestoria = gByMeta ?? gByCustomer;
    if (targetGestoria) {
      await supabase.from("gestorias").update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        subscription_status: subscription.status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        is_active: isActive,
      }).eq("id", targetGestoria.id);
      return;
    }
  }

  // Buscar empresa por subscription_id o customer_id
  const { data: company } = await supabase.from("companies").select("id")
    .or(`stripe_subscription_id.eq.${subscription.id},stripe_customer_id.eq.${customerId}`)
    .maybeSingle();

  if (company) {
    await supabase.from("companies").update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      subscription_status: subscription.status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      is_active: ["active", "trialing"].includes(subscription.status),
    }).eq("id", company.id);
    return;
  }

  // Si no hay empresa todavía, intentar completar registro vía metadata
  const pendingId = (subscription.metadata as any)?.pending_registration_id;
  if (pendingId) {
    await completeRegistration(pendingId, {
      customer_id: customerId,
      subscription_id: subscription.id,
      price_id: priceId,
      status: subscription.status,
      current_period_end: periodEnd,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
  } catch (e) {
    console.error("Firma inválida", e);
    return new Response(`Bad signature: ${(e as Error).message}`, { status: 400 });
  }

  // Idempotencia: reclamamos el evento ANTES de procesarlo. Si Stripe lo reenvía
  // (o llegan dos entregas a la vez), el índice único lo rechaza y no se procesa dos veces.
  const { error: claimErr } = await supabase.from("stripe_events").insert({
    id: event.id, type: event.type, payload: event as any,
  });
  if (claimErr) {
    if (String((claimErr as any).code) === "23505") {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 });
    }
    console.error("no se pudo reclamar el evento de Stripe", claimErr);
    return new Response(JSON.stringify({ error: "claim failed" }), { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const pendingId = (session.metadata as any)?.pending_registration_id;
        if (pendingId && session.payment_status !== "unpaid") {
          // Recuperar suscripción para datos completos
          let subData: any = { customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id };
          if (session.subscription) {
            const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
            const sub = await stripe.subscriptions.retrieve(subId);
            subData = {
              customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
              subscription_id: sub.id,
              price_id: sub.items.data[0]?.price.id ?? null,
              status: sub.status,
              current_period_end: sub.current_period_end,
            };
          }
          await completeRegistration(pendingId, subData);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
    const meta = (sub.metadata as any) ?? {};
    if (meta.kind === "gestoria" || meta.gestoria_id) {
      await supabase.from("gestorias").update({
        subscription_status: "canceled",
        is_active: false,
      }).eq("stripe_subscription_id", sub.id);
      break;
    }
        await supabase.from("companies").update({
          subscription_status: "canceled",
          is_active: false,
        }).eq("stripe_subscription_id", sub.id);
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await handleSubscriptionUpdate(sub);
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
        if (subId) {
          await supabase.from("companies").update({
            subscription_status: "past_due",
          }).eq("stripe_subscription_id", subId);
        }
        break;
      }
      default:
        // Ignorar otros eventos
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // El evento no se procesó: liberamos la reclamación para que Stripe pueda reintentarlo.
    await supabase.from("stripe_events").delete().eq("id", event.id);
    console.error("webhook handler error", event.type, e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});