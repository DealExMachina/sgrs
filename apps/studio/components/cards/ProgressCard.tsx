import { Card, CardTitle } from "./Card";

export function ProgressCard({ score = 0.78 }: { score?: number }) {
  const c = 2 * Math.PI * 33;
  const offset = c * (1 - score);
  return (
    <Card tight>
      <CardTitle>Progress</CardTitle>
      <div className="grid grid-cols-[72px_1fr] items-center gap-4">
        <div className="relative h-[72px] w-[72px]">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3e6b93" />
                <stop offset="100%" stopColor="#6aa6d6" />
              </linearGradient>
            </defs>
            <circle cx="40" cy="40" r="33" fill="none" stroke="var(--dxm-graphite)" strokeWidth={5} />
            <circle
              cx="40"
              cy="40"
              r="33"
              fill="none"
              stroke="url(#ringGrad)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center">
            <div className="font-mono text-[17px] leading-none text-mist">
              {score.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="text-[12px]">
          <div className="mb-1 text-[12.5px] text-amber">near-finality</div>
          <Row label="trend">
            <b className="font-mono font-medium text-ok">↑ 3 cycles</b>
          </Row>
          <Row label="ETA to 0.92">
            <b className="font-mono font-medium text-mist">~3 cycles</b>
          </Row>
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between py-0.5 text-[11.5px] text-fog">
      <span>{label}</span>
      {children}
    </div>
  );
}
