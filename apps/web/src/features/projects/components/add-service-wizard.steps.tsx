"use client";

import { Check, Package } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Row } from "./add-service-wizard.parts";
import {
  DATABASES,
  repoToName,
  type AppMode,
} from "./add-service-wizard.catalog";
import type { ManagedServiceType, ServiceTemplate } from "@/features/projects/types/service";
import type { UseAddServiceWizardReturn } from "@/features/projects/api/use-add-service-wizard";

/* ─── Step 2: DATABASE ─────────────────────────────────────────────────── */

type DatabaseStepProps = {
  databaseType: ManagedServiceType;
  databaseVersion: string;
  name: string;
  setDatabaseType: UseAddServiceWizardReturn["setDatabaseType"];
  setDatabaseVersion: (v: string) => void;
  setName: (v: string) => void;
};

export function DatabaseStep({
  databaseType, databaseVersion, name,
  setDatabaseType, setDatabaseVersion, setName,
}: DatabaseStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {DATABASES.map((db) => (
          <button
            key={db.type}
            type="button"
            onClick={() => {
              setDatabaseType(db.type);
              setDatabaseVersion(db.defaultVersion);
            }}
            className={`rounded-xl border p-3 text-center text-sm font-semibold transition ${databaseType === db.type ? "border-[var(--text-primary)] bg-[var(--hover)] text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]"}`}
          >
            {db.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Service name"
          placeholder="my-database"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Version"
          value={databaseVersion}
          onChange={(e) => setDatabaseVersion(e.target.value)}
        />
      </div>
    </div>
  );
}

/* ─── Step 2: DOCKER ───────────────────────────────────────────────────── */

type DockerStepProps = {
  name: string; image: string; port: string;
  setName: (v: string) => void;
  setImage: (v: string) => void;
  setPort: (v: string) => void;
};

export function DockerStep({ name, image, port, setName, setImage, setPort }: DockerStepProps) {
  return (
    <div className="space-y-4">
      <Input label="Service name" placeholder="my-app" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Image" placeholder="docker.io/library/nginx:latest" value={image} onChange={(e) => setImage(e.target.value)} />
      <Input label="Port" value={port} onChange={(e) => setPort(e.target.value)} />
    </div>
  );
}

/* ─── Step 2: COMPOSE ──────────────────────────────────────────────────── */

type ComposeStepProps = {
  name: string; composeContent: string;
  setName: (v: string) => void;
  setComposeContent: (v: string) => void;
};

export function ComposeStep({ name, composeContent, setName, setComposeContent }: ComposeStepProps) {
  return (
    <div className="space-y-4">
      <Input label="Service name" placeholder="my-stack" value={name} onChange={(e) => setName(e.target.value)} />
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          docker-compose.yml
        </label>
        <textarea
          rows={10}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none"
          placeholder={'services:\n  app:\n    image: nginx:alpine\n    ports:\n      - "80:80"'}
          value={composeContent}
          onChange={(e) => setComposeContent(e.target.value)}
        />
      </div>
    </div>
  );
}

/* ─── Step 2: TEMPLATE ─────────────────────────────────────────────────── */

type TemplateStepProps = {
  templates: ServiceTemplate[];
  templateId: string;
  name: string;
  selectedTemplate: ServiceTemplate | null;
  setTemplateId: (id: string) => void;
  setName: (v: string) => void;
};

export function TemplateStep({
  templates, templateId, name, selectedTemplate, setTemplateId, setName,
}: TemplateStepProps) {
  if (templates.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No template available.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        {templates.map((t) => {
          const active = t.id === templateId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${active ? "border-[var(--text-primary)] bg-[var(--hover)]" : "border-[var(--border)] bg-[var(--bg-app)] hover:bg-[var(--hover)]"}`}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)]">
                <Package size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">{t.name}</span>
                <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{t.description}</span>
                <span className="mt-1.5 flex flex-wrap gap-1">
                  {t.services.map((s) => (
                    <span key={s.nameSuffix} className="rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                      {s.databaseType ?? s.nameSuffix}
                    </span>
                  ))}
                </span>
              </span>
              {active && <Check size={16} className="mt-1 shrink-0 text-green-400" />}
            </button>
          );
        })}
      </div>
      <Input label="Base name" placeholder="my-stack" value={name} onChange={(e) => setName(e.target.value)} />
      {selectedTemplate && name.trim() && (
        <p className="text-[11px] text-[var(--text-muted)]">
          Will create:{" "}
          {selectedTemplate.services.map((s) => `${name.trim()}-${s.nameSuffix}`).join(", ")}
        </p>
      )}
    </div>
  );
}

/* ─── Step 3: Review ───────────────────────────────────────────────────── */

type ReviewStepProps = {
  kindLabel: string;
  kind: string | null;
  appMode: AppMode;
  providerName: string | undefined;
  repoPath: string;
  branch: string;
  name: string;
  groupPath: string;
  selectedCount: number;
  databaseType: ManagedServiceType;
  databaseVersion: string;
  image: string;
  port: string;
  composeContent: string;
  selectedTemplate: ServiceTemplate | null;
};

export function ReviewStep({
  kindLabel, kind, appMode,
  providerName, repoPath, branch, name, groupPath, selectedCount,
  databaseType, databaseVersion, image, port, composeContent,
  selectedTemplate,
}: ReviewStepProps) {
  return (
    <dl className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-sm">
      <Row k="Type" v={kindLabel} />
      {kind === "APPLICATION" && appMode === "repo" && (
        <>
          <Row k="Provider" v={providerName ?? "—"} />
          <Row k="Repository" v={repoPath} />
          <Row k="Branch" v={branch} />
          <Row k="Name" v={name || repoToName(repoPath)} />
        </>
      )}
      {kind === "APPLICATION" && appMode === "group" && (
        <>
          <Row k="Provider" v={providerName ?? "—"} />
          <Row k="Group" v={groupPath} />
          <Row k="Services to create" v={`${selectedCount}`} />
        </>
      )}
      {kind === "DATABASE" && (
        <>
          <Row k="Engine" v={DATABASES.find((d) => d.type === databaseType)?.label ?? databaseType} />
          <Row k="Version" v={databaseVersion} />
          <Row k="Name" v={name} />
        </>
      )}
      {kind === "DOCKER" && (
        <>
          <Row k="Image" v={image} />
          <Row k="Port" v={port} />
          <Row k="Name" v={name} />
        </>
      )}
      {kind === "COMPOSE" && (
        <>
          <Row k="Name" v={name} />
          <Row k="Compose lines" v={`${composeContent.split("\n").length}`} />
        </>
      )}
      {kind === "TEMPLATE" && selectedTemplate && (
        <>
          <Row k="Template" v={selectedTemplate.name} />
          <Row k="Base name" v={name} />
          <Row
            k="Services to create"
            v={selectedTemplate.services.map((s) => `${name.trim()}-${s.nameSuffix}`).join(", ")}
          />
        </>
      )}
    </dl>
  );
}
