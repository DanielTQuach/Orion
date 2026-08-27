import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex min-h-0 flex-col rounded-sm", className)}>
      <header className="flex shrink-0 items-center justify-between border-b border-border/70 px-3 py-2">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">{title}</h2>
        {meta ? <div className="font-mono text-[10px] text-muted-foreground">{meta}</div> : null}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-auto p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "cyan",
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "cyan" | "amber" | "red" | "plain";
  sub?: string;
}) {
  const toneClass =
    tone === "amber"
      ? "text-hud-amber"
      : tone === "red"
        ? "text-hud-red"
        : tone === "plain"
          ? "text-foreground"
          : "text-hud-cyan";
  return (
    <div className="panel rounded-sm px-3 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-2xl leading-none tabular-nums", toneClass)}>
        {value}
        {unit ? <span className="ml-1 text-[11px] text-muted-foreground">{unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 font-mono text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function Bar({ value, max, tone }: { value: number; max: number; tone: "cyan" | "amber" | "red" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const bg = tone === "amber" ? "bg-hud-amber" : tone === "red" ? "bg-hud-red" : "bg-hud-cyan";
  return (
    <div className="h-1.5 w-full bg-muted">
      <div className={cn("h-full", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}
