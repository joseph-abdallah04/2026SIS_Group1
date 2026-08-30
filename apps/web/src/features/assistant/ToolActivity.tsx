// The little "the agent is doing something" chip, plus web-search sources.
//
// Tool activity is shown rather than hidden on purpose: when an answer rests on a search,
// the user should be able to see the query ran and follow the links themselves.
import type { AssistantToolName, WebSearchResult } from '@roundtable/shared';

const TOOL_LABELS: Record<AssistantToolName, { running: string; done: string }> = {
  web_search: { running: 'Searching the web…', done: 'Searched the web' },
  create_diagram: { running: 'Drawing a diagram…', done: 'Drew a diagram' },
  sticky_ideation: { running: 'Generating sticky notes…', done: 'Generated sticky notes' },
};

export interface ToolActivityProps {
  toolName: AssistantToolName;
  status: 'running' | 'done' | 'failed';
  summary?: string;
  results?: WebSearchResult[];
}

export function ToolActivity({ toolName, status, summary, results }: ToolActivityProps) {
  const labels = TOOL_LABELS[toolName];
  const label = status === 'running' ? labels.running : labels.done;

  return (
    <div className="space-y-1.5">
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
        {status === 'running' ? (
          <span className="size-2 animate-pulse rounded-full bg-indigo-500" aria-hidden="true" />
        ) : status === 'failed' ? (
          <span className="size-2 rounded-full bg-red-500" aria-hidden="true" />
        ) : (
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
        )}
        <span>{status === 'failed' ? `${labels.done} — failed` : label}</span>
        {summary && status !== 'running' && <span className="text-slate-400">· {summary}</span>}
      </div>

      {results && results.length > 0 && (
        <ol className="space-y-1 pl-1">
          {results.map((result, index) => (
            <li key={`${result.url}-${index}`} className="text-xs leading-snug">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-indigo-600 hover:underline"
              >
                {result.title}
              </a>
              {result.snippet && <p className="line-clamp-2 text-slate-500">{result.snippet}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
