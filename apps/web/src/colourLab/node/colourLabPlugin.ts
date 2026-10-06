/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { Plugin } from 'vite';

import { isScannable, mergeScans, scanFile } from '../catalogue/scan';
import { type Catalogue, type FileScan, type GitInfo } from '../catalogue/types';

const VIRTUAL_ID = 'virtual:colour-lab/catalogue';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** Sent to the page when a source file changes, so the lab never needs a reload. */
export const CATALOGUE_EVENT = 'colour-lab:catalogue';

/** Where the colours live, relative to the repo root. */
const SCAN_DIRS = ['apps/web/src', 'packages/shared/src', 'apps/server/src'];

function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function gitInfo(root: string): GitInfo {
  return {
    sha: git(root, ['rev-parse', 'HEAD']),
    branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    mergeBase:
      git(root, ['merge-base', 'HEAD', 'main']) ?? git(root, ['merge-base', 'HEAD', 'origin/main']),
  };
}

function collect(dir: string, repoRoot: string, into: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') collect(full, repoRoot, into);
    } else if (isScannable(toRepoPath(full, repoRoot))) {
      into.push(full);
    }
  }
}

const toRepoPath = (absolute: string, repoRoot: string): string =>
  path.relative(repoRoot, absolute).split(path.sep).join('/');

/**
 * Reads the app's source for every colour in it and serves the result as
 * `virtual:colour-lab/catalogue`. Dev tooling for the colour-testing branch:
 * nothing in the app imports it, and it changes no file.
 *
 * After the first scan only a changed file is read again, and the new
 * catalogue is pushed to the page as a custom event rather than by
 * invalidating the module, which would reload the page on every edit.
 */
export function colourLab(): Plugin {
  let repoRoot = process.cwd();
  const scans = new Map<string, FileScan>();
  let primed = false;

  const read = (absolute: string): void => {
    const file = toRepoPath(absolute, repoRoot);
    if (!isScannable(file)) return;
    try {
      const scan = scanFile(file, fs.readFileSync(absolute, 'utf8'));
      if (scan) scans.set(file, scan);
    } catch {
      scans.delete(file);
    }
  };

  const prime = (): void => {
    if (primed) return;
    primed = true;
    const files: string[] = [];
    for (const dir of SCAN_DIRS) collect(path.join(repoRoot, dir), repoRoot, files);
    for (const file of files) read(file);
  };

  const build = (): Catalogue => {
    prime();
    return mergeScans(scans, gitInfo(repoRoot), Date.now());
  };

  return {
    name: 'colour-lab',

    configResolved(config) {
      repoRoot = path.resolve(config.root, '..', '..');
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },

    load(id) {
      return id === RESOLVED_ID ? `export default ${JSON.stringify(build())};` : null;
    },

    configureServer(server) {
      // Vitest starts a dev server of its own; it has no page to push to.
      if (process.env.VITEST) return;
      for (const dir of SCAN_DIRS) server.watcher.add(path.join(repoRoot, dir));

      let timer: ReturnType<typeof setTimeout> | null = null;
      const push = (): void => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          server.ws.send({ type: 'custom', event: CATALOGUE_EVENT, data: build() });
        }, 250);
      };
      const changed = (absolute: string): void => {
        if (!isScannable(toRepoPath(absolute, repoRoot))) return;
        prime();
        read(absolute);
        push();
      };
      server.watcher.on('change', changed);
      server.watcher.on('add', changed);
      server.watcher.on('unlink', (absolute) => {
        scans.delete(toRepoPath(absolute, repoRoot));
        push();
      });
    },
  };
}
