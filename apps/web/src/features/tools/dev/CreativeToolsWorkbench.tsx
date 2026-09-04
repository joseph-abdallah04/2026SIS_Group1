import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import type { BoardItem } from '@roundtable/shared';
import type { ProposalCreateInput } from '@roundtable/shared/schemas';

import { RoundTableLogo } from '../../../components/RoundTableLogo';
import { CreativeToolbar } from '../../toolbar/CreativeToolbar';
import { ProposalCard } from '../../pinboard/ProposalCard';
import { CreativeStudio } from '../CreativeStudio';
import { CreativeToolsProvider } from '../CreativeToolsProvider';

export function CreativeToolsWorkbench() {
  const [proposals, setProposals] = useState<BoardItem[]>([]);

  async function propose(input: ProposalCreateInput) {
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    setProposals((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        questionId: 'creative-tools-workbench',
        authorId: 'current-developer',
        authorName: 'You',
        type: input.type,
        artifactJson: input.artifactJson,
        x: input.x,
        y: input.y,
        createdAt: new Date().toISOString(),
        extendsProposalId: input.extendsProposalId ?? null,
      },
    ]);
  }

  return (
    <CreativeToolsProvider isLive proposals={proposals} propose={propose}>
      <main className="flex h-screen min-h-0 flex-col bg-rt-surface text-rt-ink">
        <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-rt-primary-tint bg-rt-primary px-5 text-white">
          <RoundTableLogo />
          <div className="h-7 w-px bg-white/30" />
          <div className="min-w-0">
            <p className="text-[9px] font-semibold tracking-[0.14em] text-white/75 uppercase">
              Development workbench
            </p>
            <h1 className="truncate text-[14px] font-semibold">Creative tools</h1>
          </div>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-[10px] font-semibold">
            <FlaskConical aria-hidden="true" size={13} />
            Dev only
          </span>
        </header>

        <section
          aria-label="Proposal preview board"
          className="relative min-h-0 flex-1 overflow-auto bg-rt-surface-sunken p-7"
          style={{
            backgroundImage: 'radial-gradient(rgba(140,164,172,0.32) 1.3px, transparent 1.3px)',
            backgroundSize: '22px 22px',
          }}
        >
          {proposals.length ? (
            <div className="flex flex-wrap items-start gap-5">
              {proposals.map((proposal) => (
                <ProposalCard key={proposal.id} item={proposal} zoom={100} isNew />
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-72 items-center justify-center">
              <p className="text-[13px] font-medium text-rt-ink-faint">No proposals yet</p>
            </div>
          )}
        </section>

        <footer className="grid min-h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-t border-rt-tertiary px-4 sm:px-6">
          <div />
          <CreativeToolbar />
          <span className="justify-self-end text-[11px] text-rt-ink-faint">
            {proposals.length} {proposals.length === 1 ? 'item' : 'items'}
          </span>
        </footer>
      </main>
      <CreativeStudio />
    </CreativeToolsProvider>
  );
}
