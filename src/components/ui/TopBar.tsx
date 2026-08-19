import type { CSSProperties, ReactNode } from 'react';

interface TopBarProps {
  title?: ReactNode;
  /**
   * The screen's name for assistive tech, when the design shows no visible
   * title (the screens built around a hero). Ignored when `title` is given,
   * so the name is never announced twice.
   */
  screenName?: string;
  /** Left slot (back chevron, account chip, cancel button, …). */
  left?: ReactNode;
  /** Right slot (action button, bell, …). */
  right?: ReactNode;
  /** Center the title (form variant: cancel / title / ok). */
  centered?: boolean;
}

/**
 * Top bar built on the validated mock `.topbar`. It is a non-sticky flex child
 * (flex-shrink:0) sitting above the scrolling `.content`, so it stays pinned
 * at the top of the phone column naturally.
 */
export function TopBar({ title, screenName, left, right, centered = false }: TopBarProps) {
  const titleStyle: CSSProperties | undefined = centered ? { textAlign: 'center', fontSize: 16 } : undefined;
  return (
    <header className="topbar">
      <div className="tb-left">{left}</div>
      {title ? (
        <h1 className="tb-title" style={titleStyle}>
          {title}
        </h1>
      ) : (
        <div className="tb-title" style={titleStyle}>
          {screenName && <h1 className="sr-only">{screenName}</h1>}
        </div>
      )}
      <div className="tb-right">{right}</div>
    </header>
  );
}
