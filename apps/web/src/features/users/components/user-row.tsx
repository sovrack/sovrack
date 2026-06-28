'use client';

import Link from 'next/link';
import { Loader2, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { formatDate } from '@/shared/lib/format-date';
import type { UserListItem } from '@/features/users/types/user';

/** Ligne du tableau utilisateurs (admin). Présentationnel — actions via callbacks. */
export function UserRow({
  user,
  onToggleActive,
  onDelete,
  togglingId,
  deletingUserId,
}: {
  user: UserListItem;
  onToggleActive: (id: string) => void;
  onDelete: (user: UserListItem) => void;
  togglingId: string | null;
  deletingUserId: string | null;
}) {
  return (
    <tr className="hover:bg-[var(--hover)]">
      <td className="px-4 py-3 text-[var(--text-primary)]">{user.fullName}</td>
      <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
        {user.email}
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded-full border border-zinc-500/20 bg-[var(--text-primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-muted)]">
          {user.role}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            user.isActive
              ? 'border border-green-500/20 bg-green-500/10 text-green-400'
              : 'border border-zinc-500/20 bg-[var(--text-primary)]/10 text-[var(--text-muted)]'
          }`}
        >
          {user.isActive ? 'Actif' : 'Inactif'}
        </span>
      </td>
      <td className="px-4 py-3 text-[var(--text-secondary)]">
        {formatDate(user.createdAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <Link
            href={`/admin/users/${user.id}/edit`}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
          >
            <Pencil size={13} />
            Edit
          </Link>
          <button type="button"
            onClick={() => onToggleActive(user.id)}
            disabled={togglingId === user.id}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--hover)] disabled:opacity-50"
          >
            {togglingId === user.id ? (
              <Loader2 size={13} className="animate-spin" />
            ) : user.isActive ? (
              <UserMinus size={13} />
            ) : (
              <UserPlus size={13} />
            )}
            {user.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button type="button"
            onClick={() => onDelete(user)}
            disabled={deletingUserId === user.id}
            className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
          >
            {deletingUserId === user.id ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Trash2 size={13} />
            )}
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
