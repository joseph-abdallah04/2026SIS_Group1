import { Link } from 'react-router-dom';

import { BLANK_TEMPLATE_ID, useSessionTemplates } from '../templates';
import { TemplateIcon } from './TemplateCards';

/**
 * The dashboard's way into a template: one click on its name opens a new
 * session already filled in from it (`/sessions/new?template=<id>`). Blank is
 * what "+ Create session" already is, so it is not repeated here.
 */
export function TemplateShortcuts() {
  const { templates } = useSessionTemplates();
  const shown = templates.filter((template) => template.id !== BLANK_TEMPLATE_ID);
  if (shown.length === 0) return null;
  return (
    <nav
      aria-label="Start from a template"
      className="flex flex-wrap items-center gap-1.5 sm:justify-end"
    >
      <span className="mr-0.5 text-[12px] text-rt-ink-faint">Or start from</span>
      {shown.map((template) => (
        <Link
          key={template.id}
          to={`/sessions/new?template=${encodeURIComponent(template.id)}`}
          className="inline-flex h-8 items-center gap-2 rounded-full border border-[#e3d9c6] bg-white pr-3 pl-1 text-[12.5px] font-semibold text-rt-ink transition-colors hover:border-rt-secondary hover:bg-rt-secondary-wash focus-visible:ring-2 focus-visible:ring-rt-secondary focus-visible:outline-none"
        >
          <TemplateIcon template={template} size={13} className="size-6 rounded-full" />
          {template.name}
        </Link>
      ))}
    </nav>
  );
}
