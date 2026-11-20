import type { ReactNode } from "react";

export type ProviderType = "GITLAB" | "GITHUB" | "BITBUCKET";

export type ProviderCapability =
  "OAuth" | "PAT" | "Groups" | "Registry" | "Webhooks" | "CICD" | "SelfHosted";

export type ProviderMeta = {
  type: ProviderType;
  label: string;
  tagline: string;
  defaultUrl: string;
  color: string;
  bgColor: string;
  borderColor: string;
  capabilities: ProviderCapability[];
  available: boolean;
  badge?: string;
};

export const PROVIDER_META: Record<ProviderType, ProviderMeta> = {
  GITLAB: {
    type: "GITLAB",
    label: "GitLab",
    tagline: "DevSecOps platform",
    defaultUrl: "https://gitlab.com",
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "border-accent/20",
    capabilities: [
      "OAuth",
      "PAT",
      "Groups",
      "Registry",
      "Webhooks",
      "CICD",
      "SelfHosted",
    ],
    available: true,
  },
  GITHUB: {
    type: "GITHUB",
    label: "GitHub",
    tagline: "Code hosting platform",
    defaultUrl: "https://github.com",
    color: "text-secondary",
    bgColor: "bg-hover/10",
    borderColor: "border-border",
    capabilities: ["PAT", "Webhooks", "CICD", "SelfHosted"],
    available: true,
  },
  BITBUCKET: {
    type: "BITBUCKET",
    label: "Bitbucket",
    tagline: "Atlassian Git platform",
    defaultUrl: "https://bitbucket.org",
    color: "text-accent",
    bgColor: "bg-accent/10",
    borderColor: "border-accent/20",
    capabilities: ["OAuth", "PAT", "Webhooks", "CICD"],
    available: false,
  },
};

/* ─── SVG Logos ─────────────────────────────────────────────────────────── */

export function GitLabLogo({
  className = "h-5 w-5",
}: {
  className?: string;
}): ReactNode {
  return (
    <svg viewBox="0 0 380 380" className={className} fill="none">
      <path
        d="M282.83 170.73l-.27-.69-26.14-68.22a6.81 6.81 0 00-2.69-3.24 7 7 0 00-8 .43 7 7 0 00-2.32 3.52l-17.65 54H154.29l-17.65-54a6.86 6.86 0 00-2.32-3.52 7 7 0 00-8-.43 6.85 6.85 0 00-2.69 3.24L97.44 170l-.26.69a48.54 48.54 0 0016.1 56.1l.09.07.24.17 39.82 29.82 19.7 14.91 12 9.06a8.07 8.07 0 009.76 0l12-9.06 19.7-14.91 40.06-30 .1-.08a48.56 48.56 0 0016.08-56.04z"
        fill="#E24329"
      />
      <path
        d="M282.83 170.73l-.27-.69a88.3 88.3 0 00-35.15 15.8L190 229.25c19.55 14.79 36.57 27.64 36.57 27.64l40.06-30 .1-.08a48.56 48.56 0 0016.1-56.08z"
        fill="#FC6D26"
      />
      <path
        d="M153.43 256.89l19.7 14.91 12 9.06a8.07 8.07 0 009.76 0l12-9.06 19.7-14.91S209.55 244 190 229.25c-19.55 14.79-36.57 27.64-36.57 27.64z"
        fill="#FCA326"
      />
      <path
        d="M132.58 185.84A88.19 88.19 0 0097.44 170l-.26.69a48.54 48.54 0 0016.1 56.1l.09.07.24.17 39.82 29.82s17-12.85 36.57-27.64z"
        fill="#FC6D26"
      />
    </svg>
  );
}

export function GitHubLogo({
  className = "h-5 w-5",
}: {
  className?: string;
}): ReactNode {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export function BitbucketLogo({
  className = "h-5 w-5",
}: {
  className?: string;
}): ReactNode {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="currentColor">
      <path d="M.778 1.213a.768.768 0 00-.768.892l4.263 26.139a1.04 1.04 0 001.027.876h21.431a.768.768 0 00.769-.646l4.263-26.37a.768.768 0 00-.768-.891zM19.52 21.644h-7.099l-1.921-10.025h10.82z" />
    </svg>
  );
}

export function ProviderLogo({
  type,
  className,
}: {
  type: ProviderType;
  className?: string;
}): ReactNode {
  switch (type) {
    case "GITLAB":
      return <GitLabLogo className={className} />;
    case "GITHUB":
      return <GitHubLogo className={className} />;
    case "BITBUCKET":
      return <BitbucketLogo className={className} />;
  }
}
