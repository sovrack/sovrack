"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Layers,
  Database,
  Zap,
  HardDrive,
  Activity,
  Workflow,
  Server,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import api, { getApiErrorMessage } from "@/shared/lib/api";
import { Alert } from "@/shared/ui/alert";
import clsx from "clsx";

type TemplateComponent = {
  nameSuffix: string;
  type: string;
  databaseType?: string;
  databaseVersion?: string;
  repoPath?: string;
  port?: number;
};

type ServiceTemplate = {
  id: string;
  name: string;
  description: string;
  components: TemplateComponent[];
};

function getTemplateIcon(id: string) {
  if (id.includes("postgres") || id.includes("mysql") || id.includes("mongo")) return Database;
  if (id.includes("redis") || id.includes("rabbit")) return Zap;
  if (id.includes("minio")) return HardDrive;
  if (id.includes("uptime")) return Activity;
  if (id.includes("n8n")) return Workflow;
  return Server;
}

export function TemplatePickerModal({
  projectId,
  isOpen,
  onClose,
}: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [stackName, setStackName] = useState("");
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading, error } = useQuery<ServiceTemplate[]>({
    queryKey: ["service-templates", projectId],
    queryFn: async () => {
      const res = await api.get<ServiceTemplate[]>(`/projects/${projectId}/services/templates`);
      return res.data;
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: async ({ templateId, name }: { templateId: string; name: string }) => {
      const res = await api.post(`/projects/${projectId}/services/templates/${templateId}`, {
        name,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-services", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      onClose();
    },
  });

  if (!isOpen) return null;

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleDeploy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId || !stackName.trim()) return;
    mutation.mutate({ templateId: selectedTemplateId, name: stackName.trim() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-zinc-800 bg-[#16161a] p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Layers size={18} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Catalogue de Modèles 1-Click</h3>
              <p className="text-xs text-zinc-400">Déployez des piles prêtes à l&apos;emploi avec auto-connexion réseau.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="error" title="Erreur lors du chargement des modèles">
              {getApiErrorMessage(error)}
            </Alert>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
            <Loader2 size={24} className="animate-spin text-blue-500" />
            <span className="text-xs">Chargement du catalogue...</span>
          </div>
        ) : (
          <form onSubmit={handleDeploy} className="mt-4 space-y-4">
            {/* Grid of templates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto no-scrollbar p-0.5">
              {templates.map((tpl) => {
                const Icon = getTemplateIcon(tpl.id);
                const isSelected = selectedTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setSelectedTemplateId(tpl.id);
                      if (!stackName) setStackName(tpl.id.split("-")[0]);
                    }}
                    className={clsx(
                      "cursor-pointer rounded-lg border p-3 transition flex flex-col justify-between text-left",
                      isSelected
                        ? "border-[#2563EB] bg-blue-500/10 shadow-sm"
                        : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-800/40",
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-2 font-medium text-sm text-zinc-100">
                          <Icon size={16} className={isSelected ? "text-blue-400" : "text-zinc-400"} />
                          {tpl.name}
                        </span>
                        {isSelected && <CheckCircle2 size={16} className="text-blue-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {tpl.description}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      {tpl.components.map((comp) => (
                        <span
                          key={comp.nameSuffix}
                          className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
                        >
                          +{comp.nameSuffix}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Template Config */}
            {selectedTemplate && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-3.5 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Nom de base pour la pile (ex. <span className="font-mono text-zinc-400">production</span> ou <span className="font-mono text-zinc-400">app-db</span>)
                  </label>
                  <input
                    type="text"
                    required
                    value={stackName}
                    onChange={(e) => setStackName(e.target.value)}
                    placeholder="ex. main-stack"
                    className="w-full rounded-md border border-zinc-700 bg-black/40 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Services qui seront créés :{" "}
                    {selectedTemplate.components
                      .map((c) => `${stackName || "nom"}-${c.nameSuffix}`)
                      .join(", ")}
                  </p>
                </div>
              </div>
            )}

            {mutation.error && (
              <Alert tone="error" title="Échec du déploiement">
                {getApiErrorMessage(mutation.error)}
              </Alert>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!selectedTemplateId || !stackName.trim() || mutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition"
              >
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Déployer le modèle
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
