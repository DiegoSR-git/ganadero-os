import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHeader } from "@/components/PageHeader";
import FeedbackDialog from "@/components/FeedbackDialog";
import { MessageCircle, Mail, Sparkles } from "lucide-react";

const EJEMPLOS = [
  "Ha parido la 7843, ternera",
  "Pesa 340 la 1122",
  "La 55 está coja desde ayer",
  "He gastado 320 € en pienso",
  "He vendido dos terneros por 1.400 €",
  "¿Cuántas vacas tengo?",
  "¿Qué animales están en tratamiento?",
  "Recuérdame vacunar el lote de madres el lunes",
];

const FAQ = [
  {
    q: "¿Se guarda algo sin que yo lo vea?",
    a: "No. Cuando pides registrar algo, el asistente te enseña primero lo que ha entendido y hasta que no confirmas no se guarda nada.",
  },
  {
    q: "Me he equivocado al dictar, ¿qué hago?",
    a: "Antes de confirmar, dile lo que está mal con tus palabras (\"no, era macho\") y lo corrige. También puedes escribir CANCELAR y empezar de nuevo.",
  },
  {
    q: "¿Puedo usarlo desde el campo sin cobertura?",
    a: "Necesita conexión para guardar. Si falla, te avisa de que no se ha guardado nada; vuelve a intentarlo cuando tengas señal.",
  },
  {
    q: "¿Cómo activo WhatsApp?",
    a: "En Configuración, añade tu número de móvil a la explotación. A partir de ahí puedes escribir, mandar audios o fotos del crotal por WhatsApp.",
  },
  {
    q: "¿Otras explotaciones pueden ver mis datos?",
    a: "No. Cada explotación está aislada: sólo tú y las personas que invites veis vuestros animales, gastos y documentos.",
  },
  {
    q: "Ya tengo mis animales en un Excel",
    a: "En Animales, pulsa Importar y sube el fichero. Verás una vista previa con los errores antes de guardar nada.",
  },
];

export default function Ayuda() {
  const [feedback, setFeedback] = useState(false);

  return (
    <>
      <PageHeader title="Ayuda" description="Cómo sacarle partido a GanaderOS" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Cosas que puedes decirle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {EJEMPLOS.map((e) => (
              <p key={e} className="rounded-md bg-muted/50 px-3 py-2 text-sm">“{e}”</p>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">Preguntas frecuentes</CardTitle></CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                {FAQ.map((f, i) => (
                  <AccordionItem key={i} value={`f${i}`}>
                    <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-2"><CardTitle className="text-base">¿Necesitas que te echemos una mano?</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button className="w-full" onClick={() => setFeedback(true)}>
                <MessageCircle className="mr-2 h-4 w-4" /> Enviar una opinión o un problema
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="mailto:contacto@papeleofacil.com?subject=Ayuda%20GanaderOS">
                  <Mail className="mr-2 h-4 w-4" /> Escribirnos por correo
                </a>
              </Button>
              <p className="text-center text-xs text-muted-foreground">Respondemos en 24-48 horas laborables.</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <FeedbackDialog open={feedback} onOpenChange={setFeedback} />
    </>
  );
}
