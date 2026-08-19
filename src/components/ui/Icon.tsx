import {
  // nav / chrome
  Home, BarChart3, ChartColumnIncreasing, Plus, Calendar, CalendarDays, Settings,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Bell, X, Check, EllipsisVertical,
  // money / accounts
  Wallet, PiggyBank, Banknote, CreditCard, Euro, CircleDollarSign, Coins,
  Briefcase, Gift, TrendingUp, Landmark,
  // categories
  ShoppingCart, Utensils, UtensilsCrossed, Car, Film, BookOpen, Bookmark,
  Heart, HeartPulse, FileText, Receipt, Tag,
  // arrows / actions
  ArrowLeft, ArrowRight, ArrowUp, ArrowDownRight, ArrowUpRight, ArrowLeftRight,
  CornerDownRight,
  Archive, ArchiveRestore, Search, Trash2, Pencil, Type, Delete, Download, Upload,
  CloudUpload, CloudDownload, Cloud, CloudOff, RefreshCw, Repeat, Lock, LogOut, GripVertical, LayoutGrid,
  Filter,
  // misc
  Copy, Sun, Moon, MonitorSmartphone, Smartphone, Languages, Database, Shield,
  ShieldCheck, Lightbulb, WifiOff, Info, CircleDashed, AlertCircle, CheckCircle2,
  Share,
  type LucideProps,
} from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * Curated icon map (keeps tree-shaking & bundle small for offline-first).
 * Names mirror the inline SVGs used across the validated mocks.
 */
const ICONS: Record<string, ComponentType<LucideProps>> = {
  // nav / chrome
  Home, BarChart3, ChartColumnIncreasing, Plus, Calendar, CalendarDays, Settings,
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Bell, X, Check, EllipsisVertical,
  // money / accounts
  Wallet, PiggyBank, Banknote, CreditCard, Euro, CircleDollarSign, Coins,
  Briefcase, Gift, TrendingUp, Landmark,
  // categories
  ShoppingCart, Utensils, UtensilsCrossed, Car, Film, BookOpen, Bookmark,
  Heart, HeartPulse, FileText, Receipt, Tag,
  // arrows / actions
  ArrowLeft, ArrowRight, ArrowUp, ArrowDownRight, ArrowUpRight, ArrowLeftRight,
  CornerDownRight,
  Archive, ArchiveRestore, Search, Trash2, Pencil, Type, Delete, Download, Upload,
  CloudUpload, CloudDownload, Cloud, CloudOff, RefreshCw, Repeat, Lock, LogOut, GripVertical, LayoutGrid,
  Filter,
  // misc
  Copy, Sun, Moon, MonitorSmartphone, Smartphone, Languages, Database, Shield,
  ShieldCheck, Lightbulb, WifiOff, Info, CircleDashed, AlertCircle, CheckCircle2,
  Share,
};

interface IconProps extends LucideProps {
  name: string;
  /**
   * Accessible name, for the rare icon that carries meaning on its own.
   * Leave it off for the common case — an icon sitting beside its own visible
   * text — so a screen reader doesn't read the same thing twice.
   */
  label?: string;
}

export function Icon({ name, label, ...props }: IconProps) {
  const Cmp = ICONS[name] ?? CircleDashed;
  // Decorative by default: an unnamed glyph next to visible text is noise in
  // the accessibility tree. Naming it opts into being announced instead.
  const semantics = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };
  return <Cmp {...semantics} {...props} />;
}
