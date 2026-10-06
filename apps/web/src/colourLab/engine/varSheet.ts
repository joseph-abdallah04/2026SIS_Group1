import { ISLAND_SELECTOR } from '../model/islands';
import { type Scheme } from '../model/spec';

export interface SheetContent {
  scheme: Scheme;
  /** Custom properties to set on the root: the brand tokens, and the lab's own role variables. */
  root: ReadonlyMap<string, string>;
  /**
   * What the same properties are inside content that stays light. `initial` makes
   * a role variable fall back to the app's own colour.
   */
  islands: ReadonlyMap<string, string> | null;
}

const block = (
  selector: string,
  colorScheme: Scheme,
  vars: ReadonlyMap<string, string>,
  extra: readonly string[] = [],
): string => {
  const lines = [`  color-scheme: ${colorScheme};`, ...extra.map((line) => `  ${line};`)];
  for (const [name, value] of vars) lines.push(`  ${name}: ${value};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
};

/**
 * The lab's own stylesheet.
 *
 * Tailwind puts the brand tokens in a cascade layer, and a rule outside any
 * layer wins over every layered one, so a plain `:root` rule is enough and
 * nothing here needs `!important`. In the dark theme the root also says
 * `color-scheme: dark`, so what the browser draws itself, scrollbars and form
 * controls, goes dark with the page, and the islands say light again.
 */
export function renderSheet({ scheme, root, islands }: SheetContent): string {
  if (scheme === 'light' && root.size === 0) return '';
  const blocks = [block(':root', scheme, root)];
  // `:where` forgives a selector the browser does not know, and costs no specificity.
  if (scheme === 'dark' && islands) {
    // The text colour is inherited as a value, not looked up again: text inside
    // content that stays light would otherwise keep the dark page's light ink.
    blocks.push(
      block(`:where(${ISLAND_SELECTOR})`, 'light', islands, ['color: var(--color-rt-ink)']),
    );
  }
  return blocks.join('\n');
}

/**
 * A constructed stylesheet adopted by the document rather than a `<style>`, so it
 * is not a DOM change anything else could trip over. A browser without them gets
 * a `<style>` and the same result.
 */
export class VarSheet {
  private sheet: CSSStyleSheet | null = null;
  private element: HTMLStyleElement | null = null;

  constructor(private readonly doc: Document) {
    try {
      this.sheet = new CSSStyleSheet();
      this.doc.adoptedStyleSheets = [...this.doc.adoptedStyleSheets, this.sheet];
    } catch {
      this.sheet = null;
      this.element = this.doc.createElement('style');
      this.element.setAttribute('data-colour-lab', '');
      this.doc.head.appendChild(this.element);
    }
  }

  /** Whether a mutation was this sheet's own, for the observer that watches the head. */
  owns(node: Node | null): boolean {
    return this.element !== null && node !== null && this.element.contains(node);
  }

  set(css: string): void {
    if (this.sheet) this.sheet.replaceSync(css);
    else if (this.element) this.element.textContent = css;
  }

  dispose(): void {
    if (this.sheet) {
      this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((s) => s !== this.sheet);
    }
    this.element?.remove();
    this.sheet = null;
    this.element = null;
  }
}
