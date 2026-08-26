"use client";

import { cn } from "@sgrs/ui";
import type { Mode } from "@/lib/types";

const MODES: { id: Mode; label: string }[] = [
  { id: "business", label: "Business" },
  { id: "configure", label: "Configure" },
];

export function ModeSwitcher({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div className="justify-self-center inline-flex rounded-sm border border-graphite bg-ink-soft p-[3px]">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            "rounded-[6px] border-0 bg-transparent px-3.5 py-[5px] text-[12.5px] font-medium transition-all duration-smooth",
            value === m.id
              ? "bg-ink-raised text-mist shadow-[inset_0_0_0_1px_var(--dxm-graphite-2)]"
              : "text-fog-2 hover:text-mist",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
