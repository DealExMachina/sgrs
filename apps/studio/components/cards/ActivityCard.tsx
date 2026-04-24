import { Card, CardTitle } from "./Card";

const events = [
  {
    t: "14:22",
    head: "Finality cert issued · round 13",
    em: "Ed25519 signed",
  },
  {
    t: "14:18",
    head: "Contradiction detected:",
    em: "ARR €50M ↔ €38M",
  },
  {
    t: "14:11",
    head: "Document ingested:",
    em: "Legal Review (doc-5)",
  },
  {
    t: "13:54",
    head: "Agent",
    em: "propagation",
    tail: "escalated to LLM · plateau",
  },
];

export function ActivityCard() {
  return (
    <Card>
      <CardTitle>Recent activity</CardTitle>
      <div className="flex flex-col gap-3">
        {events.map((e, i) => (
          <div
            key={i}
            className="grid grid-cols-[62px_1fr] gap-2.5 text-[12px] text-fog"
          >
            <span className="font-mono text-[11px]">{e.t}</span>
            <span className="leading-[1.45] text-mist">
              {e.head}{" "}
              <span className="text-fog not-italic">{e.em}</span>
              {e.tail && ` ${e.tail}`}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
