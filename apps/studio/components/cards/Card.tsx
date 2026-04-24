import { cn } from "@sgrs/ui";
import type { ReactNode } from "react";

export function Card({
  children,
  className,
  tight,
}: {
  children: ReactNode;
  className?: string;
  tight?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded border border-graphite bg-ink-soft",
        tight ? "px-4 py-3.5" : "p-[18px]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3.5 text-[11px] font-medium uppercase tracking-[0.9px] text-fog",
        className,
      )}
    >
      {children}
    </div>
  );
}
