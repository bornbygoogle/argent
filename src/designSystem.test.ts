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

/**
 * A control that changes state in 0ms reads as a dead control — the user taps,
 * nothing acknowledges it, and they tap again. `cursor:pointer` is the
 * stylesheet's own declaration that something is tappable, so deriving the
 * list from it means a new control cannot be added without a press state.
 */
describe('press feedback', () => {
  /** Selectors this stylesheet declares tappable, via `cursor:pointer`. */
  function tappable(): string[] {
    const found = new Set<string>();
    for (const m of css.matchAll(/(^|\n)([^{}\n]+)\{([^}]*)\}/g)) {
      const [selector, body] = [m[2].trim(), m[3]];
      if (/cursor\s*:\s*pointer/.test(body) && selector.startsWith('.')) found.add(selector);
    }
    return [...found];
  }

  it('finds the tappable selectors, so an empty pass cannot look green', () => {
    expect(tappable().length).toBeGreaterThan(8);
  });

  it('acknowledges a press on every tappable control', () => {
    const silent = tappable().filter((sel) => !css.includes(`${sel}:active`));

    expect(silent).toEqual([]);
  });

  it('times the acknowledgement to be felt but not waited on', () => {
    const fade = /--press-fade\s*:\s*(\d+)ms/.exec(css)?.[1];

    // 80-150ms: below it the change is missed, above it the control feels slow.
    expect(Number(fade)).toBeGreaterThanOrEqual(80);
    expect(Number(fade)).toBeLessThanOrEqual(150);
  });
});

/**
 * A hex copied out of the token table is the worst kind of colour bug: it
 * looks right in the theme it was copied from and silently stops following
 * the other one. MovementRow held #6B655C and #2F8F62 — --neutral-500 and
 * --success-500, frozen at their light values — so every row icon kept a
 * light-theme tint on a dark ground.
 */
describe('theme tokens', () => {
  /** Every --token value declared for either theme, normalised to #rrggbb. */
  function tokenValues(): Map<string, string[]> {
    const byValue = new Map<string, string[]>();
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,6})\s*;/g)) {
      const v = expand(m[2]);
      byValue.set(v, [...(byValue.get(v) ?? []), m[1]]);
    }
    return byValue;
  }

  const expand = (hex: string): string => {
    const h = hex.replace('#', '').toLowerCase();
    return '#' + (h.length === 3 ? [...h].map((c) => c + c).join('') : h);
  };

  it('knows what the tokens are, so an empty pass cannot look green', () => {
    expect(tokenValues().size).toBeGreaterThan(20);
  });

  it('is never bypassed by a component hardcoding a token value', () => {
    const tokens = tokenValues();
    const offenders: string[] = [];

    for (const [file, body] of sourceFiles()) {
      // The crash screen is deliberately literal: it has to render even when
      // the stylesheet is the thing that failed.
      if (file.endsWith('ErrorBoundary.tsx')) continue;
      body.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/#[0-9A-Fa-f]{3,6}\b/g)) {
          const names = tokens.get(expand(m[0]));
          if (names) offenders.push(`${file}:${i + 1} ${m[0]} is ${names.join('/')}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The bottom inset was pasted inline in eleven places at three different
 * values, one of them (20px) off the 4/8px grid, while the .pb-safe utility
 * written for exactly this sat unused. Spacing that varies per screen for no
 * reason is the kind of drift nobody sees in one file and everybody feels
 * across the app.
 */
describe('safe-area insets', () => {
  it('are declared in the stylesheet, not pasted into components', () => {
    const inline = sourceFiles()
      .filter(([, body]) => body.includes('safe-area-inset'))
      .map(([file]) => file);

    expect(inline).toEqual([]);
  });

  it('offer only on-grid steps', () => {
    const steps = [...css.matchAll(/padding-bottom:calc\((\d+)px \+ env\(safe-area-inset-bottom\)\)/g)]
      .map((m) => Number(m[1]));

    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step % 8).toBe(0);
  });
});
