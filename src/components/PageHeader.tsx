import { ReactNode } from "react";

export const PageHeader = ({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) => (
  <div className="mb-4 flex flex-col gap-3 md:mb-6 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0">
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
  </div>
);
