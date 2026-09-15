// Devuelve estado de un pending_registration por id (público, solo lectura mínima).
// Usado por /billing/success para confirmar que el webhook ya activó la cuenta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");
  const pendingId = url.searchParams.get("pending_id");
  if (!sessionId && !pendingId) {
    return new Response(JSON.stringify({ error: "session_id o pending_id requerido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const q = supabase.from("pending_registrations").select("id, email, status, completed_at, expires_at");
  const { data } = pendingId
    ? await q.eq("id", pendingId).maybeSingle()
    : await q.eq("stripe_checkout_session_id", sessionId!).maybeSingle();

  return new Response(JSON.stringify({ registration: data }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});