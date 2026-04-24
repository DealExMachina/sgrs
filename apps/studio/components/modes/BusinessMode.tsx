"use client";

import { Graph } from "../Graph";
import { AttentionCard } from "../cards/AttentionCard";
import { ProgressCard } from "../cards/ProgressCard";
import { ActivityCard } from "../cards/ActivityCard";
import { horizonScenario } from "@/lib/mock-data";
import type { ScopeSummary } from "@/lib/mock-data";

export function BusinessMode({ scope }: { scope: ScopeSummary }) {
  return (
    <div className="grid h-full grid-cols-[1fr_320px] gap-4 p-4">
      <Graph data={horizonScenario} />
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <AttentionCard />
        <ProgressCard score={scope.score} />
        <ActivityCard />
      </aside>
    </div>
  );
}
