import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Check,
  Sparkles,
  ArrowRight,
  Smartphone,
  MessageCircle,
  Camera,
  FileText,
  FolderArchive,
  ShieldCheck,
  Beef,
  MapPinned,
  HeartPulse,
  Wallet,
  CalendarClock,
  Leaf,
  ClipboardList,
} from "lucide-react";
import heroImg from "@/assets/ganadero-hero.jpg";

const features = [
  {
    icon: Beef,
    title: "Gestion de animales por crotal",
    desc: "Crotal, raza, edad, lote y estado reproductivo. Busca cualquier animal en un segundo desde tu movil.",
  },
  {
    icon: ClipboardList,
    title: "Cuaderno ganadero digital",
    desc: "Partos, tratamientos, pesajes, movimientos o incidencias quedan en el historial completo del animal.",
  },
  {
    icon: MapPinned,
    title: "Fincas, parcelas y lotes",
    desc: "Organiza el ganado por lotes y sabe siempre en que finca o parcela esta cada grupo.",
  },
  {
    icon: HeartPulse,
    title: "Control sanitario y reproduccion",
    desc: "Tratamientos activos, vacunas, cubriciones, gestaciones y partos del mes en una sola app.",
  },
  {
    icon: Wallet,
    title: "Gastos e ingresos de la explotacion",
    desc: "Pienso, veterinario, combustible o venta de animales, con foto del ticket y lectura automatica.",
  },
  {
    icon: FolderArchive,
    title: "Archivo documental ganadero",
    desc: "Guias, recetas, certificados y facturas guardados y asociados a cada animal.",
  },
];

const steps = [
  { n: "1", t: "Crea tu explotación", d: "Nombre, código REGA, municipio y superficie. Un minuto y listo." },
  { n: "2", t: "Da de alta el ganado", d: "Animales por crotal, agrupados en lotes y repartidos por fincas y parcelas." },
  { n: "3", t: "Registra desde el campo", d: "Un toque en «Registrar» y el parto, tratamiento o pesaje queda guardado." },
];

const incluido = [
  "Animales, lotes, fincas y parcelas sin límite",
  "Historial completo de cada animal",
  "Partos, tratamientos, vacunas y pesajes",
  "Gastos e ingresos de la explotación",
  "Lectura de tickets y facturas con IA",
  "Documentos y archivo digital seguro",
  "Registro por WhatsApp",
  "Sin permanencia, cancelas cuando quieras",
];

