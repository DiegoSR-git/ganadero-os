import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Check, X, Mail, Building2, CreditCard, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Empresa = {
  link_id: string; status: string; requested_by: string; requested_at: string;
  decided_at: string | null; company_id: string; nombre_comercial: string;
  nif: string | null; email: string | null; whatsapp_number: string | null;
  estado_suscripcion: string; is_active: boolean;
};

type Gestoria = {
  id: string; nombre: string; email: string; nif: string | null; telefono: string | null;
  direccion: string | null; is_active: boolean; subscription_status: string | null;
  current_period_end: string | null; max_empresas: number; stripe_subscription_id: string | null;
};

const CHECKOUT_GESTORIA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout-gestoria`;

export default function PanelGestoria() {
  const { user, gestoriaId, setCurrentCompanyId } = useAuth();
  const nav = useNavigate();
  const [gest, setGest] = useState<Gestoria | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: g }, { data: list }] = await Promise.all([
      supabase.from("gestorias").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.rpc("gestoria_listar_empresas"),
    ]);
    setGest(g as Gestoria | null);
    setEmpresas((list as Empresa[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [user, gestoriaId]);

  async function decide(link_id: string, decision: "accepted" | "rejected" | "revoked") {
    setBusy(true);
    const { error } = await supabase.rpc("decide_gestoria_link", { _link_id: link_id, _decision: decision });
    setBusy(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: decision === "accepted" ? "Empresa vinculada" : decision === "rejected" ? "Solicitud rechazada" : "Vínculo revocado" });
    load();
  }

  async function invitar() {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("gestoria_invite_company", { _company_email: inviteEmail.trim() });
    setBusy(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Solicitud enviada", description: "La empresa verá tu invitación al entrar en su panel." });
    setInviteEmail("");
    load();
  }

  async function iniciarCheckout() {
    if (!gest) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setBusy(true);
    try {
      const res = await fetch(CHECKOUT_GESTORIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ gestoria_id: gest.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "No se pudo iniciar el pago");
      window.location.href = json.url;
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  }

  function entrarComoEmpresa(companyId: string) {
    setCurrentCompanyId(companyId);
    toast({ title: "Empresa seleccionada", description: "Ya operas sobre esa empresa." });
    nav("/app");
  }

  if (loading) return <div className="text-muted-foreground">Cargando…</div>;
  if (!gest) {
    return <PageHeader title="Panel gestoría" description="No tienes una gestoría registrada con esta cuenta." />;
  }

  const aceptadas = empresas.filter((e) => e.status === "accepted");
  const pendientes = empresas.filter((e) => e.status === "pending");

  return (
    <>
      <PageHeader
        title="Panel gestoría"
        description={`${gest.nombre} · ${aceptadas.length}/${gest.max_empresas} empresas activas`}
        actions={
          !gest.is_active ? (
            <Button onClick={iniciarCheckout} disabled={busy}>
              <CreditCard className="mr-2 h-4 w-4" />Activar suscripción 25€/mes
            </Button>
          ) : (
            <Button variant="outline" onClick={load} disabled={busy}>
              <RefreshCw className="mr-2 h-4 w-4" />Actualizar
            </Button>
          )
        }
      />

      {!gest.is_active && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
          Tu suscripción no está activa. Mientras no esté activa, las empresas vinculadas no reciben el descuento del 50%.
        </div>
      )}

      <Tabs defaultValue="empresas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="empresas">Mis empresas ({aceptadas.length})</TabsTrigger>
          <TabsTrigger value="solicitudes">Solicitudes ({pendientes.length})</TabsTrigger>
          <TabsTrigger value="invitar">Invitar</TabsTrigger>
          <TabsTrigger value="cuenta">Mi cuenta</TabsTrigger>
        </TabsList>

        <TabsContent value="empresas">
          <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="hidden md:table-cell">NIF</TableHead>
                  <TableHead className="hidden lg:table-cell">Email</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aceptadas.map((e) => (
                  <TableRow key={e.link_id}>
                    <TableCell className="font-medium">{e.nombre_comercial}</TableCell>
                    <TableCell className="hidden md:table-cell">{e.nif ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell">{e.email ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`text-xs rounded px-2 py-0.5 ${e.is_active ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
                        {e.is_active ? "Activa" : e.estado_suscripcion}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => entrarComoEmpresa(e.company_id)}>
                        <Building2 className="mr-1.5 h-3.5 w-3.5" />Entrar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => decide(e.link_id, "revoked")} disabled={busy}>
                        Desvincular
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!aceptadas.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aún no gestionas ninguna empresa.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="solicitudes">
          <div className="rounded-lg border bg-card shadow-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="hidden md:table-cell">Solicitado por</TableHead>
                  <TableHead className="hidden md:table-cell">Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.map((e) => (
                  <TableRow key={e.link_id}>
                    <TableCell className="font-medium">
                      {e.nombre_comercial}
                      <div className="text-xs text-muted-foreground">{e.email}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell capitalize">{e.requested_by}</TableCell>
                    <TableCell className="hidden md:table-cell">{new Date(e.requested_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" onClick={() => decide(e.link_id, "accepted")} disabled={busy}>
                        <Check className="mr-1.5 h-3.5 w-3.5" />Aceptar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide(e.link_id, "rejected")} disabled={busy}>
                        <X className="mr-1.5 h-3.5 w-3.5" />Rechazar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!pendientes.length && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin solicitudes pendientes.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="invitar">
          <div className="rounded-lg border bg-card p-4 shadow-card max-w-xl">
            <h3 className="font-semibold mb-1">Invitar a una empresa existente</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Introduce el email con el que la empresa está registrada en GanaderOS. Se le enviará una solicitud pendiente de aceptar.
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="empresa@ejemplo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <Button onClick={invitar} disabled={busy || !inviteEmail.trim()}>
                <Mail className="mr-2 h-4 w-4" />Enviar
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cuenta">
          <div className="rounded-lg border bg-card p-4 shadow-card max-w-2xl space-y-3 md:p-6">
            <h3 className="font-semibold">Datos de la gestoría</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Info label="Nombre" v={gest.nombre} />
              <Info label="Email" v={gest.email} />
              <Info label="NIF/CIF" v={gest.nif ?? "—"} />
              <Info label="Teléfono" v={gest.telefono ?? "—"} />
              <Info label="Dirección" v={gest.direccion ?? "—"} />
              <Info label="Plazas" v={`${aceptadas.length} / ${gest.max_empresas}`} />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <strong>Suscripción:</strong>{" "}
              {gest.is_active ? <span className="text-green-700">Activa</span> : <span className="text-amber-700">No activa</span>}
              {gest.current_period_end && (
                <span className="text-muted-foreground"> · Próximo cargo: {new Date(gest.current_period_end).toLocaleDateString()}</span>
              )}
            </div>
            {!gest.is_active && (
              <Button onClick={iniciarCheckout} disabled={busy}>
                <CreditCard className="mr-2 h-4 w-4" />Activar suscripción 25€/mes
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

const Info = ({ label, v }: { label: string; v: string }) => (
  <div>
    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
    <div className="font-medium">{v}</div>
  </div>
);
