"use client";

import { useState } from "react";
import {
  KeyRound,
  Loader2,
  Moon,
  Palette,
  Sun,
  Trash2,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/api/use-auth";
import { useAuthStore } from "@/stores/auth.store";
import { usersService } from "@/features/users/api/users.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import {
  SOVRACK_PASSWORD_MAX_LENGTH,
  SOVRACK_PASSWORD_MIN_LENGTH,
  isSovrackPassword,
} from "@/shared/lib/password-policy";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Alert } from "@/shared/ui/alert";
import { PasswordInput } from "@/shared/ui/password-input";
import { useI18n } from "@/shared/i18n/language-context";
import { useThemeContext } from "@/shared/contexts/theme-context";
import { CustomerMfaSettings } from "@/features/auth/components/customer-mfa-settings";
import { workspaceRoleLabel } from "@/shared/i18n/product-labels";

/**
 * Réglages personnels, accessibles à tous les membres d'un workspace.
 * Les intégrations sont configurées dans leur workspace et l'administration
 * globale de la plateforme reste strictement séparée dans le back-office staff.
 */
export default function MyAccountPage() {
  const { t } = useI18n();
  const { theme, setTheme } = useThemeContext();
  const { user, workspaceRole } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");

  const handleChangePassword = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setNotice({
        tone: "error",
        message: t("Password confirmation does not match."),
      });
      return;
    }
    if (!isSovrackPassword(newPassword)) {
      setNotice({
        tone: "error",
        message: t(
          "Password must contain 12 to 128 characters, an uppercase letter, a lowercase letter and a digit.",
        ),
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
      setNotice({ tone: "success", message: t("Password updated.") });
    } catch (error) {
      setNotice({ tone: "error", message: getApiErrorMessage(error) });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRequestDeletion = async () => {
    setDeleting(true);
    setNotice(null);
    try {
      await useAuthStore.getState().requestAccountDeletion();
      setCodeSent(true);
      setNotice({
        tone: "success",
        message: t(
          "A confirmation code has been sent to your email. Enter it below.",
        ),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: getApiErrorMessage(error) || t("Unable to request deletion."),
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDeletion = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (deleteCode.length !== 6) {
      setNotice({
        tone: "error",
        message: t("Enter the 6-digit confirmation code."),
      });
      return;
    }
    setDeleting(true);
    setNotice(null);
    try {
      await useAuthStore.getState().confirmAccountDeletion(deleteCode);
      router.replace("/");
    } catch (error) {
      setNotice({
        tone: "error",
        message: getApiErrorMessage(error) || t("Invalid or expired code."),
      });
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title={t("My Account")}
        description={t("Your personal settings — password, language, theme.")}
      />

      {notice && (
        <Alert tone={notice.tone} title={notice.message}>
          {null}
        </Alert>
      )}

      <SectionCard
        title={t("Profile")}
        description={t("Connected user information.")}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--text-primary)] text-xs font-bold text-[var(--bg-app)]">
            <User size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {user?.fullName}
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              {user?.email} · {workspaceRoleLabel(workspaceRole)}
            </p>
          </div>
        </div>
      </SectionCard>

      <CustomerMfaSettings />

      <SectionCard
        title={t("Change password")}
        description={t(
          "12 to 128 characters, with uppercase, lowercase and a digit.",
        )}
      >
        <form
          onSubmit={(e) => void handleChangePassword(e)}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <div>
            <PasswordInput
              id="cur-pw"
              label={t("Current password")}
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <PasswordInput
              id="new-pw"
              label={t("New password")}
              required
              autoComplete="new-password"
              minLength={SOVRACK_PASSWORD_MIN_LENGTH}
              maxLength={SOVRACK_PASSWORD_MAX_LENGTH}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <PasswordInput
              id="conf-pw"
              label={t("Confirm new password")}
              required
              autoComplete="new-password"
              minLength={SOVRACK_PASSWORD_MIN_LENGTH}
              maxLength={SOVRACK_PASSWORD_MAX_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--text-primary)] px-4 py-2 text-sm font-semibold text-[var(--bg-app)] transition hover:opacity-90 disabled:opacity-50"
            >
              {savingPassword ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <KeyRound size={14} />
              )}{" "}
              {t("Update password")}
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title={t("Preferences")}
        description="Apparence enregistrée dans ce navigateur."
      >
        <div className="flex flex-wrap items-center gap-3">
          {[
            { id: "brand" as const, label: "Sovrack", icon: Palette },
            { id: "dark" as const, label: t("Dark theme"), icon: Moon },
            { id: "light" as const, label: t("Light theme"), icon: Sun },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={theme === id}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                theme === id
                  ? "border-sky-400 bg-sky-400/10 text-[var(--text-primary)]"
                  : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:bg-[var(--hover)]"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={t("Danger zone")}
        description={t(
          "Schedule deletion of your identity after a 30-day recovery period.",
        )}
      >
        {!codeSent ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              {t(
                "A confirmation code will be sent by email. Confirmation immediately signs you out and disables access. Organizations are preserved; your personal workspace is deleted after 30 days. Transfer ownership first if you are the last owner of an organization.",
              )}
            </p>
            <button
              type="button"
              onClick={() => void handleRequestDeletion()}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}{" "}
              {t("Schedule account deletion")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleConfirmDeletion(e)}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="w-full sm:max-w-xs">
              <label
                className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                htmlFor="delete-code"
              >
                {t("Confirmation code")}
              </label>
              <input
                id="delete-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={deleteCode}
                onChange={(e) =>
                  setDeleteCode(e.target.value.replace(/\D/g, ""))
                }
                placeholder="123456"
                className="mt-1 w-full rounded-xl border border-red-500/40 bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-red-500/60"
              />
            </div>
            <button
              type="submit"
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}{" "}
              {t("Confirm and start 30-day grace period")}
            </button>
          </form>
        )}
      </SectionCard>
    </div>
  );
}
