import { describe, expect, it } from 'vitest';
import { createSessionSchema } from '@roundtable/shared/schemas';

import { BLANK_TEMPLATE_ID, BUILT_IN_TEMPLATES, findTemplate } from '.';

describe('built-in session templates', () => {
  it('has Blank, Sprint planning, Retrospective and Brainstorming, Blank first', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => t.name)).toEqual([
      'Blank',
      'Sprint planning',
      'Retrospective',
      'Brainstorming',
    ]);
    expect(BUILT_IN_TEMPLATES[0]?.id).toBe(BLANK_TEMPLATE_ID);
  });

  it('gives each a unique id that can go in a URL', () => {
    const ids = BUILT_IN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  // A template fills the form in; what it fills in must be a session the
  // server would take, or picking one would lead to an error on Create.
  it.each(BUILT_IN_TEMPLATES.filter((t) => t.id !== BLANK_TEMPLATE_ID))(
    '$name makes a valid session',
    (template) => {
      const parsed = createSessionSchema.safeParse({
        title: template.title,
        questions: template.questions,
        discussionTimerSeconds: template.discussionTimerSeconds,
        votingTimerSeconds: template.votingTimerSeconds,
        voiceEnabled: template.voiceEnabled,
      });
      expect(parsed.success).toBe(true);
      expect(template.version).toBeGreaterThanOrEqual(1);
      expect(template.source).toBe('built-in');
    },
  );

  it('leaves Blank empty, with no call and no timers', () => {
    const blank = findTemplate(BUILT_IN_TEMPLATES, BLANK_TEMPLATE_ID);
    expect(blank).toMatchObject({
      title: '',
      questions: [],
      discussionTimerSeconds: null,
      votingTimerSeconds: null,
      voiceEnabled: false,
    });
  });

  it('finds a template by id, and nothing for an unknown or missing one', () => {
    expect(findTemplate(BUILT_IN_TEMPLATES, 'retrospective')?.name).toBe('Retrospective');
    expect(findTemplate(BUILT_IN_TEMPLATES, 'nope')).toBeNull();
    expect(findTemplate(BUILT_IN_TEMPLATES, null)).toBeNull();
  });
});
