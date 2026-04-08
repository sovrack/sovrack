'use client';

import { useState } from 'react';
import { Trash2, Crown, User } from 'lucide-react';
import clsx from 'clsx';
import type { ProjectMember } from '@/types/project';

type MembersListProps = {
  members: ProjectMember[];
  canManage: boolean;
  currentUserId?: string;
  onRemove?: (userId: string) => Promise<void>;
};

export function MembersList({
  members,
  canManage,
  currentUserId,
  onRemove,
}: MembersListProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (userId: string) => {
    if (!onRemove) return;
    setRemovingId(userId);
    try {
      await onRemove(userId);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {members.map((member) => {
        const isCurrentUser = member.user.id === currentUserId;
        const isOwner = member.role === 'OWNER';

        return (
          <div
            key={member.id}
            className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3"
          >
            {/* Avatar */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white">
              {member.user.fullName.charAt(0).toUpperCase()}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {member.user.fullName}
                  {isCurrentUser && (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                      (you)
                    </span>
                  )}
                </p>
                <span
                  className={clsx(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    isOwner
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {isOwner ? <Crown size={9} /> : <User size={9} />}
                  {member.role}
                </span>
              </div>
              <p className="truncate text-xs text-slate-400">{member.user.email}</p>
            </div>

            {/* Remove button */}
            {canManage && !isCurrentUser && !isOwner && (
              <button
                onClick={() => void handleRemove(member.user.id)}
                disabled={removingId === member.user.id}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                title="Remove member"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
