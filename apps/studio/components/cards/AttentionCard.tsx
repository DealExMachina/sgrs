import { Card, CardTitle } from "./Card";

export function AttentionCard() {
  return (
    <Card className="relative overflow-hidden border-amber/25 bg-gradient-to-br from-amber/[0.04] to-transparent">
      <CardTitle className="flex items-center gap-2 text-amber">
        <span className="dxm-pulse h-1.5 w-1.5 rounded-full bg-amber" />
        Needs attention
      </CardTitle>
      <p className="mb-3 text-[13px] leading-[1.55] text-mist">
        Near-finality reached but{" "}
        <span className="text-risk">contradiction_resolution</span> is below
        veto threshold. Two ARR claims remain unreconciled.
      </p>
      <div className="flex gap-1.5">
        <button className="rounded-[7px] border border-orange bg-orange px-3.5 py-1.5 text-[12.5px] font-medium text-[#1a0d00] transition-colors duration-smooth hover:bg-orange-soft">
          Review
        </button>
        <button className="rounded-[7px] border border-transparent bg-transparent px-3.5 py-1.5 text-[12.5px] text-fog-2 transition-colors duration-smooth hover:border-graphite-2">
          Defer
        </button>
      </div>
    </Card>
  );
}
