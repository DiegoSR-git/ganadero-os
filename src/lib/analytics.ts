import { supabase } from "@/integrations/supabase/client";

/**
 * Analítica interna de producto. Nunca rompe la interfaz: si falla, se ignora.
 * Los eventos quedan aislados por explotación y sólo los lee el panel interno.
 */
export async function track(
  evento: string,
  props: Record<string, unknown> = {},
  explotacionId?: string | null,
) {
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;
    if (!userId) return;
    await supabase.from("product_events").insert({
      evento,
      props: props as never,
      user_id: userId,
      explotacion_id: explotacionId ?? null,
      canal: "app",
    });
  } catch {
    /* la analítica nunca bloquea al usuario */
  }
}
