// Account write helpers.
import { db } from '@/db/db';
import { uid } from '@/lib/id';
import { ACCOUNT_TYPE_DEFAULTS } from '@/db/seed';
import type { Account, AccountType, Transaction } from '@/types/models';

export interface NewAccountInput {
  name: string;
  type: AccountType;
  openingBalance: number;
}

function nowISO(): string {
  return new Date().toISOString();
}

/** Create an account at the end of the order list. Color/icon derived from type. */
export async function createAccount(input: NewAccountInput): Promise<string> {
  const count = await db.accounts.count();
  const defaults = ACCOUNT_TYPE_DEFAULTS[input.type];
  const account: Account = {
    id: uid(),
    name: input.name.trim() || input.type,
    type: input.type,
    color: defaults.color,
    icon: defaults.icon,
    openingBalance: Number.isFinite(input.openingBalance) ? input.openingBalance : 0,
    order: count, // append
    archived: false,
    createdAt: nowISO(),
  };
  await db.accounts.add(account);
  return account.id;
}

export interface AccountPatch {
  name?: string;
  type?: AccountType;
  openingBalance?: number;
}

/** Edit an account's name/type/opening balance. Color/icon follow the type. */
export async function updateAccount(id: string, patch: AccountPatch): Promise<void> {
  const next: Partial<Account> = {};
  if (patch.name !== undefined) next.name = patch.name.trim() || 'Account';
  if (patch.type !== undefined) {
    next.type = patch.type;
    const d = ACCOUNT_TYPE_DEFAULTS[patch.type];
    next.color = d.color;
    next.icon = d.icon;
  }
  if (patch.openingBalance !== undefined && Number.isFinite(patch.openingBalance)) {
    next.openingBalance = patch.openingBalance;
  }
  await db.accounts.update(id, next);
}

/** Toggle the archived flag (archived accounts are hidden from balances & switcher). */
export async function setAccountArchived(id: string, archived: boolean): Promise<void> {
  await db.accounts.update(id, { archived });
}

/** Permanently delete an account, reassigning every movement to `reassignToId` and
 *  merging the deleted account's opening balance into it (net worth preserved).
 *  Transfers whose two legs collapse onto the same account are removed (meaningless). */
export async function deleteAccountWithReassign(
  id: string,
  reassignToId: string,
): Promise<void> {
  if (id === reassignToId) throw new Error('Cannot reassign an account to itself');

  await db.transaction('rw', db.accounts, db.transactions, db.recurrings, db.budgets, async () => {
    const acct = await db.accounts.get(id);
    if (!acct) return;
    const target = await db.accounts.get(reassignToId);

    // 1. Merge opening balance so totals don't shift.
    if (target) {
      await db.accounts.update(reassignToId, {
        openingBalance: target.openingBalance + acct.openingBalance,
      });
    }

    // 2. Reassign this account's transactions to the target.
    const mine = await db.transactions.where('accountId').equals(id).toArray();
    for (const t of mine) {
      await db.transactions.update(t.id, {
        accountId: reassignToId,
        counterAccountId: t.counterAccountId === id ? reassignToId : t.counterAccountId,
      });
    }

    // 3. Collapse transfers now sitting on both legs of the target account.
    const onTarget = await db.transactions.where('accountId').equals(reassignToId).toArray();
    const byGroup = new Map<string, Transaction[]>();
    for (const t of onTarget) {
      if (t.kind === 'transfer' && t.counterAccountId === reassignToId && t.transferGroupId) {
        const arr = byGroup.get(t.transferGroupId) ?? [];
        arr.push(t);
        byGroup.set(t.transferGroupId, arr);
      }
    }
    for (const legs of byGroup.values()) {
      if (legs.length >= 2) await db.transactions.bulkDelete(legs.map((l) => l.id));
    }

    // 4. Move recurrings; the target keeps its own budget, so drop this one's.
    await db.recurrings.where('accountId').equals(id).modify({ accountId: reassignToId });
    await db.budgets.where('accountId').equals(id).delete();

    // 5. Remove the account.
    await db.accounts.delete(id);
  });
}