const seoBenefits = [
  "Software de gestion ganadera para vacuno, ovino, caprino, porcino y equino.",
  "Programa para ganaderos con animales por crotal, lotes, fincas y parcelas.",
  "Cuaderno de explotacion ganadera digital con partos, tratamientos, vacunas y pesajes.",
  "Control economico de gastos, ingresos y documentos de la explotacion.",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero text-primary-foreground shadow-card">
              <Leaf className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold">GanaderOS</div>
              <div className="text-[11px] text-muted-foreground">Tu explotación, en el móvil</div>
            </div>
          </Link>
          <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#como-funciona" className="hover:text-foreground">
              Cómo funciona
            </a>
            <a href="#features" className="hover:text-foreground">
              Funciones
            </a>
            <a href="#campo" className="hover:text-foreground">
              En el campo
            </a>
            <a href="#precio" className="hover:text-foreground">
              Precio
            </a>
            <a href="#gestorias" className="font-bold text-primary hover:text-primary/80">
              ¿Eres gestor o asesor?
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">
                Entrar
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Empezar</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-gradient-soft">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-strong">
              <Sparkles className="h-3.5 w-3.5" /> Software de gestion ganadera · Primera version disponible
            </span>
            <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              La gestion diaria de tu
              <br />
              explotacion ganadera, <span className="text-primary">desde el movil</span>.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              GanaderOS es un programa para ganaderos que une animales por crotal, lotes, fincas, partos,
              tratamientos, gastos y documentos en un solo sitio. Sin cuadernos, sin Excel y sin volver a casa para
              apuntarlo.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="gap-2">
                  Empieza ahora <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="#precio">
                <Button size="lg" variant="outline">
                  Ver precio
                </Button>
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-primary" /> App para usar en el campo
              </span>
              <span className="inline-flex items-center gap-1">
                <Check className="h-3.5 w-3.5 text-primary" /> Cancela cuando quieras
              </span>
            </div>
          </div>
          <div className="relative">
            <img
              src={heroImg}
              alt="Ganadero consultando su explotación en el móvil junto a las vacas en la dehesa"
              width={1280}
              height={960}
              className="w-full rounded-2xl shadow-elevated"
            />
            <div className="absolute -bottom-4 -left-4 hidden rounded-xl border bg-card p-3 shadow-card md:block">
              <div className="flex items-center gap-2 text-xs">
                <CalendarClock className="h-4 w-4 text-primary" /> Un parto anotado en <b>15 segundos</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Como funciona</h2>
          <p className="mt-2 text-muted-foreground">Un cuaderno de explotacion ganadera digital en 3 pasos.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <Card key={s.n} className="shadow-card">
              <CardContent className="p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {s.n}
                </div>
                <div className="text-lg font-semibold">{s.t}</div>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-bold tracking-tight">Todo lo que pasa en la explotacion</h2>
            <p className="mt-2 text-muted-foreground">
              Cada animal con su historia completa: de donde viene, que le has hecho y donde esta.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="shadow-card transition hover:shadow-elevated">
                <CardContent className="p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary-strong">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <div className="text-base font-semibold">{f.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* EN EL CAMPO */}
      <section id="campo" className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary-strong">
              <Smartphone className="h-4 w-4" /> Pensado para el campo
            </div>
            <h2 className="text-3xl font-bold tracking-tight">Apunta lo que pasa cuando pasa</h2>
            <p className="mt-3 text-muted-foreground">
              Con las manos sucias y sin cobertura buena, lo ultimo que apetece es rellenar formularios largos. En
              GanaderOS registras un evento en dos toques.
            </p>
            <ul className="mt-6 space-y-4">
              {[
                { icon: ClipboardList, t: "Botón Registrar siempre visible", d: "Parto, tratamiento, pesaje, incidencia o cambio de lote." },
                { icon: Camera, t: "Foto del ticket o la receta", d: "Se lee sola y queda guardada como gasto o documento." },
                { icon: MessageCircle, t: "También por WhatsApp", d: "Manda un mensaje o una foto y queda registrado en tu explotación." },
                { icon: FileText, t: "Todo en la ficha del animal", d: "Historial cronológico, descendencia, sanidad y pesos." },
              ].map((s, i) => (
                <li key={i} className="flex gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      <s.icon className="h-4 w-4 text-primary" /> {s.t}
                    </div>
                    <p className="text-sm text-muted-foreground">{s.d}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <Link to="/auth">
                <Button className="gap-2">
                  Crear mi explotación <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border bg-gradient-soft p-6 shadow-card">
            <div className="text-sm font-semibold text-muted-foreground">Hoy en tu explotación</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border bg-card p-4 shadow-card">
                🔴 <b>3 incidencias abiertas</b>
                <div className="text-muted-foreground">Cojera, mastitis y un ternero decaído</div>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-card">
                🟠 <b>4 tratamientos activos</b>
                <div className="text-muted-foreground">Con fecha de fin y periodo de supresión</div>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-card">
                🟡 <b>5 tareas pendientes</b>
                <div className="text-muted-foreground">Vacunación del lote de novillas</div>
              </div>
              <div className="rounded-xl border bg-card p-4 shadow-card">
                🟢 <b>2 partos este mes</b>
                <div className="text-muted-foreground">Crías dadas de alta automáticamente</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="mb-8 max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight">Software ganadero pensado para explotaciones reales</h2>
            <p className="mt-3 text-muted-foreground">
              GanaderOS ayuda a digitalizar el dia a dia de la explotacion sin complicar el trabajo: control de
              animales, sanidad, reproduccion, economia y documentos en una herramienta clara para ganaderos y
              gestorías.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {seoBenefits.map((benefit) => (
              <div key={benefit} className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm shadow-card">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRECIO */}
      <section id="precio" className="mx-auto max-w-3xl px-4 py-16">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Un precio. Todo incluido.</h2>
          <p className="mt-2 text-muted-foreground">Sin sorpresas, sin permanencia. Cancela cuando quieras.</p>
        </div>
        <Card className="overflow-hidden border-2 border-primary shadow-elevated">
          <div className="bg-gradient-hero px-6 py-3 text-center text-sm font-medium text-primary-foreground">
            🌿 Oferta de lanzamiento · tiempo limitado
          </div>
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center">
              <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Plan único</div>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="text-2xl text-muted-foreground line-through">15€</span>
                <span className="text-6xl font-bold text-primary">9,99€</span>
                <span className="text-muted-foreground">/mes</span>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">IVA incluido · Facturado mensualmente</div>
              <Link to="/auth" className="mt-6 w-full max-w-xs">
                <Button size="lg" className="w-full gap-2">
                  Empezar ahora <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {incluido.map((i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" /> Datos alojados en Europa, cifrados y con copia diaria.
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center text-primary-foreground">
          <Beef className="mx-auto mb-4 h-10 w-10 opacity-90" />
          <h2 className="text-3xl font-bold">Empieza hoy. En 2 minutos.</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">
            Crea tu explotación, da de alta tus animales y lleva el control real de tu ganado.
          </p>
          <Link to="/auth" className="mt-6 inline-block">
            <Button size="lg" variant="secondary" className="gap-2">
              Crear cuenta <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Bloque gestorías */}
      <section id="gestorias" className="border-t bg-background scroll-mt-20">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <div className="mb-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                Para gestorías y asesores
              </div>
              <h2 className="text-3xl font-bold tracking-tight">¿Eres gestor o asesor?</h2>
              <p className="mt-3 text-muted-foreground">
                Lleva hasta <strong>10 explotaciones</strong> desde un solo panel por <strong>25€/mes</strong>. Tus
                clientes obtienen un <strong>50% de descuento</strong> mientras tu cuenta esté activa.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                <li>· Aprueba o rechaza las solicitudes de vinculación de tus clientes.</li>
                <li>· Entra en cualquier explotación con un clic y trabaja con sus datos.</li>
                <li>· Recibe gastos, facturas y documentación ya ordenada.</li>
              </ul>
              <Link to="/auth" className="mt-6 inline-block">
                <Button size="lg" className="gap-2">
                  Soy gestoría — empezar <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            <div className="rounded-2xl border bg-gradient-soft p-6 shadow-card">
              <div className="text-sm font-semibold text-muted-foreground">Plan Gestoría</div>
              <div className="mt-1 text-4xl font-bold">
                25€<span className="text-base font-normal text-muted-foreground"> / mes</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                <li>✓ Hasta 10 explotaciones vinculadas</li>
                <li>✓ Panel unificado de todos tus clientes</li>
                <li>✓ 50% de descuento para cada cliente vinculado</li>
                <li>✓ Cancelable cuando quieras</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center text-xs text-muted-foreground sm:px-6">
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link to="/terminos" className="hover:text-foreground">
              Términos y Condiciones
            </Link>
            <Link to="/privacidad" className="hover:text-foreground">
              Política de Privacidad
            </Link>
            <Link to="/aviso-legal" className="hover:text-foreground">
              Aviso Legal
            </Link>
          </nav>
          <div>© {new Date().getFullYear()} GanaderOS · Hecho en España con ❤️</div>
        </div>
      </footer>
    </div>
  );
}
