import { roleOfProperty } from '../catalogue/roles';
import { type Role } from '../catalogue/types';
import { type Declaration, splitDeclarations } from '../colour/tokens';
import { type SlotKey } from '../model/slots';
import { cleanSelector } from './selectors';
import { type Painter, type Template, buildTemplate, renderTemplate } from './template';

/** A place a colour is used, in the terms the page can be asked about. */
export interface Use {
  slot: SlotKey;
  role: Role;
  /** The elements the rule styles, states stripped. `null` inside @keyframes. */
  selector: string | null;
  /** @media conditions that have to hold for the rule to apply. */
  media: readonly string[];
  keyframes: string | null;
}

/** One declaration that holds colours the lab can repaint. */
export interface StyleWriter {
  readonly template: Template;
  apply(painter: Painter): void;
}

export interface CssomScan {
  /** --color-* custom properties defined on :root, as written. */
  varDefs: Map<string, string>;
  writers: StyleWriter[];
  uses: Use[];
}

class DeclarationWriter implements StyleWriter {
  private last: string;

  constructor(
    private readonly style: CSSStyleDeclaration,
    private readonly name: string,
    private readonly important: boolean,
    readonly template: Template,
  ) {
    this.last = template.original;
  }

  apply(painter: Painter): void {
    const next = renderTemplate(this.template, painter);
    if (next === this.last) return;
    this.style.setProperty(this.name, next, this.important ? 'important' : '');
    this.last = next;
  }
}

interface Context {
  selector: string | null;
  media: readonly string[];
  keyframes: string | null;
}

/** The parts of a CSSRule this walker reads. Newer rule types are not in every lib.dom. */
interface RuleLike {
  constructor: { name: string };
  cssRules?: CSSRuleList;
  style?: CSSStyleDeclaration;
  selectorText?: string;
  conditionText?: string;
  media?: MediaList;
  name?: string;
  styleSheet?: CSSStyleSheet | null;
}

const ROOT_SELECTOR = /^(?::root|:host|html)(?:\s*,\s*(?::root|:host|html))*$/;

/** Wrappers that apply their rules as they are, so far as this walker can tell. */
const TRANSPARENT_GROUPS = new Set([
  'CSSLayerBlockRule',
  'CSSContainerRule',
  'CSSScopeRule',
  'CSSStartingStyleRule',
]);

function supported(condition: string): boolean {
  try {
    return CSS.supports(condition);
  } catch {
    return true;
  }
}

class Walker {
  readonly scan: CssomScan = { varDefs: new Map(), writers: [], uses: [] };
  private readonly seen = new Set<string>();

  walkSheet(sheet: CSSStyleSheet): void {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return; // A cross-origin sheet, such as the web font's. Not ours to read.
    }
    this.walk(rules, { selector: null, media: [], keyframes: null });
  }

  private walk(rules: CSSRuleList, context: Context): void {
    for (const rule of Array.from(rules)) {
      const like = rule as unknown as RuleLike;
      const kind = like.constructor.name;
      if (kind === 'CSSStyleRule') {
        const selector = cleanSelector(like.selectorText ?? '', context.selector);
        const inner = { ...context, selector };
        if (like.style) this.declarations(like.style, inner);
        if (like.cssRules) this.walk(like.cssRules, inner);
      } else if (kind === 'CSSNestedDeclarations') {
        if (like.style) this.declarations(like.style, context);
      } else if (kind === 'CSSMediaRule') {
        const text = like.media?.mediaText ?? like.conditionText ?? '';
        const media = text && text !== 'all' ? [...context.media, text] : context.media;
        if (like.cssRules) this.walk(like.cssRules, { ...context, media });
      } else if (kind === 'CSSSupportsRule') {
        // Tailwind's fallbacks for old browsers sit behind a test this browser fails.
        if (like.cssRules && supported(like.conditionText ?? '')) this.walk(like.cssRules, context);
      } else if (kind === 'CSSKeyframesRule') {
        const keyframes = like.name ?? null;
        for (const frame of Array.from(like.cssRules ?? [])) {
          const style = (frame as unknown as RuleLike).style;
          if (style) this.declarations(style, { selector: null, media: [], keyframes });
        }
      } else if (kind === 'CSSImportRule') {
        if (like.styleSheet) this.walkSheet(like.styleSheet);
      } else if (TRANSPARENT_GROUPS.has(kind) && like.cssRules) {
        this.walk(like.cssRules, context);
      }
    }
  }

  private declarations(style: CSSStyleDeclaration, context: Context): void {
    let declarations: Declaration[];
    try {
      declarations = splitDeclarations(style.cssText);
    } catch {
      return;
    }
    for (const { name, value, important } of declarations) {
      if (name.startsWith('--color-') && context.selector && ROOT_SELECTOR.test(context.selector)) {
        this.scan.varDefs.set(name, value);
        continue;
      }
      // Tailwind writes an sRGB fallback before the real value of a colour with
      // an opacity. The browser takes the line after it, so this one is dead.
      if (value.includes('color-mix(in srgb')) continue;

      const template = buildTemplate(value, roleOfProperty(name), name);
      if (!template) continue;
      this.scan.writers.push(new DeclarationWriter(style, name, important, template));
      for (const part of template.parts) {
        if (typeof part !== 'string') this.use(part.slot, part.role, context);
      }
    }
  }

  private use(slot: SlotKey, role: Role, context: Context): void {
    const key = `${slot}|${role}|${context.selector}|${context.media.join('&')}|${context.keyframes}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.scan.uses.push({
      slot,
      role,
      selector: context.selector,
      media: context.media,
      keyframes: context.keyframes,
    });
  }
}

/** Reads every stylesheet on the page for the colours in it. */
export function scanStyleSheets(doc: Document): CssomScan {
  const walker = new Walker();
  for (const sheet of Array.from(doc.styleSheets)) {
    if (!sheet.disabled) walker.walkSheet(sheet);
  }
  return walker.scan;
}
