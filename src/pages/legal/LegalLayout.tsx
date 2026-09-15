import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Shield, Scale } from "lucide-react";

interface LegalLayoutProps {
  title: string;
  updatedAt?: string;
  children: ReactNode;
}

export default function LegalLayout({ title, updatedAt, children }: LegalLayoutProps) {
  const docs = [
    { to: "/terminos", label: "Términos y Condiciones", icon: FileText },
    { to: "/privacidad", label: "Política de Privacidad", icon: Shield },
    { to: "/aviso-legal", label: "Aviso Legal", icon: Scale },
  ];
  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
          <div className="text-xs font-semibold tracking-wide text-muted-foreground">GanaderOS</div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-card sm:p-10">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Scale className="h-3.5 w-3.5 text-primary" />
              Información legal
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
            {updatedAt && (
              <p className="mt-3 text-sm text-muted-foreground">
                Última actualización · <span className="font-medium text-foreground">{updatedAt}</span>
              </p>
            )}
          </div>
        </div>

        {/* Content card */}
        <article
          className="
            mt-8 rounded-2xl border bg-card p-6 shadow-card sm:p-10
            prose prose-slate max-w-none text-foreground
            prose-headings:scroll-mt-24 prose-headings:text-foreground prose-headings:font-semibold
            prose-h2:relative prose-h2:mt-10 prose-h2:mb-4 prose-h2:pl-4 prose-h2:text-2xl
            prose-h2:before:absolute prose-h2:before:left-0 prose-h2:before:top-1.5 prose-h2:before:h-6 prose-h2:before:w-1 prose-h2:before:rounded-full prose-h2:before:bg-primary
            prose-h3:mt-6 prose-h3:text-lg
            prose-p:leading-relaxed prose-p:text-muted-foreground
            prose-strong:text-foreground prose-strong:font-semibold
            prose-li:my-1 prose-li:text-muted-foreground prose-li:marker:text-primary
            prose-ul:my-4 prose-ul:pl-5
            prose-a:font-medium prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-hr:my-8
          "
        >
          {children}
        </article>

        {/* Document nav */}
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {docs.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all hover:border-primary hover:shadow-card"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium">{label}</span>
            </Link>
          ))}
        </div>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} GanaderOS · Hecho en España con ❤️
      </footer>
    </div>
  );
}