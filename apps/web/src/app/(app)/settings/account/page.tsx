"use client";

import { useState } from "react";
import { KeyRound, Languages, Loader2, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/features/auth/api/use-auth";
import { usersService } from "@/features/users/api/users.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import { PageHeader } from "@/shared/layout/page-header";
import { SectionCard } from "@/shared/layout/section-card";
import { Alert } from "@/shared/ui/alert";
import { useI18n } from "@/shared/i18n/language-context";
import { useThemeContext } from "@/shared/contexts/theme-context";

const inputClass =
  "mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--text-muted)]";
const labelClass =
  "block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]";

/**
 * LOT2b (décision utilisateur) : page de réglages PERSONNELS, accessible à
 * TOUS les rôles — mot de passe, langue, thème. Les réglages PLATEFORME
 * (identité, webhook, config) restent sur /settings, réservés aux admins.
 * Avant : tout était mélangé sur /settings avec un gating isAdmin interne, et
 * un développeur n'avait aucune entrée de menu pour changer son mot de passe.
 */
export default function MyAccountPage() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggleTheme } = useThemeContext();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

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
              {user?.email} · {user?.role}
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
            <label className={labelClass} htmlFor="cur-pw">
              {t("Current password")}
            </label>
            <input
              id="cur-pw"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="new-pw">
              {t("New password")}
            </label>
            <input
              id="new-pw"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="conf-pw">
              {t("Confirm new password")}
            </label>
            <input
              id="conf-pw"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
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
    </div>
  );
}
