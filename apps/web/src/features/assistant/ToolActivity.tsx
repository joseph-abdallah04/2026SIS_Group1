// The little "the agent is doing something" chip, plus web-search sources.
//
// Tool activity is shown rather than hidden on purpose: when an answer rests on a search,
// the user should be able to see the query ran and follow the links themselves.
import type { AssistantToolName, WebSearchResult } from '@roundtable/shared';

import { TOOL_ACTIVITY_LABELS } from './assistantActivity';

export interface ToolActivityProps {
  toolName: AssistantToolName;
  status: 'running' | 'done' | 'failed';
  summary?: string;
  results?: WebSearchResult[];
}

export function ToolActivity({ toolName, status, summary, results }: ToolActivityProps) {
  const labels = TOOL_ACTIVITY_LABELS[toolName];
  const label = status === 'running' ? `${labels.running}…` : labels.done;

  return (
    <div className="space-y-1.5">
      <div className="rt-assistant-tool">
        <span
          className={`rt-assistant-dot${
            status === 'running'
              ? ' rt-assistant-dot--running'
              : status === 'failed'
                ? ' rt-assistant-dot--failed'
                : ''
          }`}
          aria-hidden="true"
        />
        <span>{status === 'failed' ? `${labels.done} — failed` : label}</span>
        {summary && status !== 'running' && (
          <span style={{ color: 'var(--rt-assistant-muted)' }}>· {summary}</span>
        )}
      </div>

      {results && results.length > 0 && (
        <ol className="space-y-1 pl-1">
          {results.map((result, index) => (
            <li key={`${result.url}-${index}`} className="text-xs leading-snug">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer noopener"
                className="rt-assistant-source"
              >
                {result.title}
              </a>
              {result.snippet && (
                <p className="rt-assistant-snippet line-clamp-2">{result.snippet}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
