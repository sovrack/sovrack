"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  Loader2,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import api from "@/shared/lib/api";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { useAuth } from "@/features/auth/api/use-auth";
import { getApiErrorMessage } from "@/shared/lib/api";
import { platformConfigService } from "@/features/platform/api/platform-config.service";
import { usersService } from "@/features/users/api/users.service";
import type { PlatformConfigItem } from "@/features/platform/types/platform-config";

const PLATFORM_NAME_KEY = "PLATFORM_NAME";
const WEBHOOK_BASE_URL_KEY = "WEBHOOK_BASE_URL";

type NotifSettings = {
  slackWebhookUrl: string;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  smtpTo: string;
};

type Notice = {
  tone: "success" | "error";
  message: string;
} | null;

export default function SettingsPage() {
  const { user, isAdmin, refreshUser } = useAuth();

  const [notice, setNotice] = useState<Notice>(null);

  const [loadingPlatform, setLoadingPlatform] = useState(false);
  const [savingPlatform, setSavingPlatform] = useState(false);
  const [platformName, setPlatformName] = useState("Deploy Automation");
  const [webhookBaseUrl, setWebhookBaseUrl] = useState("");

  const [notifSettings, setNotifSettings] = useState<NotifSettings>({
    slackWebhookUrl: "",
    notifyOnSuccess: true,
    notifyOnFailure: true,
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    smtpTo: "",
  });
  const [savingNotif, setSavingNotif] = useState(false);

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [savingUserInfo, setSavingUserInfo] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      setPlatformName(map.get(PLATFORM_NAME_KEY)?.value || "Deploy Automation");
      setWebhookBaseUrl(map.get(WEBHOOK_BASE_URL_KEY)?.value || "");
    } catch (error) {
      setNotice({ tone: "error", message: getApiErrorMessage(error) });
    } finally {
      setLoadingPlatform(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadPlatform();
  }, [loadPlatform]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<NotifSettings>("/notifications/settings")
      .then((r) => setNotifSettings(r.data))
      .catch(() => {});
  }, [isAdmin]);

  const handleSaveNotif = async () => {
    setSavingNotif(true);
    try {
      await api.put("/notifications/settings", notifSettings);
      setNotice({ tone: "success", message: "Notification settings saved." });
    } catch (err) {
      setNotice({ tone: "error", message: getApiErrorMessage(err) });
    } finally {
      setSavingNotif(false);
    }
  };

  const canSavePlatform = useMemo(
    () => isAdmin && platformName.trim().length > 0 && !savingPlatform,
    [isAdmin, platformName, savingPlatform],
  );

  const canSaveUserInfo = useMemo(() => {
    if (!user || savingUserInfo) {
      return false;
    }
    return (
      fullName.trim().length > 0 && fullName.trim() !== user.fullName.trim()
    );
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
      // URL publique du backend — utilisée pour construire les URLs de webhook.
      await platformConfigService.update(WEBHOOK_BASE_URL_KEY, {
        value: webhookBaseUrl.trim(),
        isSecret: false,
      });
      setNotice({ tone: "success", message: "Platform identity updated." });
    } catch (error) {
      setNotice({ tone: "error", message: getApiErrorMessage(error) });
    } finally {
      setSavingPlatform(false);
    }
  };

  const handleSaveUserInfo = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!user) {
      return;
    }

    const nextFullName = fullName.trim();
    if (!nextFullName) {
      setNotice({ tone: "error", message: "Full name is required." });
      return;
    }

    setSavingUserInfo(true);
    setNotice(null);
    try {
      await usersService.update(user.id, { fullName: nextFullName });
      await refreshUser();
      setNotice({ tone: "success", message: "User information updated." });
    } catch (error) {
      setNotice({ tone: "error", message: getApiErrorMessage(error) });
    } finally {
      setSavingUserInfo(false);
    }
  };

  const handleChangePassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setNotice({
        tone: "error",
        message: "Password confirmation does not match.",
      });
      return;
    }

    if (newPassword.length < 8) {
      setNotice({
        tone: "error",
        message: "New password must contain at least 8 characters.",
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
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice({ tone: "success", message: "Password updated." });
    } catch (error) {
      setNotice({ tone: "error", message: getApiErrorMessage(error) });
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2
          size={22}
          className="animate-spin text-[var(--text-secondary)]"
        />
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
          title={notice.tone === "success" ? "Success" : "Error"}
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
                Keep this value stable. It is reused across admin screens and
                operational logs.
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

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                URL publique du backend (WEBHOOK_BASE_URL)
              </label>
              <input
                type="url"
                value={webhookBaseUrl}
                onChange={(event) => setWebhookBaseUrl(event.target.value)}
                disabled={loadingPlatform || savingPlatform}
                placeholder="https://api.mondomaine.com  (local : http://localhost:3001)"
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20 disabled:opacity-60"
              />
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                URL where this backend is reachable. Used to build webhook URLs
                (<code>&lt;url&gt;/webhooks/incoming/&lt;token&gt;</code>). For
                GitLab/GitHub to trigger it, it must be <strong>public</strong>;
                locally you can use <code>http://localhost:3001</code> for
                testing.
              </p>
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
        <form
          onSubmit={handleChangePassword}
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
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

      {isAdmin && (
        <SectionCard
          title="Notifications"
          description="Deployment alerts via Slack and SMTP email."
        >
          <div className="space-y-6">
            {/* Slack */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Slack
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-200">
                <Bell size={15} className="shrink-0" />
                <span>Incoming Slack webhook to receive real-time alerts.</span>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                  Slack Webhook URL
                </label>
                <input
                  type="url"
                  value={notifSettings.slackWebhookUrl}
                  onChange={(e) =>
                    setNotifSettings((p) => ({
                      ...p,
                      slackWebhookUrl: e.target.value,
                    }))
                  }
                  placeholder="https://hooks.slack.com/services/..."
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 font-mono text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Leave empty to disable Slack.
                </p>
              </div>
            </div>

            {/* Email SMTP */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Email SMTP
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    SMTP host
                  </label>
                  <input
                    type="text"
                    value={notifSettings.smtpHost}
                    onChange={(e) =>
                      setNotifSettings((p) => ({
                        ...p,
                        smtpHost: e.target.value,
                      }))
                    }
                    placeholder="smtp.gmail.com"
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    Port
                  </label>
                  <input
                    type="number"
                    value={notifSettings.smtpPort}
                    onChange={(e) =>
                      setNotifSettings((p) => ({
                        ...p,
                        smtpPort: parseInt(e.target.value, 10) || 587,
                      }))
                    }
                    placeholder="587"
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    Utilisateur SMTP
                  </label>
                  <input
                    type="text"
                    value={notifSettings.smtpUser}
                    onChange={(e) =>
                      setNotifSettings((p) => ({
                        ...p,
                        smtpUser: e.target.value,
                      }))
                    }
                    placeholder="user@gmail.com"
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    Mot de passe SMTP
                  </label>
                  <input
                    type="password"
                    value={notifSettings.smtpPass}
                    onChange={(e) =>
                      setNotifSettings((p) => ({
                        ...p,
                        smtpPass: e.target.value,
                      }))
                    }
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    Sender (From)
                  </label>
                  <input
                    type="text"
                    value={notifSettings.smtpFrom}
                    onChange={(e) =>
                      setNotifSettings((p) => ({
                        ...p,
                        smtpFrom: e.target.value,
                      }))
                    }
                    placeholder="Sovrack Deploy <noreply@sovrack.tech>"
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                    Destinataire (To)
                  </label>
                  <input
                    type="text"
                    value={notifSettings.smtpTo}
                    onChange={(e) =>
                      setNotifSettings((p) => ({
                        ...p,
                        smtpTo: e.target.value,
                      }))
                    }
                    placeholder="team@sovrack.tech"
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-4 text-sm text-[var(--text-primary)] outline-none transition focus:ring-2 focus:ring-zinc-500/20"
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Leave all SMTP fields empty to disable emails.
              </p>
            </div>

            {/* Triggers */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-secondary)]">
                Triggers
              </p>
              {[
                {
                  key: "notifyOnSuccess" as const,
                  label: "Notify on success",
                  color: "text-green-400",
                },
                {
                  key: "notifyOnFailure" as const,
                  label: "Notify on failure / cancellation",
                  color: "text-red-400",
                },
              ].map(({ key, label, color }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={notifSettings[key]}
                    onChange={(e) =>
                      setNotifSettings((p) => ({
                        ...p,
                        [key]: e.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded accent-current"
                  />
                  <span className={`text-sm font-medium ${color}`}>
                    {label}
                  </span>
                </label>
              ))}
            </div>

            <Button
              onClick={() => void handleSaveNotif()}
              disabled={savingNotif}
              loading={savingNotif}
              icon={savingNotif ? undefined : <Save size={14} />}
            >
              Save notifications
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
