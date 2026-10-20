import { BUILT_IN_TEMPLATES } from './builtInTemplates';
import type { SessionTemplate } from './types';

interface SessionTemplatesResult {
  templates: readonly SessionTemplate[];
  /** Always false for now; there for when templates come from the server. */
  loading: boolean;
  error: string | null;
}

const BUILT_IN: SessionTemplatesResult = {
  templates: BUILT_IN_TEMPLATES,
  loading: false,
  error: null,
};

/**
 * The templates a leader can start from. The one place the page asks, so
 * fetching team or personal templates later changes this hook and nothing
 * that uses it.
 */
export function useSessionTemplates(): SessionTemplatesResult {
  return BUILT_IN;
}

/** The template with this id, if there is one: for `?template=` on the create page. */
export function findTemplate(
  templates: readonly SessionTemplate[],
  id: string | null | undefined,
): SessionTemplate | null {
  if (!id) return null;
  return templates.find((template) => template.id === id) ?? null;
}
