import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ExplotacionProvider } from "@/hooks/useExplotacion";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import GanaderoLayout from "@/components/GanaderoLayout";
import Auth from "@/pages/Auth";
import Landing from "@/pages/Landing";
import BillingSuccess from "@/pages/BillingSuccess";
import BillingCancel from "@/pages/BillingCancel";

// GanaderOS
import Inicio from "@/pages/ganadero/Inicio";
import Animales from "@/pages/ganadero/Animales";
import AnimalFicha from "@/pages/ganadero/AnimalFicha";
import Lotes from "@/pages/ganadero/Lotes";
import Fincas from "@/pages/ganadero/Fincas";
import Economia from "@/pages/ganadero/Economia";
import Documentos from "@/pages/ganadero/Documentos";
import TareasPage from "@/pages/ganadero/Tareas";
import Asistente from "@/pages/ganadero/Asistente";
import Configuracion from "@/pages/ganadero/Configuracion";
import Ayuda from "@/pages/ganadero/Ayuda";
import PanelPiloto from "@/pages/ganadero/PanelPiloto";

// Módulos heredados (facturación, WhatsApp, gestoría)
import Dashboard from "@/pages/Dashboard";
import Empresas from "@/pages/Empresas";
import MiEmpresa from "@/pages/MiEmpresa";
import Clientes from "@/pages/Clientes";
import Facturas from "@/pages/Facturas";
import Gastos from "@/pages/Gastos";
import Cobros from "@/pages/Cobros";
import Resumen from "@/pages/Resumen";
import Gestoria from "@/pages/Gestoria";
import PanelGestoria from "@/pages/PanelGestoria";
import Inbox from "@/pages/Inbox";
import DemoWebhook from "@/pages/DemoWebhook";

import Terminos from "@/pages/legal/Terminos";
import Privacidad from "@/pages/legal/Privacidad";
import AvisoLegal from "@/pages/legal/AvisoLegal";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ExplotacionProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/billing/success" element={<BillingSuccess />} />
              <Route path="/billing/cancel" element={<BillingCancel />} />
              <Route path="/terminos" element={<Terminos />} />
              <Route path="/privacidad" element={<Privacidad />} />
              <Route path="/aviso-legal" element={<AvisoLegal />} />

              <Route element={<ProtectedRoute><GanaderoLayout /></ProtectedRoute>}>
                <Route path="/app" element={<Inicio />} />
                <Route path="/animales" element={<Animales />} />
                <Route path="/animales/:id" element={<AnimalFicha />} />
                <Route path="/lotes" element={<Lotes />} />
                <Route path="/fincas" element={<Fincas />} />
                <Route path="/economia" element={<Economia />} />
                <Route path="/documentos" element={<Documentos />} />
                <Route path="/tareas" element={<TareasPage />} />
                <Route path="/asistente" element={<Asistente />} />
                <Route path="/configuracion" element={<Configuracion />} />
                <Route path="/ayuda" element={<Ayuda />} />
                <Route path="/panel-piloto" element={<PanelPiloto />} />
              </Route>

              {/* Módulos heredados de facturación y WhatsApp */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/facturacion" element={<Dashboard />} />
                <Route path="/empresas" element={<Empresas />} />
                <Route path="/mi-empresa" element={<MiEmpresa />} />
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/facturas" element={<Facturas />} />
                <Route path="/gastos" element={<Gastos />} />
                <Route path="/cobros" element={<Cobros />} />
                <Route path="/resumen" element={<Resumen />} />
                <Route path="/gestoria" element={<Gestoria />} />
                <Route path="/panel-gestoria" element={<PanelGestoria />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/demo-webhook" element={<DemoWebhook />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </ExplotacionProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
