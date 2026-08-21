"use client";

import { useState } from "react";
import { KeyRound, Languages, Loader2, Moon, Sun, Trash2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/api/use-auth";
import { useAuthStore } from "@/stores/auth.store";
import { usersService } from "@/features/users/api/users.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Alert } from "@/shared/ui/alert";
import { PasswordInput } from "@/shared/ui/password-input";
import { useI18n } from "@/shared/i18n/language-context";
import { useThemeContext } from "@/shared/contexts/theme-context";

/**
 * Réglages personnels, accessibles à tous les membres d'un workspace.
 * Les intégrations sont configurées dans leur workspace et l'administration
 * globale de la plateforme reste strictement séparée dans le back-office staff.
 */
export default function MyAccountPage() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useThemeContext();
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
    if (newPassword.length < 8) {
      setNotice({
        tone: "error",
        message: t("New password must contain at least 8 characters."),
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

  const handleConfirmDeletion = async (event: React.FormEvent<HTMLFormElement>) => {
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
              {user?.email} · {workspaceRole ?? "MEMBER"}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Change password")}
        description={t("Minimum 8 characters.")}
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
        description={t("Language and appearance, saved on this browser.")}
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "fr" : "en")}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
          >
            <Languages size={14} />{" "}
            {lang === "en" ? "Français" : "English"}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--hover)]"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}{" "}
            {theme === "dark" ? t("Light theme") : t("Dark theme")}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title={t("Danger zone")}
        description={t(
          "Delete your identity and leave your workspaces. Workspace resources are preserved. This cannot be undone.",
        )}
      >
        {!codeSent ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--text-secondary)]">
              {t(
                "A confirmation code will be sent to your email before the deletion.",
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
              {t("Delete my account")}
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
              {t("Confirm deletion")}
            </button>
          </form>
        )}
      </SectionCard>
    </div>
  );
}
