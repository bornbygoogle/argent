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

/**
 * Decorative tints — settings rows, sync icons, the account gradient — were
 * still the indigo/emerald palette from before the "Ink & Signal" re-skin,
 * sitting cold on a warm ink ground. They keep their variety, but as warm,
 * theme-aware tokens. Named --accent-* rather than reusing --signal: the gold
 * belongs to the remaining-to-spend figure and must stay unclaimed.
 */
describe('accent tints', () => {
  const ACCENTS = ['accent-ink', 'accent-green', 'accent-clay', 'accent-red', 'accent-plum'];

  it.each([
    ['light', ':root', '#FFFFFF', '#F7F5F1'],
    ['dark', 'html.dark', '#1A1815', '#100E0C'],
  ])('stays legible in %s on both card and page', (_t, block, card, page) => {
    for (const name of ACCENTS) {
      const value = token(block, name);
      // 1.4.11: a meaningful non-text mark needs 3:1 against its ground.
      expect(contrast(value, card), `${name} on card`).toBeGreaterThanOrEqual(3);
      expect(contrast(value, page), `${name} on page`).toBeGreaterThanOrEqual(3);
    }
  });

  // Both themes: --accent-amber matched --signal exactly in dark while looking
  // fine in light, which is how a decorative row icon quietly became the one
  // colour that is supposed to mean "what can I still spend".
  it.each([['light', ':root'], ['dark', 'html.dark']])(
    'leaves the signal gold to the one figure that owns it, in %s',
    (_t, block) => {
      const signal = token(block, 'signal');

      for (const name of ACCENTS) expect(token(block, name), name).not.toBe(signal);
    },
  );

  it('has retired the pre-reskin palette from the chrome', () => {
    const LEGACY = ['#4F46E5', '#10B981', '#64748B', '#EF4444', '#F59E0B', '#94A3B8', '#0F172A'];
    const offenders: string[] = [];

    for (const [file, body] of sourceFiles()) {
      // These two own the swatch palette a user picks a category colour from.
      // Those are stored data, not chrome, and retinting them would not change
      // a single existing category.
      if (/Categories\.tsx|IncomeTypes\.tsx/.test(file)) continue;
      body.split('\n').forEach((line, i) => {
        for (const hex of LEGACY) {
          if (line.toUpperCase().includes(hex)) offenders.push(`${file}:${i + 1} ${hex}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Parsing a colour with parseInt is what locked TintedIcon to literal hex for
 * so long, and MetaTile repeated it — the moment its tint became a token the
 * arithmetic produced rgba(NaN,NaN,NaN,.12) and the tile lost its wash with
 * nothing failing. Hand the colour to CSS as --tint instead and let it mix.
 */
describe('colour arithmetic', () => {
  it('is left to CSS, never done on a colour prop in JS', () => {
    const offenders: string[] = [];

    for (const [file, body] of sourceFiles()) {
      body.split('\n').forEach((line, i) => {
        if (/parseInt\s*\(\s*(tint|hex|color|colour)/i.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * This installs to a homescreen and is used one-handed, many times a day, so
 * the 44pt guidance applies even though WCAG's web minimum is 24px. The visual
 * size stays as designed — a 44px chip would wreck the density of a filter row
 * — and only the hit box grows, via an absolutely-positioned ::before that
 * moves nothing around it. (::after is taken: it is the toggle's knob.)
 */
describe('touch targets', () => {
  /**
   * Tallest height declared for a selector across every rule that names it.
   * A selector appears in more than one rule here — .toast is in the shared
   * press-feedback group as well as its own block — so stopping at the first
   * match reports the group's (heightless) body and invents a failure.
   */
  const declaredHeight = (sel: string): number | null => {
    let tallest: number | null = null;
    for (const m of css.matchAll(/(^|\n)([^{}\n]+)\{([^}]*)\}/g)) {
      const names = m[2].split(',').map((n) => n.trim());
      if (!names.includes(sel)) continue;
      const hit = /(?:^|;|\s)(?:min-)?height:\s*(\d+)px/.exec(m[3]);
      if (hit) tallest = Math.max(tallest ?? 0, Number(hit[1]));
    }
    return tallest;
  };

  function tappable(): string[] {
    const found = new Set<string>();
    for (const m of css.matchAll(/(^|\n)([^{}\n]+)\{([^}]*)\}/g)) {
      if (/cursor\s*:\s*pointer/.test(m[3]) && m[2].trim().startsWith('.')) found.add(m[2].trim());
    }
    return [...found];
  }

  it('gives every tappable control a hit box of at least 44px', () => {
    const small = tappable().filter((sel) => {
      const h = declaredHeight(sel);
      if (h !== null && h >= 44) return false;
      const expander = new RegExp(`${sel.replace(/[.>]/g, '\\$&')}::before[^{]*\\{[^}]*height:\\s*(\\d+)px`).exec(css);
      return !(expander && Number(expander[1]) >= 44);
    });

    expect(small).toEqual([]);
  });
});

/**
 * The knob is white on a track that becomes bone in dark mode, so a toggle
 * that is ON shows no knob at all — 1.21:1. Both track states must hold the
 * knob in both themes.
 */
describe('toggle knob', () => {
  it.each([['light', ':root'], ['dark', 'html.dark']])('stays visible in %s, on and off', (_t, block) => {
    const deref = (v: string) => (v.startsWith('var(') ? token(block, v.slice(6, -1)) : v);
    const knob = deref(/\.toggle::after\{[^}]*background:\s*([^;]+);/.exec(css)![1].trim());
    const off = deref(/\.toggle\{[^}]*background:\s*([^;]+);/.exec(css)![1].trim());
    const on = deref(/\.toggle\.on\{background:\s*([^;]+)\}/.exec(css)![1].trim());

    expect(contrast(knob, off), 'knob on the off track').toBeGreaterThanOrEqual(3);
    expect(contrast(knob, on), 'knob on the on track').toBeGreaterThanOrEqual(3);
  });
});

/**
 * Structure a screen reader navigates by: one landmark to jump into, and a
 * level-1 heading naming where you are. Every screen rendered its title into a
 * plain div and its body into a plain div, so there was neither.
 */
describe('screen structure', () => {

  /**
   * The source of the whole `<TopBar … />` element. A regex cannot do this:
   * the bars nest JSX in their slots (left={<button …>}), so "up to the first
   * >" stops inside a slot, while "any title= in the file" happily matches a
   * Sheet's title three hundred lines away. Walk the braces instead.
   */
  function topBarElement(body: string): string {
    const start = body.indexOf('<TopBar');
    if (start < 0) return '';
    let depth = 0;
    for (let i = start; i < body.length; i++) {
      const c = body[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) return body.slice(start, i + 1);
    }
    return body.slice(start);
  }

  /** Feature files that render a whole screen (they own a TopBar). */
  const screens = () => sourceFiles().filter(([, body]) => body.includes('<TopBar'));

  it('finds the screens, so an empty pass cannot look green', () => {
    expect(screens().length).toBeGreaterThan(10);
  });

  it('wraps each screen body in a main landmark', () => {
    const noLandmark = screens()
      .filter(([, body]) => !/<main[\s>]/.test(body))
      .map(([file]) => file);

    expect(noLandmark).toEqual([]);
  });

  it('gives each screen a name, visible in the bar or for assistive tech alone', () => {
    // Either TopBar renders the heading (title / screenName) or the screen
    // supplies its own <h1> — Statistics already shows its name in the bar, and
    // a second hidden copy would just be announced twice.
    const unnamed = screens()
      .filter(([, body]) => !/(title|screenName)=/.test(topBarElement(body)) && !/<h1[\s>]/.test(body))
      .map(([file]) => file);

    expect(unnamed).toEqual([]);
  });

  it('never hardcodes a user-facing string past i18n', () => {
    const hardcoded: string[] = [];

    for (const [file, body] of sourceFiles()) {
      body.split('\n').forEach((line, i) => {
        if (/aria-label="[A-Za-z]/.test(line)) hardcoded.push(`${file}:${i + 1}`);
      });
    }

    expect(hardcoded).toEqual([]);
  });
});
