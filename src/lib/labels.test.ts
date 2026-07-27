import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import {
  categoryLabel,
  categoryWithSubLabel,
  subcategoryLabel,
  incomeSubtypeLabel,
  incomeTypeWithSubLabel,
  transactionLabel,
} from '@/lib/labels';
import type {
  Category,
  IncomeSubtype,
  IncomeType,
  Subcategory,
  Transaction,
} from '@/types/models';

// i18next returns the key itself when a key is missing, and `hasKey` relies on
// that. Echoing the key therefore models "no translation exists", which is the
// case for every user-created entity — including every sub-category.
const t = ((key: string) => key) as unknown as TFunction;

const cat = (over: Partial<Category> = {}): Category => ({
  id: 'cat-restaurant',
  name: 'Restaurant',
  icon: 'Utensils',
  color: '#C97E2C',
  isDefault: true,
  sortOrder: 1,
  ...over,
});

const sub = (over: Partial<Subcategory> = {}): Subcategory => ({
  id: 'sub-1',
  categoryId: 'cat-restaurant',
  name: 'Midi',
  sortOrder: 0,
  ...over,
});

const itype = (over: Partial<IncomeType> = {}): IncomeType => ({
  id: 'it-salaire',
  key: 'Salaire',
  label: 'Salaire',
  order: 0,
  ...over,
});

const isub = (over: Partial<IncomeSubtype> = {}): IncomeSubtype => ({
  id: 'isub-1',
  incomeTypeKey: 'Salaire',
  name: 'Bonus',
  sortOrder: 0,
  ...over,
});

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  kind: 'expense',
  accountId: 'acc-1',
  amount: 12.5,
  date: '2026-07-27',
  createdAt: '2026-07-27T10:00:00.000Z',
  updatedAt: '2026-07-27T10:00:00.000Z',
  ...over,
});

describe('subcategoryLabel', () => {
  it('returns the stored name', () => {
    expect(subcategoryLabel(sub({ name: 'Livraison' }))).toBe('Livraison');
  });

  it('trims surrounding whitespace', () => {
    expect(subcategoryLabel(sub({ name: '  Midi  ' }))).toBe('Midi');
  });
});

describe('categoryWithSubLabel', () => {
  it('renders category(sub-category)', () => {
    expect(categoryWithSubLabel(t, cat(), sub())).toBe('Restaurant(Midi)');
  });

  it('falls back to the bare category label when there is no sub-category', () => {
    expect(categoryWithSubLabel(t, cat(), undefined)).toBe('Restaurant');
  });

  it('uses the category custom name as the left-hand side', () => {
    expect(categoryWithSubLabel(t, cat({ customName: 'Resto' }), sub())).toBe('Resto(Midi)');
    // …and stays consistent with categoryLabel on its own.
    expect(categoryLabel(t, cat({ customName: 'Resto' }))).toBe('Resto');
  });

  it('ignores a sub-category with a blank name rather than printing empty parens', () => {
    expect(categoryWithSubLabel(t, cat(), sub({ name: '   ' }))).toBe('Restaurant');
  });
});

describe('incomeSubtypeLabel', () => {
  it('returns the stored name, trimmed', () => {
    expect(incomeSubtypeLabel(isub({ name: '  Prime  ' }))).toBe('Prime');
  });
});

describe('incomeTypeWithSubLabel', () => {
  it('renders incomeType(sub-type)', () => {
    expect(incomeTypeWithSubLabel(t, itype(), isub())).toBe('Salaire(Bonus)');
  });

  it('falls back to the bare income type when there is no sub-type', () => {
    expect(incomeTypeWithSubLabel(t, itype(), undefined)).toBe('Salaire');
  });

  it('ignores a sub-type with a blank name rather than printing empty parens', () => {
    expect(incomeTypeWithSubLabel(t, itype(), isub({ name: '  ' }))).toBe('Salaire');
  });
});

