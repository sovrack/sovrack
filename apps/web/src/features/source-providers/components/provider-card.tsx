"use client";

import { useState } from "react";
import clsx from "clsx";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Key,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Shield,
  Star,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { GitlabProvider } from "@/features/platform";
import { PROVIDER_META, ProviderLogo } from "./provider-meta";

/* ─── Badge helpers ────────────────────────────────────────────────────── */

function Chip({
  children,
  color = "default",
}: {
  children: React.ReactNode;
  color?: "green" | "amber" | "red" | "blue" | "purple" | "default";
}) {
  const map = {
    green: "border-green-500/20 bg-green-500/10 text-green-400",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    red: "border-red-500/20 bg-red-500/10 text-red-400",
    blue: "border-accent/20 bg-accent/10 text-accent",
    purple: "border-accent/20 bg-accent/10 text-accent",
    default:
      "border-border bg-hover/10 text-secondary",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        map[color],
      )}
    >
      {children}
    </span>
  );
}

function StatusSection({ provider }: { provider: GitlabProvider }) {
  const isOAuthExpired =
    provider.oauthTokenConfigured &&
    provider.oauthExpiresAt &&
    new Date(provider.oauthExpiresAt) < new Date();

  return (
    <div className="flex flex-wrap gap-1.5">
      {/* Overall status */}
      {provider.status === "CONFIGURED" && (
        <Chip color="green">
          <CheckCircle2 size={9} /> Connecté
        </Chip>
      )}
      {provider.status === "ACTION_REQUIRED" && (
        <Chip color="amber">Action requise</Chip>
      )}
      {provider.status === "NOT_CONFIGURED" && (
        <Chip color="default">Non configuré</Chip>
      )}

      {/* Default */}
      {provider.isDefault && (
        <Chip color="purple">
          <Star size={9} /> Par défaut
        </Chip>
      )}

      {/* Auth methods */}
      {provider.oauthTokenConfigured && !isOAuthExpired && (
        <Chip color="blue">
          <Shield size={9} /> OAuth
        </Chip>
      )}
      {isOAuthExpired && (
        <Chip color="red">
          <Shield size={9} /> OAuth expiré
        </Chip>
      )}
      {provider.adminTokenConfigured && (
        <Chip color="default">
          <Key size={9} /> PAT
        </Chip>
      )}

      {/* Self-hosted */}
      {provider.providerUrl !==
        PROVIDER_META[
          (provider.providerType as import("./provider-meta").ProviderType) ??
            "GITLAB"
        ]?.defaultUrl && <Chip color="default">Auto-hébergé</Chip>}
    </div>
  );
}

function CapabilitiesRow() {
  const meta = PROVIDER_META.GITLAB;
  return (
    <div className="flex flex-wrap gap-1">
      {meta.capabilities.map((cap) => (
        <span
          key={cap}
          className="rounded border border-border bg-hover/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted"
        >
          {cap}
        </span>
      ))}
    </div>
  );
}

function formatExpiry(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `Expire le ${d.toLocaleDateString("fr-FR", { month: "short", day: "numeric", year: "numeric" })}`;
}

/* ─── Main card ─────────────────────────────────────────────────────────── */

type CardProps = {
  provider: GitlabProvider;
  onEdit: (p: GitlabProvider) => void;
  onDelete: (p: GitlabProvider) => void;
  onTest: (id: string) => Promise<void>;
  onOAuth: (id: string) => Promise<void>;
  onSetDefault: (id: string) => Promise<void>;
  isAdmin: boolean;
  runningTestId: string | null;
  runningOAuthId: string | null;
  runningDefaultId: string | null;
};

