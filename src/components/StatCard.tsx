import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function StatCard({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="num mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