describe('transactionLabel with sub-categories', () => {
  const categoryById = new Map([[cat().id, cat()]]);
  const subcategoryById = new Map([[sub().id, sub()]]);

  it('appends the sub-category to the category', () => {
    const label = transactionLabel(t, tx({ categoryId: 'cat-restaurant', subcategoryId: 'sub-1' }), {
      categoryById,
      subcategoryById,
    });
    expect(label).toBe('Restaurant(Midi)');
  });

  it('shows the bare category when the transaction has no sub-category', () => {
    const label = transactionLabel(t, tx({ categoryId: 'cat-restaurant' }), {
      categoryById,
      subcategoryById,
    });
    expect(label).toBe('Restaurant');
  });

  it('shows the bare category when the sub-category id no longer resolves', () => {
    const label = transactionLabel(
      t,
      tx({ categoryId: 'cat-restaurant', subcategoryId: 'sub-deleted' }),
      { categoryById, subcategoryById },
    );
    expect(label).toBe('Restaurant');
  });

  it('ignores a sub-category belonging to a different category', () => {
    const stray = new Map([['sub-x', sub({ id: 'sub-x', categoryId: 'cat-courses', name: 'Bio' })]]);
    const label = transactionLabel(t, tx({ categoryId: 'cat-restaurant', subcategoryId: 'sub-x' }), {
      categoryById,
      subcategoryById: stray,
    });
    expect(label).toBe('Restaurant');
  });

  it('still prefers an explicit merchant over the category pair', () => {
    const label = transactionLabel(
      t,
      tx({ categoryId: 'cat-restaurant', subcategoryId: 'sub-1', merchant: 'Le Bistrot' }),
      { categoryById, subcategoryById },
    );
    expect(label).toBe('Le Bistrot');
  });

  it('works when no sub-category map is supplied at all', () => {
    const label = transactionLabel(t, tx({ categoryId: 'cat-restaurant', subcategoryId: 'sub-1' }), {
      categoryById,
    });
    expect(label).toBe('Restaurant');
  });
});

describe('transactionLabel with income sub-types', () => {
  const incomeTypeByKey = new Map([[itype().key, itype()]]);
  const incomeSubtypeById = new Map([[isub().id, isub()]]);
  const income = (over: Partial<Transaction> = {}) =>
    tx({ kind: 'income', categoryId: undefined, incomeType: 'Salaire', ...over });

  it('appends the sub-type to the income type', () => {
    const label = transactionLabel(t, income({ incomeSubtypeId: 'isub-1' }), {
      incomeTypeByKey,
      incomeSubtypeById,
    });
    expect(label).toBe('Salaire(Bonus)');
  });

  it('shows the bare income type when there is no sub-type', () => {
    expect(transactionLabel(t, income(), { incomeTypeByKey, incomeSubtypeById })).toBe('Salaire');
  });

  it('shows the bare income type when the sub-type id no longer resolves', () => {
    const label = transactionLabel(t, income({ incomeSubtypeId: 'isub-gone' }), {
      incomeTypeByKey,
      incomeSubtypeById,
    });
    expect(label).toBe('Salaire');
  });

  it('ignores a sub-type belonging to a different income type', () => {
    const stray = new Map([
      ['isub-x', isub({ id: 'isub-x', incomeTypeKey: 'Cadeau', name: 'Noël' })],
    ]);
    const label = transactionLabel(t, income({ incomeSubtypeId: 'isub-x' }), {
      incomeTypeByKey,
      incomeSubtypeById: stray,
    });
    expect(label).toBe('Salaire');
  });

  it('still prefers an explicit merchant over the income pair', () => {
    const label = transactionLabel(t, income({ incomeSubtypeId: 'isub-1', merchant: 'ACME' }), {
      incomeTypeByKey,
      incomeSubtypeById,
    });
    expect(label).toBe('ACME');
  });

  it('falls back to the raw key when the income type record is unknown', () => {
    const label = transactionLabel(t, income({ incomeType: 'Mystere' }), { incomeTypeByKey });
    expect(label).toBe('Mystere');
  });

  it('pairs a sub-type onto an unknown income type key too', () => {
    const orphanSub = new Map([
      ['isub-y', isub({ id: 'isub-y', incomeTypeKey: 'Mystere', name: 'Part' })],
    ]);
    const label = transactionLabel(t, income({ incomeType: 'Mystere', incomeSubtypeId: 'isub-y' }), {
      incomeTypeByKey,
      incomeSubtypeById: orphanSub,
    });
    expect(label).toBe('Mystere(Part)');
  });
});
