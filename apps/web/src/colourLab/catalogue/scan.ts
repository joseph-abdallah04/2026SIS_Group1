import { scanCssSource } from './scanCss';
import { scanSvgSource } from './scanSvg';
import { scanTsSource } from './scanTs';
import { type Catalogue, type FileScan, type GitInfo } from './types';

/** Repo-relative paths under these are drawn only into exports. */
const EXPORT_ONLY_PREFIXES = ['apps/server/'];

/** The scanner for a file, by extension. `null` for a file with no colours to find. */
export function scanFile(file: string, text: string): FileScan | null {
  const exportOnly = EXPORT_ONLY_PREFIXES.some((prefix) => file.startsWith(prefix));
  if (file.endsWith('.css')) return scanCssSource(file, text, exportOnly);
  if (file.endsWith('.svg')) return scanSvgSource(file, text, exportOnly);
  if (/\.tsx?$/.test(file)) return scanTsSource(file, text, exportOnly);
  return null;
}

/** Whether a repo-relative path is one the lab should read. */
export function isScannable(file: string): boolean {
  if (/(^|\/)(node_modules|dist)\//.test(file)) return false;
  if (file.includes('/colourLab/')) return false;
  if (/\.test\.tsx?$/.test(file) || file.endsWith('.d.ts')) return false;
  return /\.(css|svg|tsx?)$/.test(file);
}

export function mergeScans(
  scans: ReadonlyMap<string, FileScan>,
  git: GitInfo,
  generatedAt: number,
): Catalogue {
  const files = [...scans.keys()].sort();
  const catalogue: Catalogue = {
    generatedAt,
    git,
    tokens: [],
    literals: [],
    classes: [],
    refs: [],
  };
  for (const file of files) {
    const scan = scans.get(file);
    if (!scan) continue;
    catalogue.tokens.push(...scan.tokens);
    catalogue.literals.push(...scan.literals);
    catalogue.classes.push(...scan.classes);
    catalogue.refs.push(...scan.refs);
  }
  return catalogue;
}
