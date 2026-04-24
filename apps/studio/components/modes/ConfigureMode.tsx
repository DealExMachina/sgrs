"use client";

import { useState } from "react";
import { cn } from "@sgrs/ui";
import type { ScopeSummary } from "@/lib/mock-data";

const NAV = [
  { id: "governance", label: "Governance", n: "v3.2.1" },
  { id: "finality", label: "Finality", n: "4 dim" },
  { id: "agents", label: "Agents", n: "9" },
  { id: "models", label: "Models", n: "2" },
  { id: "scopes", label: "Scopes", n: "4" },
  { id: "access", label: "Access", n: "OpenFGA" },
] as const;

type NavId = (typeof NAV)[number]["id"];

export function ConfigureMode({ scope: _scope }: { scope: ScopeSummary }) {
  const [active, setActive] = useState<NavId>("governance");
  return (
    <div className="grid h-full grid-cols-[220px_1fr] gap-4 p-4">
      <nav className="flex h-fit flex-col gap-0.5 rounded border border-graphite bg-ink-soft p-2.5">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => setActive(item.id)}
            className={cn(
              "flex items-center justify-between rounded-sm px-3 py-2.5 text-left text-[13px] transition-all duration-smooth",
              active === item.id
                ? "bg-ink-raised text-mist shadow-[inset_2px_0_0_var(--dxm-orange)]"
                : "text-fog-2 hover:bg-ink-raised hover:text-mist",
            )}
          >
            <span>{item.label}</span>
            <span className="font-mono text-[11px] text-fog">{item.n}</span>
          </button>
        ))}
      </nav>

      <div className="overflow-y-auto rounded border border-graphite bg-ink-soft px-6 py-5">
        {active === "governance" && <Governance />}
        {active !== "governance" && <Placeholder id={active} />}
      </div>
    </div>
  );
}

function Governance() {
  return (
    <>
      <h2 className="mb-1 text-[16px] font-semibold text-mist">Governance</h2>
      <p className="mb-5 max-w-[580px] text-[13px] leading-[1.55] text-fog">
        How the kernel handles proposed state transitions. The Rust kernel
        always validates first; Tier 2 and Tier 3 are invoked based on mode and
        circuit-breaker state.
      </p>

      <Field
        label="Approval mode"
        hint="MITL queues human review on escalation"
      >
        <Segmented options={["YOLO", "MITL", "MASTER"]} active="MITL" />
      </Field>

      <Field label="Drift block threshold" hint="High drift blocks transitions">
        <div className="w-[420px] max-w-full">
          <div className="relative h-1 rounded-[2px] bg-graphite">
            <div
              className="absolute inset-y-0 left-0 rounded-[2px] bg-blue"
              style={{ width: "62%" }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mist shadow-[0_0_0_3px_var(--dxm-ink-soft)]"
              style={{ left: "62%" }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-fog">
            <span>0.0</span>
            <span className="text-mist">0.62</span>
            <span>1.0</span>
          </div>
        </div>
      </Field>

      <Field
        label="Circuit breaker"
        hint="3 failures · 60s cooldown · fallback Tier 1"
      >
        <Segmented options={["Enabled", "Disabled"]} active="Enabled" />
      </Field>
    </>
  );
}

function Placeholder({ id }: { id: string }) {
  return (
    <>
      <h2 className="mb-1 text-[16px] font-semibold capitalize text-mist">
        {id}
      </h2>
      <p className="text-[13px] text-fog">
        Settings for <span className="text-mist">{id}</span> will land in the
        next iteration.
      </p>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
        <span className="text-mist">{label}</span>
        <span className="text-[11.5px] text-fog">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Segmented({
  options,
  active,
}: {
  options: string[];
  active: string;
}) {
  return (
    <div className="inline-flex rounded-sm border border-graphite bg-ink p-[3px]">
      {options.map((o) => (
        <button
          key={o}
          className={cn(
            "rounded-[6px] border-0 bg-transparent px-3.5 py-1.5 text-[12.5px] transition-all duration-smooth",
            o === active
              ? "bg-ink-raised text-mist shadow-[inset_0_0_0_1px_var(--dxm-graphite-2)]"
              : "text-fog-2",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
