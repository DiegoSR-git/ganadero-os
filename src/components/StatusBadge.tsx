import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  enviada: "bg-info/15 text-info border-info/30",
  cobrada: "bg-success/15 text-success border-success/30",
  vencida: "bg-destructive/15 text-destructive border-destructive/30",
  pendiente: "bg-warning/15 text-warning-foreground border-warning/40",
  revisado: "bg-success/15 text-success border-success/30",
  rechazado: "bg-destructive/15 text-destructive border-destructive/30",
  procesado: "bg-success/15 text-success border-success/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  activa: "bg-success/15 text-success border-success/30",
  prueba: "bg-info/15 text-info border-info/30",
  pausada: "bg-muted text-muted-foreground",
  cancelada: "bg-destructive/15 text-destructive border-destructive/30",
};

export const StatusBadge = ({ value }: { value: string }) => (
  <Badge variant="outline" className={cn("capitalize border", map[value] ?? "bg-muted")}>{value}</Badge>
);
