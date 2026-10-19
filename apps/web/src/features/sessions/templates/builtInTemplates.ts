import type { SessionTemplate } from './types';

/** The id of the template that fills in nothing. */
export const BLANK_TEMPLATE_ID = 'blank';

/**
 * The templates every leader can start from. Blank first, since it is the
 * form as it would be without any.
 */
export const BUILT_IN_TEMPLATES: readonly SessionTemplate[] = [
  {
    id: BLANK_TEMPLATE_ID,
    version: 1,
    source: 'built-in',
    name: 'Blank',
    summary: 'Start from nothing and build your own agenda.',
    icon: 'blank',
    tone: 'neutral',
    title: '',
    titlePlaceholder: 'What is this session about?',
    questions: [],
    discussionTimerSeconds: null,
    votingTimerSeconds: null,
    voiceEnabled: false,
  },
  {
    id: 'sprint-planning',
    version: 1,
    source: 'built-in',
    name: 'Sprint planning',
    summary: 'Agree the goal, choose the work, spot the risks.',
    icon: 'sprint',
    tone: 'cool',
    title: 'Sprint planning',
    titlePlaceholder: 'Sprint 24 planning',
    questions: [
      { text: 'What is the goal for this sprint?', votingEnabled: true },
      { text: 'Which stories make the cut?', votingEnabled: true },
      { text: 'What could block us?', votingEnabled: false },
      { text: 'Who takes what?', votingEnabled: false },
    ],
    discussionTimerSeconds: 10 * 60,
    votingTimerSeconds: 2 * 60,
    voiceEnabled: true,
  },
  {
    id: 'retrospective',
    version: 1,
    source: 'built-in',
    name: 'Retrospective',
    summary: 'Look back together, then commit to one change.',
    icon: 'retro',
    tone: 'plum',
    title: 'Sprint retro',
    titlePlaceholder: 'Sprint 23 retro',
    questions: [
      { text: 'What went well?', votingEnabled: false },
      { text: 'What didn’t go so well?', votingEnabled: false },
      { text: 'What should we try next sprint?', votingEnabled: true },
      { text: 'Which one action do we commit to?', votingEnabled: true },
    ],
    discussionTimerSeconds: 8 * 60,
    votingTimerSeconds: 2 * 60,
    voiceEnabled: true,
  },
  {
    id: 'brainstorming',
    version: 1,
    source: 'built-in',
    name: 'Brainstorming',
    summary: 'Go wide on ideas, then narrow to the best few.',
    icon: 'ideas',
    tone: 'amber',
    title: 'Brainstorm',
    titlePlaceholder: 'Ideas for the onboarding revamp',
    questions: [
      { text: 'What problem are we solving?', votingEnabled: false },
      { text: 'Ideas: anything goes', votingEnabled: false },
      { text: 'Which ideas are worth a closer look?', votingEnabled: true },
    ],
    discussionTimerSeconds: 10 * 60,
    votingTimerSeconds: 3 * 60,
    voiceEnabled: false,
  },
];
