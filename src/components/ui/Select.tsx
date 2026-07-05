import { useState } from 'react';
import type { ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { TintedIcon } from './TintedIcon';

export interface SelectOption {
  id: string;
  label: ReactNode;
  /** Lucide icon name; falls back to `emptyIcon`. */
  icon?: string;
  /** Hex tint for the option's tile; falls back to `emptyColor`. */
  color?: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (id: string) => void;
  /** Eyebrow label inside the trigger (also the default sheet title). */
  label: string;
  /** Title shown when the sheet opens (defaults to `label`). */
  sheetTitle?: string;
  /** Placeholder shown in the trigger when nothing is selected. */
  placeholder?: string;
  /** Tile color + icon for the empty state and for options lacking their own. */
  emptyColor?: string;
  emptyIcon?: string;
  /** Uses the success accent for the active check (income-type selectors). */
  variant?: 'default' | 'income';
}

const optionBtn = {
  width: '100%',
  padding: '10px 4px',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
} as const;

/**
 * Combo box: a full-width "card row" trigger (tinted tile + eyebrow + value +
 * chevron) that opens a bottom-sheet list. Mirrors the account picker so every
 * single-choice selector in the app behaves the same way, and reuses the
 * scrollable Sheet — long option lists (many categories) never clip, which was
 * the chip-row problem.
 */
export function Select({
  value,
  options,
  onChange,
  label,
  sheetTitle,
  placeholder = '—',
  emptyColor = '#94A3B8',
  emptyIcon = 'Tag',
  variant = 'default',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const checkColor = variant === 'income' ? 'var(--success-600)' : 'var(--primary-600)';

  return (
    <>
      <button
        type="button"
        className="card tight row"
        onClick={() => setOpen(true)}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <TintedIcon hex={selected?.color ?? emptyColor} icon={selected?.icon ?? emptyIcon} variant="cat-sm" />
        <div className="r-main">
          <div className="r-sub">{label}</div>
          <div className="r-title">{selected ? selected.label : placeholder}</div>
        </div>
        <Icon name="ChevronDown" size={16} color="var(--neutral-400)" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={sheetTitle ?? label}>
        <div className="col" style={{ paddingBottom: 8 }}>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="row"
              style={optionBtn}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              <TintedIcon hex={o.color ?? emptyColor} icon={o.icon ?? emptyIcon} variant="cat-sm" />
              <span className="r-main">
                <span className="r-title">{o.label}</span>
              </span>
              {value === o.id && <Icon name="Check" size={18} color={checkColor} />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
