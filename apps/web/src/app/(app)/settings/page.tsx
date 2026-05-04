'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Save, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/layout/section-card';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/api';
import { platformConfigService } from '@/services/platform-config.service';
import { usersService } from '@/services/users.service';
import type { PlatformConfigItem } from '@/types/platform-config';

const PLATFORM_NAME_KEY = 'PLATFORM_NAME';

type Notice = {
  tone: 'success' | 'error';
  message: string;
} | null;

export default function SettingsPage() {
  const { user, isAdmin, refreshUser } = useAuth();

  const [notice, setNotice] = useState<Notice>(null);

  const [loadingPlatform, setLoadingPlatform] = useState(false);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [platformName, setPlatformName] = useState('Deploy Automation');

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [savingUserInfo, setSavingUserInfo] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user?.fullName) {
      setFullName(user.fullName);
    }
  }, [user?.fullName]);

  const loadPlatform = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    setLoadingPlatform(true);
    try {
      const rows = await platformConfigService.getAll();
      const map = new Map<string, PlatformConfigItem>(
        rows.map((item) => [item.key, item]),
      );
      setPlatformName(map.get(PLATFORM_NAME_KEY)?.value || 'Deploy Automation');
    } catch (error) {
      setNotice({ tone: 'error', message: getApiErrorMessage(error) });
    } finally {
      setLoadingPlatform(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadPlatform();
  }, [loadPlatform]);

  const canSavePlatform = useMemo(
    () => isAdmin && platformName.trim().length > 0 && !savingPlatform,
    [isAdmin, platformName, savingPlatform],
  );

  const canSaveUserInfo = useMemo(() => {
    if (!user || savingUserInfo) {
      return false;
    }
    return fullName.trim().length > 0 && fullName.trim() !== user.fullName.trim();
  }, [fullName, savingUserInfo, user]);

  const canSavePassword = useMemo(() => {
    if (savingPassword) {
      return false;
    }
    return (
      currentPassword.length > 0 &&
      newPassword.length >= 8 &&
      confirmPassword.length > 0
    );
  }, [confirmPassword, currentPassword, newPassword, savingPassword]);

  const handleSavePlatform = async () => {
    if (!canSavePlatform) {
      return;
    }

    setSavingPlatform(true);
    setNotice(null);
    try {
      await platformConfigService.update(PLATFORM_NAME_KEY, {
        value: platformName.trim(),
        isSecret: false,
      });
      setNotice({ tone: 'success', message: 'Platform identity updated.' });
    } catch (error) {
      setNotice({ tone: 'error', message: getApiErrorMessage(error) });
    } finally {
      setSavingPlatform(false);
    }
  };

  const handleSaveUserInfo = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      return;
    }

    const nextFullName = fullName.trim();
    if (!nextFullName) {
      setNotice({ tone: 'error', message: 'Full name is required.' });
      return;
    }

    setSavingUserInfo(true);
    setNotice(null);
    try {
      await usersService.update(user.id, { fullName: nextFullName });
      await refreshUser();
      setNotice({ tone: 'success', message: 'User information updated.' });
    } catch (error) {
      setNotice({ tone: 'error', message: getApiErrorMessage(error) });
    } finally {
      setSavingUserInfo(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setNotice({
        tone: 'error',
        message: 'Password confirmation does not match.',
      });
      return;
    }

    if (newPassword.length < 8) {
      setNotice({
        tone: 'error',
        message: 'New password must contain at least 8 characters.',
      });
      return;
    }

    setSavingPassword(true);
    setNotice(null);
    try {
      await usersService.changeMyPassword({
        currentPassword,
        newPassword,
        confirmNewPassword: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice({ tone: 'success', message: 'Password updated.' });
    } catch (error) {
      setNotice({ tone: 'error', message: getApiErrorMessage(error) });
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Platform Settings"
        description="Unified settings for platform identity, security, and connected user information."
      />

      {notice && (
        <Alert
          tone={notice.tone}
          title={notice.tone === 'success' ? 'Success' : 'Error'}
        >
          {notice.message}
        </Alert>
      )}

      {isAdmin && (
        <SectionCard
          title="Platform"
          description="Global platform identity and naming. This section is visible to administrators only."
        >
          <div className="space-y-4">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
              <div className="flex items-center gap-2 font-semibold text-blue-100">
                <Building2 size={15} />
                Platform identity
              </div>
              <p className="mt-1">
                Keep this value stable. It is reused across admin screens and operational logs.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Platform name
              </label>
              <input
                type="text"
                value={platformName}
                onChange={(event) => setPlatformName(event.target.value)}
                disabled={loadingPlatform || savingPlatform}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
              />
            </div>

            <Button
              onClick={() => void handleSavePlatform()}
              disabled={!canSavePlatform}
              loading={savingPlatform}
              icon={savingPlatform ? undefined : <Save size={14} />}
            >
              Save Platform
            </Button>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="Security"
        description="Update your session security by changing your password."
      >
        <form onSubmit={handleChangePassword} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Current password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
            />
          </div>

          <div className="lg:col-span-3">
            <Button
              type="submit"
              disabled={!canSavePassword}
              loading={savingPassword}
              icon={savingPassword ? undefined : <ShieldCheck size={14} />}
            >
              Change Password
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Minimal User Info"
        description="Core information for the connected user session."
      >
        <form onSubmit={handleSaveUserInfo} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Email
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 text-sm text-[var(--text-secondary)]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Role
              </label>
              <input
                type="text"
                value={user.role}
                disabled
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 text-sm text-[var(--text-secondary)]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={!canSaveUserInfo}
            loading={savingUserInfo}
            icon={savingUserInfo ? undefined : <UserRound size={14} />}
          >
            Save User Info
          </Button>
        </form>
      </SectionCard>
    </div>
  );
}
