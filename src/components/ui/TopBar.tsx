import type { CSSProperties, ReactNode } from 'react';

interface TopBarProps {
  title?: ReactNode;
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
export function TopBar({ title, left, right, centered = false }: TopBarProps) {
  const titleStyle: CSSProperties | undefined = centered ? { textAlign: 'center', fontSize: 16 } : undefined;
  return (
    <header className="topbar">
      <div className="tb-left">{left}</div>
      <div className="tb-title" style={titleStyle}>
        {title}
      </div>
      <div className="tb-right">{right}</div>
    </header>
  );
}
