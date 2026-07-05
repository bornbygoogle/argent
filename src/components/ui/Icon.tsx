import {
  // nav / chrome
  Home, BarChart3, ChartColumnIncreasing, Plus, Calendar, CalendarDays, Settings,
  ChevronLeft, ChevronRight, ChevronDown, Bell, X, Check, EllipsisVertical,
  // money / accounts
  Wallet, PiggyBank, Banknote, CreditCard, Euro, CircleDollarSign, Coins,
  Briefcase, Gift, TrendingUp, Landmark,
  // categories
  ShoppingCart, Utensils, UtensilsCrossed, Car, Film, BookOpen, Bookmark,
  Heart, HeartPulse, FileText, Receipt, Tag,
  // arrows / actions
  ArrowLeft, ArrowRight, ArrowUp, ArrowDownRight, ArrowUpRight, ArrowLeftRight,
  Archive, ArchiveRestore, Search, Trash2, Pencil, Type, Delete, Download, Upload,
  CloudUpload, CloudDownload, Cloud, RefreshCw, Repeat, Lock, LogOut, GripVertical, LayoutGrid,
  // misc
  Copy, Sun, Moon, MonitorSmartphone, Smartphone, Languages, Database, Shield,
  ShieldCheck, Lightbulb, WifiOff, Info, CircleDashed, AlertCircle, CheckCircle2,
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
  ChevronLeft, ChevronRight, ChevronDown, Bell, X, Check, EllipsisVertical,
  // money / accounts
  Wallet, PiggyBank, Banknote, CreditCard, Euro, CircleDollarSign, Coins,
  Briefcase, Gift, TrendingUp, Landmark,
  // categories
  ShoppingCart, Utensils, UtensilsCrossed, Car, Film, BookOpen, Bookmark,
  Heart, HeartPulse, FileText, Receipt, Tag,
  // arrows / actions
  ArrowLeft, ArrowRight, ArrowUp, ArrowDownRight, ArrowUpRight, ArrowLeftRight,
  Archive, ArchiveRestore, Search, Trash2, Pencil, Type, Delete, Download, Upload,
  CloudUpload, CloudDownload, Cloud, RefreshCw, Repeat, Lock, LogOut, GripVertical, LayoutGrid,
  // misc
  Copy, Sun, Moon, MonitorSmartphone, Smartphone, Languages, Database, Shield,
  ShieldCheck, Lightbulb, WifiOff, Info, CircleDashed, AlertCircle, CheckCircle2,
};

interface IconProps extends LucideProps {
  name: string;
}

export function Icon({ name, ...props }: IconProps) {
  const Cmp = ICONS[name] ?? CircleDashed;
  return <Cmp {...props} />;
}
