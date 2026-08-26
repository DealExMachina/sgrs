"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@sgrs/ui";

interface ProjectItem {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  projects: ProjectItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ProjectSelector({ projects, activeId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const active = projects.find((p) => p.id === activeId) ?? projects[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  if (!active || projects.length <= 1) {
    return active ? (
      <span className="text-[12px] text-fog">{active.name}</span>
    ) : null;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-2 rounded-sm border border-graphite px-2.5 py-1 text-[12px] text-mist hover:border-graphite-2"
      >
        {active.name}
        <span className="text-fog">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-sm border border-graphite bg-ink py-1 shadow-lg">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p.id);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-[12px] hover:bg-graphite/40",
                p.id === activeId ? "text-white" : "text-mist",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
