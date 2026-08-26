"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@sgrs/ui";
import type { Mode, ScopeItem } from "@/lib/types";
import { useOrgId, useProjectId } from "@/lib/hooks/useTenantId";
import { useScopes } from "@/lib/hooks/useScopes";
import { useFinality } from "@/lib/hooks/useFinality";
import { useEventStream } from "@/lib/hooks/useEventStream";
import { useDomainData } from "@/lib/hooks/useDomainData";
import type { SgrsEvent } from "@sgrs/client-ts";
import { ScopeSelector } from "./ScopeSelector";
import { ProjectSelector } from "./ProjectSelector";
import { ModeSwitcher } from "./ModeSwitcher";
import { BusinessMode } from "./modes/BusinessMode";
import { ConfigureMode } from "./modes/ConfigureMode";
import { UserMenu } from "./UserMenu";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal shape we need from a veto event to render the banner. */
interface VetoInfo {
  scopeId: string;
  reason?: string;
  timestamp: string;
  activatedBy: string;
}

/** Maximum number of SSE events retained in the activity feed buffer. */
const MAX_ACTIVITY = 20;

// ─── Shell ────────────────────────────────────────────────────────────────────

export function Shell() {
  const orgId = useOrgId();
  const { projectId, projects, setProjectId } = useProjectId(orgId);
  const [mode, setMode] = useState<Mode>("business");
  const [scopeId, setScopeId] = useState<string | null>(null);
  const [vetoAlert, setVetoAlert] = useState<VetoInfo | null>(null);
  // Circular activity buffer — last MAX_ACTIVITY SSE events for the BusinessMode feed
  const [activityEvents, setActivityEvents] = useState<SgrsEvent[]>([]);

  // ── Data hooks ─────────────────────────────────────────────────────────────

  const { scopes, isLoading, applyEvent: applyScopeEvent } = useScopes(orgId, projectId);

  // Lifted from DebugMode so the SSE layer can push finality events here.
  // Polls every 30 s as a background resync; SSE provides instant updates.
  const {
    status: finalityStatus,
    isLoading: finalityLoading,
    applyEvent: applyFinalityEvent,
  } = useFinality(scopeId, orgId, 30_000, projectId);

  const domain = useDomainData(scopeId, orgId, projectId);

  // ── SSE connection — single stream per tab ─────────────────────────────────

  // Stable callback — prepends the event and caps the buffer at MAX_ACTIVITY.
  // No deps because MAX_ACTIVITY is a module-level constant.
  const pushActivity = useCallback((event: SgrsEvent) => {
    setActivityEvents((prev) => [event, ...prev].slice(0, MAX_ACTIVITY));
  }, []);

  const { connected: streamConnected } = useEventStream(orgId, {
    onScopeEvent: applyScopeEvent,
    onFinalityEvent: applyFinalityEvent,
    onClaimEvent: domain.applyClaimEvent,
    onDriftEvent: domain.applyDriftEvent,
    onContradictionEvent: domain.applyContradictionEvent,
    onRiskEvent: domain.applyRiskEvent,
    onDocumentEvent: domain.applyDocumentEvent,
    onEpochEvent: domain.applyEpochEvent,
    onAnyEvent: pushActivity,

    onVetoEvent: (event: SgrsEvent) => {
      if (event.type === "scope.veto.activated") {
        // Extract the veto info without importing the full event type at runtime
        const e = event as {
          type: "scope.veto.activated";
          scopeId: string;
          reason?: string;
          timestamp: string;
          activatedBy: string;
        };
        setVetoAlert({
          scopeId:     e.scopeId,
          reason:      e.reason,
          timestamp:   e.timestamp,
          activatedBy: e.activatedBy,
        });
      } else if (event.type === "scope.veto.lifted") {
        setVetoAlert(null);
      }
    },
  });

  // ── Auto-select first scope once data arrives ──────────────────────────────

  useEffect(() => {
    if (scopeId === null && scopes.length > 0) {
      setScopeId(scopes[0]!.id);
    }
  }, [scopes, scopeId]);

  const scope: ScopeItem | null =
    scopes.find((s) => s.id === scopeId) ?? scopes[0] ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "relative z-[2] grid h-screen",
        vetoAlert
          ? "grid-rows-[52px_auto_1fr]"
          : "grid-rows-[52px_1fr]",
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="grid grid-cols-[auto_auto_auto_1fr_auto] items-center gap-4 border-b border-graphite px-5">
        <div className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[0.1px]">
          <div className="h-5 w-5 rounded-[5px] bg-gradient-to-br from-orange to-amber" />
          SGRS Studio
        </div>

        <ProjectSelector
          projects={projects}
          activeId={projectId}
          onSelect={setProjectId}
        />

        {scope !== null && scopeId !== null ? (
          <ScopeSelector
            scopes={scopes}
            activeId={scopeId}
            onSelect={setScopeId}
          />
        ) : (
          <div className="text-[12.5px] text-fog">
            {isLoading ? "Loading scopes…" : "No scopes"}
          </div>
        )}

        <ModeSwitcher value={mode} onChange={setMode} />

        <div className="flex items-center gap-3">
          {/* SSE connection indicator */}
          <div
            title={streamConnected ? "Live updates active" : "Live updates offline"}
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors duration-500",
              streamConnected ? "bg-ok" : "bg-fog",
            )}
          />
          <UserMenu tenantId={orgId} />
        </div>
      </header>

      {/* ── Veto banner ─────────────────────────────────────────────────────── */}
      {vetoAlert && (
        <VetoBanner veto={vetoAlert} onDismiss={() => setVetoAlert(null)} />
      )}

      {/* ── Mode content ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {scope !== null && mode === "business" && (
          <BusinessMode
            scope={scope}
            finalityStatus={finalityStatus}
            finalityLoading={finalityLoading}
            activityEvents={activityEvents}
            domain={domain}
          />
        )}
        {scope !== null && mode === "configure" && (
          <ConfigureMode scope={scope} />
        )}
        {scope === null && (
          <div className="flex h-full items-center justify-center text-[13px] text-fog">
            {isLoading ? "Loading…" : "No scope selected"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VetoBanner ───────────────────────────────────────────────────────────────

function VetoBanner({
  veto,
  onDismiss,
}: {
  veto: VetoInfo;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center gap-3 border-b border-risk/40 bg-risk/[0.07] px-5 py-2.5 text-[12.5px]"
    >
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-risk opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-risk" />
      </span>

      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.9px] text-risk">
        Veto Active
      </span>

      <span className="text-mist">
        Scope{" "}
        <span className="font-mono text-risk">{veto.scopeId}</span>
        {veto.reason && (
          <span className="text-fog"> — {veto.reason}</span>
        )}
      </span>

      <span className="ml-auto font-mono text-[10.5px] text-fog">
        {new Date(veto.timestamp).toLocaleTimeString()} · by {veto.activatedBy}
      </span>

      <button
        onClick={onDismiss}
        aria-label="Dismiss veto alert"
        className="ml-3 text-fog-2 transition-colors duration-smooth hover:text-mist"
      >
        ✕
      </button>
    </div>
  );
}
