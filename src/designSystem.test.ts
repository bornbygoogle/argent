import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The stylesheet is the design system — every control in this app is a custom
 * class with `border:none`, so nothing here inherits a usable focus ring from
 * the user agent. These read the real file rather than a copy of it, and they
 * measure the ring instead of trusting that it looks fine.
 */
const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

/** Every non-test .tsx under src/, as [relative path, contents]. */
function sourceFiles(): [string, string][] {
  const root = resolve(__dirname);
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = resolve(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && e.name.endsWith('.tsx') && !e.name.includes('.test.') ? [full] : [];
    });
  return walk(root).map((f) => [f.slice(root.length + 1), readFileSync(f, 'utf8')]);
}


/** Value of `--name` inside the given block, e.g. ':root' or 'html.dark'. */
function token(block: string, name: string): string {
  const start = css.indexOf(block + '{');
  if (start < 0) throw new Error(`no ${block} block in index.css`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const hit = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(body);
  if (!hit) throw new Error(`--${name} is not defined in ${block}`);
  return hit[1].trim();
}

const luminance = (hex: string): number => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(full.substr(i, 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe('focus ring', () => {
  it('is defined once, globally, so no control can be missed', () => {
    expect(css).toMatch(/:focus-visible\s*\{/);
  });

  it('draws a real outline rather than only a colour change', () => {
    const rule = /:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

    expect(rule).toMatch(/outline\s*:/);
    expect(rule).toMatch(/outline-offset\s*:/);
  });

  it.each([
    ['light', ':root', 'white', 'neutral-50'],
    ['dark', 'html.dark', 'white', 'neutral-50'],
  ])('stays visible in %s against both card and page', (_theme, block, card, page) => {
    const ring = token(block, 'focus-ring');

    // WCAG 1.4.11 non-text contrast: a focus indicator needs 3:1 against
    // whatever sits behind it, and controls sit on cards and on the page.
    expect(contrast(ring, token(block, card))).toBeGreaterThanOrEqual(3);
    expect(contrast(ring, token(block, page))).toBeGreaterThanOrEqual(3);
  });

  it('never removes an outline without putting one back', () => {
    expect(css).not.toMatch(/outline\s*:\s*none/);
  });

  /**
   * An inline style beats a stylesheet rule, so a single `outline: 'none'` in
   * JSX silently defeats the global ring above — on that control only, which
   * is the hardest kind of gap to notice. Scan the source rather than trusting
   * that nobody reaches for it again.
   */
  it('is not cancelled by an inline style anywhere in the app', () => {
    const offenders = sourceFiles()
      .filter(([, body]) => /outline\s*:\s*['\"]?none/.test(body))
      .map(([file]) => file);

    expect(offenders).toEqual([]);
  });
});

/**
 * A placeholder is a hint, not a name: it disappears the moment the user types
 * and is not reliably announced. This is a source-level check on purpose —
 * rendering every screen would need each one's database and router fixtures,
 * and would still only sample. Here nothing is missed.
 */
describe('form controls', () => {
  /** The lines that open an <input>/<textarea>, with the block each sits in. */
  function controls(): { where: string; block: string }[] {
    const found: { where: string; block: string }[] = [];
    for (const [file, body] of sourceFiles()) {
      const lines = body.split('\n');
      lines.forEach((line, i) => {
        if (!/<(input|textarea)\b/.test(line)) return;
        // Look back far enough to catch a wrapping <label>, and forward to the
        // end of the opening tag where the attributes live.
        found.push({ where: `${file}:${i + 1}`, block: lines.slice(Math.max(0, i - 12), i + 14).join('\n') });
      });
    }
    return found;
  }

  it('finds the inputs, so an empty pass cannot look like a green one', () => {
    expect(controls().length).toBeGreaterThan(15);
  });

  it('gives every input an accessible name, never a placeholder alone', () => {
    const nameless = controls()
      .filter(({ block }) => {
        // <Field label=…> counts: it renders a real <label> around its child,
        // which Field's own tests assert behaviourally rather than by grep.
        const named = /aria-label|aria-labelledby|<label|<Field\s+label=/.test(block);
        const exempt = /type="file"|type="hidden"/.test(block);
        return !named && !exempt;
      })
      .map(({ where }) => where);

    expect(nameless).toEqual([]);
  });
});
