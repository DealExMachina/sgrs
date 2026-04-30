"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@sgrs/ui";
import type { ScopeItem } from "@/lib/types";

interface Props {
  scopes: ScopeItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ScopeSelector({ scopes, activeId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = scopes.find((s) => s.id === activeId) ?? scopes[0]!;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const groups: [string, ScopeItem[]][] = [
    ["Active", scopes.filter((s) => s.state !== "archived")],
    ["Archived", scopes.filter((s) => s.state === "archived")],
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-2.5 rounded-sm border border-graphite bg-transparent px-3 py-1.5 pr-2.5 text-[13px] text-mist transition-colors duration-smooth hover:border-graphite-2"
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", stateColor(active.state))} />
        <span>{active.name}</span>
        <span className="border-l border-graphite pl-1.5 text-[11px] text-fog-2">
          {active.tag}
        </span>
        <span className="text-[10px] text-fog">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-[42px] z-[100] w-80 rounded bg-ink-soft border border-graphite p-2 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
          <input
            type="text"
            placeholder="Search scopes…"
            className="w-full rounded-sm bg-ink border border-graphite px-2.5 py-2 text-[12.5px] text-mist outline-none placeholder:text-fog focus:border-graphite-2"
          />
          {groups.map(
            ([label, items]) =>
              items.length > 0 && (
                <div key={label}>
                  <div className="px-2 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.8px] text-fog">
                    {label}
                  </div>
                  {items.map((s) => {
                    const isActive = s.id === activeId;
                    return (
                      <button
                        key={s.id}
                        onClick={() => {
                          onSelect(s.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "grid w-full grid-cols-[1fr_auto] gap-1 rounded-sm px-2 py-2 text-left transition-colors duration-smooth hover:bg-ink-raised",
                          isActive && "bg-orange/[0.06]",
                        )}
                      >
                        <div className="text-[13px] text-mist">{s.name}</div>
                        <div
                          className={cn(
                            "font-mono self-center text-[10px]",
                            stateTextColor(s.state),
                            isActive && "text-orange-soft",
                          )}
                        >
                          {stateLabel(s)}
                        </div>
                        <div className="col-span-2 text-[11px] text-fog">
                          {s.tag} · {s.cycles} cycles
                        </div>
                      </button>
                    );
                  })}
                </div>
              ),
          )}
          <button className="mt-1.5 w-full rounded-sm border border-dashed border-graphite bg-transparent py-2.5 text-[12.5px] text-fog-2 transition-all duration-smooth hover:border-graphite-2 hover:text-mist">
            + New scope
          </button>
        </div>
      )}
    </div>
  );
}

function stateColor(state: ScopeItem["state"]) {
  switch (state) {
    case "resolved":   return "bg-ok";
    case "active":     return "bg-blue";
    case "near-final": return "bg-ok";
    case "escalated":  return "bg-risk";
    default:           return "bg-fog";
  }
}

function stateTextColor(state: ScopeItem["state"]) {
  switch (state) {
    case "resolved":   return "text-ok";
    case "active":     return "text-blue";
    case "near-final": return "text-ok";
    case "escalated":  return "text-risk";
    default:           return "text-fog";
  }
}

function stateLabel(s: ScopeItem) {
  switch (s.state) {
    case "resolved":   return "resolved ✓";
    case "near-final": return `near-final ${s.score.toFixed(2)}`;
    case "escalated":  return `escalated ${s.score.toFixed(2)}`;
    case "active":     return `active ${s.score.toFixed(2)}`;
    default:           return "archived";
  }
}
