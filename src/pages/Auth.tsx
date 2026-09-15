import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sprout } from "lucide-react";
import { z } from "zod";

const CHECKOUT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`;

const loginSchema = z.object({
  email: z.string().email("Email no válido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

const signupSchema = z.object({
  email: z.string().email("Email no válido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
  nombre_comercial: z.string().trim().min(1, "El nombre de la explotación es obligatorio").max(120),
  razon_social: z.string().trim().max(160).optional(),
  nif: z.string().trim().max(20).optional(),
  telefono: z.string().max(30).optional(),
  whatsapp_number: z.string().max(30).optional(),
});

export default function Auth() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreExplotacion, setNombreExplotacion] = useState("");
  const [titular, setTitular] = useState("");
  const [nif, setNif] = useState("");
  const [telefono, setTelefono] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav("/app"); });
  }, [nav]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) { toast({ title: "Datos inválidos", description: parsed.error.issues[0].message, variant: "destructive" }); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast({ title: "No se pudo entrar", description: error.message, variant: "destructive" }); return; }
    nav("/app");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse({
      email, password,
      nombre_comercial: nombreExplotacion,
      razon_social: titular,
      nif, telefono, whatsapp_number: whatsappNumber,
    });
    if (!parsed.success) {
      toast({ title: "Datos inválidos", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, password,
          nombre_comercial: nombreExplotacion,
          razon_social: titular || null,
          nif: nif || null,
          telefono: telefono || null,
          whatsapp_number: whatsappNumber || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "No se pudo iniciar el pago");
      window.location.href = json.url;
    } catch (err) {
      setLoading(false);
      toast({ title: "No se pudo continuar", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-hero text-primary-foreground shadow-elevated">
            <Sprout className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xl font-bold">GanaderOS</div>
            <div className="text-xs text-muted-foreground">Gestiona tu explotación hablando por WhatsApp</div>
          </div>
        </div>
        <Card className="shadow-elevated">
          <CardHeader>
            <CardTitle>Acceso a tu explotación</CardTitle>
            <CardDescription>Crea tu cuenta y empieza a registrar tu ganado en un minuto.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4 pt-4">
                  <div className="space-y-2"><Label>Email</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                  <div className="space-y-2"><Label>Contraseña</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                  <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-5 pt-4">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tu cuenta</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2"><Label>Email *</Label>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                      <div className="space-y-2 sm:col-span-2"><Label>Contraseña *</Label>
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tu explotación</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2"><Label>Nombre de la explotación *</Label>
                        <Input value={nombreExplotacion} onChange={(e) => setNombreExplotacion(e.target.value)} placeholder="Ej: Dehesa La Herguijuela" required /></div>
                      <div className="space-y-2 sm:col-span-2"><Label>Titular</Label>
                        <Input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombre del titular o sociedad" /></div>
                      <div className="space-y-2"><Label>NIF / CIF</Label>
                        <Input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="12345678Z" /></div>
                      <div className="space-y-2"><Label>Teléfono</Label>
                        <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+34 600 000 000" /></div>
                      <div className="space-y-2 sm:col-span-2"><Label>WhatsApp autorizado</Label>
                        <Input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="+34 600 000 000" />
                        <p className="text-xs text-muted-foreground">Desde este número podrás registrar partos, pesajes o tratamientos por WhatsApp.</p>
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirigiendo a pago…</>
                      : "Continuar al pago"}
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    Tu cuenta se activará automáticamente tras confirmar el pago y validar tu email.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