export function ProviderCard({
  provider,
  onEdit,
  onDelete,
  onTest,
  onOAuth,
  onSetDefault,
  isAdmin,
  runningTestId,
  runningOAuthId,
  runningDefaultId,
}: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const testingThis = runningTestId === provider.id;
  const oauthingThis = runningOAuthId === provider.id;
  const defaultingThis = runningDefaultId === provider.id;

  const providerType =
    (provider.providerType as
      import("./provider-meta").ProviderType | undefined) ?? "GITLAB";
  const meta = PROVIDER_META[providerType] ?? PROVIDER_META.GITLAB;
  const defaultUrl = meta.defaultUrl;
  const isSelfHosted = provider.providerUrl !== defaultUrl;
  const oauthReady = Boolean(
    provider.applicationId && provider.applicationSecretConfigured,
  );
  const isOAuthExpired =
    provider.oauthTokenConfigured &&
    provider.oauthExpiresAt &&
    new Date(provider.oauthExpiresAt) < new Date();

  return (
    <article className="group relative rounded-lg border border-border bg-card transition-colors hover:border-border-hover">
      {/* ─── Top strip: logo + name + status + actions ─── */}
      <div className="flex items-start gap-4 p-5">
        {/* Logo */}
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${meta.borderColor} ${meta.bgColor}`}
        >
          <ProviderLogo
            type={providerType as import("./provider-meta").ProviderType}
            className={`h-6 w-6 ${meta.color}`}
          />
        </div>

        {/* Name + URL + status */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-primary">
              {provider.name}
            </h3>
            <span className="text-xs text-muted">
              {meta.label}
            </span>
          </div>

          <a
            href={provider.providerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 flex items-center gap-1 font-mono text-xs text-secondary hover:text-primary transition-colors"
          >
            {provider.providerUrl}
            <ExternalLink size={10} />
          </a>

          <div className="mt-2">
            <StatusSection provider={provider} />
          </div>
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-1">
            {/* Test connection */}
            <button
              type="button"
              onClick={() => void onTest(provider.id)}
              disabled={testingThis}
              title="Tester la connexion"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-secondary transition hover:border-green-500/30 hover:bg-green-500/10 hover:text-green-400 disabled:opacity-40"
            >
              {testingThis ? (
                <Loader2 size={13} className="animate-spin" />
              ) : provider.status === "CONFIGURED" ? (
                <Wifi size={13} />
              ) : (
                <WifiOff size={13} />
              )}
            </button>

            {/* OAuth connect / reconnect */}
            {oauthReady && (
              <button
                type="button"
                onClick={() => void onOAuth(provider.id)}
                disabled={oauthingThis}
                title={
                  provider.oauthTokenConfigured
                    ? isOAuthExpired
                      ? "Reconnecter OAuth"
                      : "Actualiser OAuth"
                    : "Connecter avec OAuth"
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-secondary transition hover:border-accent/30 hover:bg-accent/10 hover:text-accent disabled:opacity-40"
              >
                {oauthingThis ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RefreshCw size={13} />
                )}
              </button>
            )}

            {/* More menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-secondary transition hover:bg-hover/10 hover:text-primary"
              >
                <MoreHorizontal size={13} />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-9 z-20 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card py-1 ">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(provider);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-secondary transition hover:bg-hover/10 hover:text-primary"
                    >
                      <Pencil size={13} /> Modifier
                    </button>

                    {!provider.isDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          void onSetDefault(provider.id);
                        }}
                        disabled={defaultingThis}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-secondary transition hover:bg-hover/10 hover:text-primary disabled:opacity-40"
                      >
                        {defaultingThis ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Star size={13} />
                        )}
                        Définir par défaut
                      </button>
                    )}

                    <div className="my-1 border-t border-border" />

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(provider);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
                    >
                      <Trash2 size={13} /> Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Auth methods summary row ─── */}
      <div className="border-t border-border px-5 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
          {providerType === "GITLAB" && (
            <span className="flex items-center gap-1.5">
              <Shield
                size={11}
                className={provider.applicationId ? "text-accent" : ""}
              />
              OAuth
              {provider.applicationId ? (
                <span className="text-secondary">
                  — application configurée
                </span>
              ) : (
                <span className="opacity-50">— non configurée</span>
              )}
              {provider.oauthTokenConfigured && !isOAuthExpired && (
                <span className="text-green-400">· Actif</span>
              )}
              {isOAuthExpired && <span className="text-red-400">· Expiré</span>}
              {provider.oauthExpiresAt && (
                <span className="opacity-50">
                  {formatExpiry(provider.oauthExpiresAt)}
                </span>
              )}
            </span>
          )}

          <span className="flex items-center gap-1.5">
            <Key
              size={11}
              className={provider.adminTokenConfigured ? "text-green-400" : ""}
            />
            PAT
            {provider.adminTokenConfigured ? (
              <span className="text-green-400">· Configuré</span>
            ) : (
              <span className="opacity-50">— absent</span>
            )}
          </span>

          {isSelfHosted && provider.internalUrl && (
            <span className="flex items-center gap-1.5">
              URL interne :
              <span className="font-mono text-secondary">
                {provider.internalUrl}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* ─── Expandable details ─── */}
      <div className="border-t border-border">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-2.5 text-xs text-muted transition hover:text-secondary"
        >
          <span>Capacités et détails</span>
          {detailsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {detailsOpen && (
          <div className="border-t border-border px-5 pb-4 pt-3 space-y-3">
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
                Capacités
              </p>
              <CapabilitiesRow />
            </div>

            {provider.groupNames && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Groupes autorisés
                </p>
                <p className="font-mono text-xs text-secondary">
                  {provider.groupNames}
                </p>
              </div>
            )}

            {provider.redirectUri && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  OAuth Redirect URI
                </p>
                <p className="break-all font-mono text-xs text-secondary">
                  {provider.redirectUri}
                </p>
              </div>
            )}

            <div className="flex items-center gap-4 text-[10px] text-muted">
              <span>
                ID:{" "}
                <span className="font-mono">{provider.id.slice(0, 8)}…</span>
              </span>
              <span>
                Ajouté le{" "}
                {new Date(provider.createdAt).toLocaleDateString("fr-FR")}
              </span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
