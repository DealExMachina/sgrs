"use client";

import { useState } from "react";
import type { Mode } from "@/lib/types";
import { scopes } from "@/lib/mock-data";
import { ScopeSelector } from "./ScopeSelector";
import { ModeSwitcher } from "./ModeSwitcher";
import { BusinessMode } from "./modes/BusinessMode";
import { ConfigureMode } from "./modes/ConfigureMode";
import { DebugMode } from "./modes/DebugMode";

export function Shell() {
  const [mode, setMode] = useState<Mode>("business");
  const [scopeId, setScopeId] = useState(scopes[0]!.id);
  const scope = scopes.find((s) => s.id === scopeId)!;

  return (
    <div className="relative z-[2] grid h-screen grid-rows-[52px_1fr]">
      <header className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-5 border-b border-graphite px-5">
        <div className="flex items-center gap-2.5 text-[14px] font-semibold tracking-[0.1px]">
          <div className="h-5 w-5 rounded-[5px] bg-gradient-to-br from-orange to-amber" />
          SGRS Studio
        </div>

        <ScopeSelector
          scopes={scopes}
          activeId={scopeId}
          onSelect={setScopeId}
        />

        <ModeSwitcher value={mode} onChange={setMode} />

        <div className="flex items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-blue-deep to-blue text-[11px] font-semibold text-ink">
            JB
          </div>
        </div>
      </header>

      <div className="relative overflow-hidden">
        {mode === "business" && <BusinessMode scope={scope} />}
        {mode === "configure" && <ConfigureMode scope={scope} />}
        {mode === "debug" && <DebugMode scope={scope} />}
      </div>
    </div>
  );
}
