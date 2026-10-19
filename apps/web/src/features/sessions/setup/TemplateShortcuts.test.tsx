import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { TemplateShortcuts } from './TemplateShortcuts';

describe('TemplateShortcuts', () => {
  it('links each template but Blank to a new session filled in from it', () => {
    render(
      <MemoryRouter>
        <TemplateShortcuts />
      </MemoryRouter>,
    );

    const nav = within(screen.getByRole('navigation', { name: 'Start from a template' }));
    expect(nav.getByRole('link', { name: 'Sprint planning' })).toHaveAttribute(
      'href',
      '/sessions/new?template=sprint-planning',
    );
    expect(nav.getByRole('link', { name: 'Retrospective' })).toHaveAttribute(
      'href',
      '/sessions/new?template=retrospective',
    );
    expect(nav.getByRole('link', { name: 'Brainstorming' })).toHaveAttribute(
      'href',
      '/sessions/new?template=brainstorming',
    );
    expect(nav.queryByRole('link', { name: 'Blank' })).not.toBeInTheDocument();
  });
});
