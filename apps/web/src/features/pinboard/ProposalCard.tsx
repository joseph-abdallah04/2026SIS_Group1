import type { BoardItem, StickyColor } from '@roundtable/shared';

const STICKY_COLORS: Record<StickyColor, string> = {
  yellow: 'bg-yellow-200 border-yellow-400',
  pink: 'bg-pink-200 border-pink-400',
  blue: 'bg-sky-200 border-sky-400',
  green: 'bg-emerald-200 border-emerald-400',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CardMeta({ item }: { item: BoardItem }) {
  return (
    <footer className="mt-2 border-t border-black/10 pt-2 text-xs text-slate-600">
      <span className="font-medium text-slate-800">{item.authorName}</span>
      <span className="mx-1">·</span>
      <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
    </footer>
  );
}

function StickyCard({ item }: { item: BoardItem }) {
  if (item.artifactJson.type !== 'sticky') return null;
  const colorClass = STICKY_COLORS[item.artifactJson.color];

  return (
    <article
      className={`flex h-full w-56 flex-col rounded-md border p-3 shadow-md ${colorClass}`}
    >
      <p className="flex-1 whitespace-pre-wrap text-sm text-slate-900">{item.artifactJson.text}</p>
      <CardMeta item={item} />
    </article>
  );
}

function DrawingCard({ item }: { item: BoardItem }) {
  if (item.artifactJson.type !== 'drawing') return null;

  return (
    <article className="flex w-64 flex-col rounded-md border border-slate-300 bg-white p-3 shadow-md">
      <div
        className="flex min-h-24 items-center justify-center overflow-hidden rounded bg-slate-50"
        // SVG is produced by our own tools module; sanitized rendering is a later hardening pass.
        dangerouslySetInnerHTML={{ __html: item.artifactJson.svg }}
      />
      <CardMeta item={item} />
    </article>
  );
}

function DiagramCard({ item }: { item: BoardItem }) {
  if (item.artifactJson.type !== 'diagram') return null;
  const { nodes, edges } = item.artifactJson;
  const width = Math.max(...nodes.map((n) => n.x), 0) + 120;
  const height = Math.max(...nodes.map((n) => n.y), 0) + 80;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <article className="flex w-80 flex-col rounded-md border border-slate-300 bg-white p-3 shadow-md">
      <div className="overflow-hidden rounded bg-slate-50">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
          {edges.map((edge) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x + 40}
                y1={from.y + 16}
                x2={to.x}
                y2={to.y + 16}
                stroke="#94a3b8"
                strokeWidth={2}
                markerEnd="url(#arrow)"
              />
            );
          })}
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
            </marker>
          </defs>
          {nodes.map((node) => (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <rect width="80" height="32" rx="6" fill="#e2e8f0" stroke="#cbd5e1" />
              <text x="40" y="20" textAnchor="middle" className="fill-slate-700 text-[11px]">
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <CardMeta item={item} />
    </article>
  );
}

export function ProposalCard({ item }: { item: BoardItem }) {
  switch (item.type) {
    case 'sticky':
      return <StickyCard item={item} />;
    case 'drawing':
      return <DrawingCard item={item} />;
    case 'diagram':
      return <DiagramCard item={item} />;
    default:
      return null;
  }
}
