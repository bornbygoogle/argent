// Transaction write helpers (create / update / delete). All writes round to cents.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import { round2 } from '@/lib/calc';
import { todayISO } from '@/lib/date';
import type { Transaction, TransactionKind } from '@/types/models';

export interface TransactionInput {
  amount: number;
  accountId: string;
  categoryId?: string;
  /** Empty string clears it. Always dropped when the category changes without
   *  a matching sub-category being supplied in the same patch. */
  subcategoryId?: string;
  incomeType?: string;
  /** Empty string clears it. Dropped when the income type changes without a
   *  matching sub-type being supplied in the same patch. */
  incomeSubtypeId?: string;
  merchant?: string;
  note?: string;
  date?: string;
}

function nowISO(): string {
  return new Date().toISOString();
}

export async function addTransaction(
  kind: TransactionKind,
  input: TransactionInput,
): Promise<string> {
  const ts = nowISO();
  const tx: Transaction = {
    id: uid(),
    kind,
    accountId: input.accountId,
    amount: round2(input.amount),
    categoryId: kind === 'expense' ? input.categoryId : undefined,
    // A sub-category only means anything under a category, and only expenses
    // carry one.
    subcategoryId: kind === 'expense' ? input.subcategoryId || undefined : undefined,
    incomeType: kind === 'income' ? input.incomeType : undefined,
    incomeSubtypeId: kind === 'income' ? input.incomeSubtypeId || undefined : undefined,
    merchant: input.merchant?.trim() || undefined,
    note: input.note?.trim() || undefined,
    date: input.date?.trim() || todayISO(),
    createdAt: ts,
    updatedAt: ts,
  };
  await db.transactions.add(tx);
  return tx.id;
}

export async function updateTransaction(
  id: string,
  patch: Partial<TransactionInput>,
): Promise<void> {
  const next: Partial<Transaction> = { updatedAt: nowISO() };
  if (patch.amount !== undefined) next.amount = round2(patch.amount);
  if (patch.accountId !== undefined) next.accountId = patch.accountId;
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;
  // A sub-category is scoped to its category, so moving the category orphans
  // it. Clear it unless this same patch names a replacement.
  if (patch.subcategoryId !== undefined) {
    next.subcategoryId = patch.subcategoryId || undefined;
  } else if (patch.categoryId !== undefined) {
    next.subcategoryId = undefined;
  }
  if (patch.incomeType !== undefined) next.incomeType = patch.incomeType;
  // Same rule as the category side: moving the income type orphans its sub-type.
  if (patch.incomeSubtypeId !== undefined) {
    next.incomeSubtypeId = patch.incomeSubtypeId || undefined;
  } else if (patch.incomeType !== undefined) {
    next.incomeSubtypeId = undefined;
  }
  if (patch.merchant !== undefined) next.merchant = patch.merchant?.trim() || undefined;
  if (patch.note !== undefined) next.note = patch.note?.trim() || undefined;
  if (patch.date !== undefined) next.date = patch.date?.trim() || todayISO();
  await db.transactions.update(id, next);
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
}

export async function getTransaction(id: string): Promise<Transaction | undefined> {
  return db.transactions.get(id);
}

// ---- Transfers (two linked legs sharing a transferGroupId) ----

export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date?: string;
  note?: string;
}

function buildLeg(
  groupId: string,
  role: 'out' | 'in',
  accountId: string,
  counterAccountId: string,
  amount: number,
  date: string,
  note: string | undefined,
  ts: string,
): Transaction {
  return {
    id: uid(),
    kind: 'transfer',
    accountId,
    counterAccountId,
    transferGroupId: groupId,
    transferRole: role,
    amount,
    note,
    date,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Create both legs of a transfer atomically. Returns the transferGroupId. */
export async function addTransfer(input: TransferInput): Promise<string> {
  if (!input.fromAccountId || !input.toAccountId) {
    throw new Error('Transfer requires both accounts');
  }
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('Transfer source and destination must differ');
  }
  const groupId = uid();
  const ts = nowISO();
  const amount = round2(input.amount);
  const date = input.date?.trim() || todayISO();
  const note = input.note?.trim() || undefined;
  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.bulkAdd([
      buildLeg(groupId, 'out', input.fromAccountId, input.toAccountId, amount, date, note, ts),
      buildLeg(groupId, 'in', input.toAccountId, input.fromAccountId, amount, date, note, ts),
    ]);
  });
  return groupId;
}

/** Both legs of a transfer by its group id (empty if none). */
export async function getTransfer(groupId: string): Promise<Transaction[]> {
  return db.transactions.where('transferGroupId').equals(groupId).toArray();
}

/** Patch both legs atomically. Account swaps, amount, date, note all supported. */
export async function updateTransfer(
  groupId: string,
  patch: Partial<TransferInput>,
): Promise<void> {
  const legs = await getTransfer(groupId);
  const out = legs.find((l) => l.transferRole === 'out');
  const inn = legs.find((l) => l.transferRole === 'in');
  if (!out || !inn) return;

  const fromId = patch.fromAccountId ?? out.accountId;
  const toId = patch.toAccountId ?? inn.accountId;
  if (fromId === toId) throw new Error('Transfer source and destination must differ');

  const ts = nowISO();
  const amount = patch.amount !== undefined ? round2(patch.amount) : out.amount;
  const date = patch.date !== undefined ? patch.date.trim() || todayISO() : out.date;
  const note = patch.note !== undefined ? patch.note.trim() || undefined : out.note;

  await db.transaction('rw', db.transactions, async () => {
    await db.transactions.update(out.id, {
      accountId: fromId,
      counterAccountId: toId,
      amount,
      date,
      note,
      updatedAt: ts,
    });
    await db.transactions.update(inn.id, {
      accountId: toId,
      counterAccountId: fromId,
      amount,
      date,
      note,
      updatedAt: ts,
    });
  });
}

/** Delete both legs of a transfer. */
export async function deleteTransfer(groupId: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const legs = await db.transactions.where('transferGroupId').equals(groupId).toArray();
    await db.transactions.bulkDelete(legs.map((l) => l.id));
  });
}
