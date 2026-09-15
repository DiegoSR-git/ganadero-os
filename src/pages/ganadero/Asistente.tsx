import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useExplotacion } from "@/hooks/useExplotacion";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AsistenteBloques, type UiBlock } from "@/components/AsistenteBloques";
import { Camera, Loader2, Mic, Send, Sparkles, Square, Check, X, Pencil } from "lucide-react";

type Proposal = { tool: string; args: Record<string, unknown>; titulo: string; detalles: { label: string; value: string }[] };
type Msg = {
  role: "user" | "assistant";
  content: string;
  ui?: UiBlock[];
  proposal?: Proposal | null;
  resuelta?: "confirmada" | "cancelada";
};

const SUGERENCIAS = [
  "¿Qué necesita mi atención hoy?",
  "¿Cuántas vacas tengo?",
  "¿Cuánto he gastado este mes?",
  "Busca la 7843",
];

export default function Asistente() {
  const { explotacionId, explotacion } = useExplotacion();
  const { toast } = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("ganadero-ai", {
      body: { ...body, explotacion_id: explotacionId },
    });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  const enviar = async (texto: string) => {
    const t = texto.trim();
    if (!t || busy || !explotacionId) return;
    const historia = [...msgs, { role: "user" as const, content: t }];
    setMsgs(historia);
    setInput("");
    setBusy(true);
    try {
      const data = await call({
        mode: "chat",
        messages: historia.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      });
      setMsgs((prev) => [...prev, { role: "assistant", content: data.reply || "…", ui: data.ui ?? [], proposal: data.proposal ?? null }]);
    } catch (e) {
      setMsgs((prev) => [...prev, { role: "assistant", content: `No he podido responder: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const confirmar = async (idx: number, proposal: Proposal) => {
    if (busy) return;
    setBusy(true);
    try {
      // Clave estable por propuesta: si se pulsa dos veces o se reintenta, no se duplica.
      const key = (proposal as any).__key ?? `app:${explotacionId}:${idx}:${JSON.stringify(proposal.args)}`;
      const r = await call({ mode: "confirm", proposal, request_key: key });
      setMsgs((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], resuelta: "confirmada" };
        return [...next, { role: "assistant", content: r.message }];
      });
      if (!r.ok) toast({ title: "No se ha guardado", description: r.message, variant: "destructive" });
    } catch (e) {
      toast({ title: "No se ha guardado", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancelar = (idx: number) => {
    setMsgs((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], resuelta: "cancelada" };
      return [...next, { role: "assistant", content: "De acuerdo, no he registrado nada." }];
    });
  };

  // ---- Voz ----
  const toggleGrabar = async () => {
    if (grabando) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 2000) {
          toast({ title: "No he oído nada", description: "Prueba a grabar otra vez.", variant: "destructive" });
          return;
        }
        setBusy(true);
        try {
          const base64 = await blobToBase64(blob);
          const r = await call({ mode: "transcribe", audio_base64: base64, mime });
          setBusy(false);
          if (r.text?.trim()) await enviar(r.text.trim());
          else toast({ title: "No he entendido el audio", variant: "destructive" });
        } catch (e) {
          setBusy(false);
          toast({ title: "No he podido transcribir", description: (e as Error).message, variant: "destructive" });
        }
      };
      rec.start();
      recorderRef.current = rec;
      setGrabando(true);
    } catch {
      toast({ title: "No puedo usar el micrófono", description: "Da permiso al navegador para grabar.", variant: "destructive" });
    }
  };

  // ---- Foto ----
  const subirFoto = async (file: File) => {
    setBusy(true);
    setMsgs((prev) => [...prev, { role: "user", content: "📷 Foto enviada" }]);
    try {
      const base64 = await blobToBase64(file);
      const data = await call({ mode: "photo", image_base64: base64, mime: file.type || "image/jpeg" });
      setMsgs((prev) => [...prev, { role: "assistant", content: data.reply, ui: data.ui ?? [], proposal: data.proposal ?? null }]);
    } catch (e) {
      setMsgs((prev) => [...prev, { role: "assistant", content: `No he podido leer la foto: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-5 w-5 text-primary" /> Asistente GanaderOS
        </h1>
        <p className="text-sm text-muted-foreground">
          Pregúntame cualquier cosa sobre tu explotación o dime qué quieres registrar.
        </p>
      </div>

      <div className="flex-1 space-y-4 pb-40">
        {!msgs.length && (
          <Card className="shadow-card">
            <CardContent className="space-y-3 p-4">
              <div className="text-sm text-muted-foreground">
                {explotacion ? `Trabajando sobre ${explotacion.nombre}.` : "Crea primero tu explotación en Configuración."}
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGERENCIAS.map((s) => (
                  <Button key={s} variant="outline" size="sm" onClick={() => enviar(s)} disabled={!explotacionId}>
                    {s}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-primary-foreground" : "w-full"}>
              <div className="whitespace-pre-wrap text-sm">{m.content}</div>
              {m.role === "assistant" && <AsistenteBloques blocks={m.ui ?? []} />}
              {m.role === "assistant" && m.proposal && !m.resuelta && (
                <Card className="mt-3 border-primary/40 shadow-card">
                  <CardContent className="p-4">
                    <div className="text-sm font-semibold">{m.proposal.titulo}</div>
                    <dl className="mt-2 space-y-1">
                      {m.proposal.detalles.map((d) => (
                        <div key={d.label} className="flex justify-between gap-4 text-sm">
                          <dt className="text-muted-foreground">{d.label}</dt>
                          <dd className="text-right font-medium">{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => confirmar(i, m.proposal!)} disabled={busy} className="gap-1">
                        <Check className="h-4 w-4" /> Confirmar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setInput("Corrige: ")} className="gap-1">
                        <Pencil className="h-4 w-4" /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancelar(i)} className="gap-1">
                        <X className="h-4 w-4" /> Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {m.resuelta === "confirmada" && <div className="mt-2 text-xs text-primary">Confirmado</div>}
              {m.resuelta === "cancelada" && <div className="mt-2 text-xs text-muted-foreground">Cancelado</div>}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Pensando…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 md:left-64">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(input);
              }
            }}
            placeholder="Escribe aquí…"
            rows={1}
            className="max-h-32 min-h-[44px] resize-none"
            disabled={!explotacionId}
          />
          <Button variant={grabando ? "destructive" : "outline"} size="icon" onClick={toggleGrabar} disabled={!explotacionId || busy} title="Hablar">
            {grabando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} disabled={!explotacionId || busy} title="Foto">
            <Camera className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={() => enviar(input)} disabled={!input.trim() || busy || !explotacionId} title="Enviar">
            <Send className="h-4 w-4" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) subirFoto(f);
            }}
          />
        </div>
        {grabando && <div className="mt-2 text-center text-xs text-destructive">Grabando… pulsa el cuadrado para parar.</div>}
      </div>
    </div>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
