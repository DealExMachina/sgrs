"use client";

import { Graph } from "../Graph";
import { horizonScenario } from "@/lib/mock-data";
import type { ScopeSummary } from "@/lib/mock-data";
import { cn } from "@sgrs/ui";

export function DebugMode({ scope: _scope }: { scope: ScopeSummary }) {
  return (
    <div className="grid h-full grid-cols-[1fr_340px] grid-rows-[1fr_220px] gap-3 p-3">
      <Graph data={horizonScenario} className="col-start-1 row-start-1" />

      <div className="col-start-2 row-span-2 flex min-h-0 flex-col gap-3 overflow-y-auto">
        <DbgCard title="Convergence · V(t)">
          <Kv k="score" v="0.78" />
          <Kv k="rate α" v="−0.11" trend />
          <Kv k="monotonicity" v="2 / 3" />
          <Kv k="plateau EMA" v="0.04" />
          <svg
            viewBox="0 0 240 42"
            preserveAspectRatio="none"
            className="mt-1.5 h-[42px] w-full"
          >
            <polyline
              points="0,38 20,36 40,33 60,32 80,28 100,26 120,23 140,20 160,18 180,15 200,13 220,11 240,10"
              fill="none"
              stroke="var(--dxm-blue)"
              strokeWidth={1.4}
            />
          </svg>
        </DbgCard>

        <DbgCard title="Per-dimension finality">
          <DimBar label="claim_confidence" v={0.88} tone="ok" />
          <DimBar label="contradiction_resolution" v={0.62} tone="risk" veto />
          <DimBar label="goal_completion" v={0.79} />
          <DimBar label="risk_score_inverse" v={0.71} tone="warn" />
        </DbgCard>

        <DbgCard title="Governance trace · last 5">
          <TraceStep tier="T1" desc="ContextIngested → FactsExtracted" ms="0.8 ms" />
          <TraceStep tier="T1" desc="FactsExtracted → DriftChecked" ms="1.2 ms" />
          <TraceStep tier="T2" desc="DriftChecked escalated · plateau" ms="421 ms" />
          <TraceStep tier="T3" desc="LLM governance · approve w/ cond." ms="1.8 s" />
          <TraceStep tier="T1" desc="DeltasExtracted → ContextIngested" ms="0.6 ms" />
        </DbgCard>

        <DbgCard title="Kernel">
          <Kv k="sgrs-core" v="v0.8.4" />
          <Kv k="policy sha" v="9f2c…a418" />
          <Kv k="pg p95" v="42 ms" />
          <Kv k="NATS" v="14 msg/s" />
          <Kv k="events" v="1,203" />
        </DbgCard>
      </div>

      <div className="col-start-1 row-start-2 overflow-y-auto rounded border border-graphite bg-ink-soft px-4 py-3 font-mono text-[11.5px] text-fog">
        {EVENTS.map((e, i) => (
          <div key={i} className="grid grid-cols-[68px_80px_1fr] gap-2.5 py-0.5">
            <span>{e.t}</span>
            <span className={channelColor(e.ch)}>{e.ch}</span>
            <span className="text-mist">{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DbgCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-graphite bg-ink-soft px-4 py-3">
      <h4 className="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.9px] text-fog">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Kv({ k, v, trend }: { k: string; v: string; trend?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] py-0.5 text-[12px] text-fog">
      <span>{k}</span>
      <b
        className={cn(
          "font-mono font-medium text-mist",
          trend && "text-ok",
        )}
      >
        {v}
      </b>
    </div>
  );
}

function DimBar({
  label,
  v,
  tone,
  veto,
}: {
  label: string;
  v: number;
  tone?: "ok" | "warn" | "risk";
  veto?: boolean;
}) {
  const fillColor =
    tone === "ok"
      ? "bg-ok"
      : tone === "warn"
        ? "bg-amber"
        : tone === "risk"
          ? "bg-risk"
          : "bg-blue";
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 flex justify-between text-[11.5px] text-fog">
        <span>
          {label}
          {veto && (
            <span className="ml-1 font-mono text-[9.5px] tracking-[0.6px] text-risk">
              VETO
            </span>
          )}
        </span>
        <b className="font-mono font-medium text-mist">{v.toFixed(2)}</b>
      </div>
      <div className="h-[3px] overflow-hidden rounded-[2px] bg-graphite">
        <div className={cn("h-full", fillColor)} style={{ width: `${v * 100}%` }} />
      </div>
    </div>
  );
}

function TraceStep({
  tier,
  desc,
  ms,
}: {
  tier: "T1" | "T2" | "T3";
  desc: string;
  ms: string;
}) {
  const c =
    tier === "T1"
      ? "bg-ok/[0.12] text-ok"
      : tier === "T2"
        ? "bg-blue/[0.12] text-blue"
        : "bg-amber/[0.12] text-amber";
  return (
    <div className="grid grid-cols-[48px_1fr_auto] items-center gap-2.5 py-1 text-[11.5px] text-fog">
      <span className={cn("rounded-[4px] px-1.5 py-0.5 text-center font-mono text-[10px]", c)}>
        {tier}
      </span>
      <span className="text-mist">{desc}</span>
      <span className="font-mono text-[10.5px] text-fog">{ms}</span>
    </div>
  );
}

const EVENTS = [
  { t: "14:22:07", ch: "finality", msg: "certificate issued · round 13 · scope=deal-horizon · score=0.78" },
  { t: "14:22:06", ch: "gov.t3", msg: "proposal #942 approved with conditions · drift_low" },
  { t: "14:22:04", ch: "gov.t2", msg: "escalation · plateau_ema=0.04 · reason=unresolved_veto" },
  { t: "14:22:03", ch: "drift", msg: "medium drift on claim.ARR · |Δconf|=0.31" },
  { t: "14:22:02", ch: "contradiction", msg: "x-arr · c-arr-50 ↔ c-arr-38 · valid_time overlap" },
  { t: "14:22:01", ch: "facts", msg: "extracted 4 claims, 1 risk from doc-5 · Legal Review" },
  { t: "14:21:58", ch: "propagation", msg: "sheaf stable · depth=3 · coverage=0.82 · ISS gain=0.71" },
];

function channelColor(ch: string) {
  if (ch === "finality") return "text-ok";
  if (ch === "drift") return "text-amber";
  if (ch === "contradiction") return "text-risk";
  return "text-blue";
}
