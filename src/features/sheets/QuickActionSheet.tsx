import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { QATile } from '@/components/ui/QATile';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export type QuickAction = 'expense' | 'income' | 'transfer';

interface QuickActionSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (action: QuickAction) => void;
}

const ACTIONS: { key: QuickAction; icon: string; hex: string }[] = [
  { key: 'expense', icon: 'ArrowRight', hex: 'var(--danger-600)' },
  { key: 'income', icon: 'ArrowLeft', hex: 'var(--success-600)' },
  { key: 'transfer', icon: 'ArrowLeftRight', hex: 'var(--primary-600)' },
];

/** Bottom sheet with the three quick-add tiles (mock 17). */
export function QuickActionSheet({ open, onClose, onPick }: QuickActionSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Sheet open={open} onClose={onClose} title={t('quickAction.title')}>
      <div className="grid grid-cols-3 gap-2" style={{ paddingBottom: 4 }}>
        {ACTIONS.map((a) => (
          <QATile
            key={a.key}
            hex={a.hex}
            icon={a.icon}
            label={t(`quickAction.${a.key}`)}
            onClick={() => {
              onClose();
              onPick(a.key);
            }}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        full
        onClick={() => {
          onClose();
          navigate('/recurring');
        }}
        style={{ marginTop: 14, height: 44 }}
      >
        <Icon name="Repeat" size={18} />
        {t('settings.recurring')}
      </Button>
    </Sheet>
  );
}
