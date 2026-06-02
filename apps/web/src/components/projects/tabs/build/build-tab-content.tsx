'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  GitBranch,
  Layers,
  RefreshCw,
  Rocket,
  XCircle,
} from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';
import { buildService, type BuildDetectResult, type BuildPrepareResult, type BuildStatusResult, type BuildAllResult } from '@/services/build.service';
import { projectsService } from '@/services/projects.service';
import type { ProjectService } from '@/types/project';
import { getApiErrorMessage } from '@/lib/api';
import { BuildFilesPreview } from './build-files-preview';
import { BuildStatusPanel, WEBHOOK_STATUS_LABEL, WEBHOOK_STATUS_STYLE } from './build-status-panel';
import { BuildTypeSelector } from './build-type-selector';

export type ProjectBuildTabContentProps = {
  projectId: string;
  isAdmin: boolean;
  sourceType?: string | null;
  hasEnvironment?: boolean;
  onGoToEnvironments?: () => void;
};

export function ProjectBuildTabContent({
  projectId,
  isAdmin,
  sourceType,
  hasEnvironment = true,
  onGoToEnvironments,
}: ProjectBuildTabContentProps) {
  const isGroupSource = sourceType === 'GROUP';

  const [services, setServices] = useState<ProjectService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [servicesLoading, setServicesLoading] = useState(false);
  const [buildStatus, setBuildStatus] = useState<BuildStatusResult | null>(null);
  const [buildStatusLoading, setBuildStatusLoading] = useState(false);

  const [detecting, setDetecting] = useState(false);
  const [detectAllRunning, setDetectAllRunning] = useState(false);
  const [detectAllResults, setDetectAllResults] = useState<Array<{
    serviceId: string;
    serviceName: string;
    status: 'SUCCESS' | 'FAILED';
    message: string;
  }> | null>(null);
  const [detected, setDetected] = useState<BuildDetectResult | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [port, setPort] = useState('3000');
  const [startCmd, setStartCmd] = useState('dist/main.js');
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [autoDeployBranch, setAutoDeployBranch] = useState('develop');
  const [preparing, setPreparing] = useState(false);
  const [prepareAllRunning, setPrepareAllRunning] = useState(false);
  const [reconcileRunning, setReconcileRunning] = useState(false);
  const [prepareAllResults, setPrepareAllResults] = useState<BuildAllResult[] | null>(null);
  const [prepared, setPrepared] = useState<BuildPrepareResult | null>(null);
  const [dockerfileContent, setDockerfileContent] = useState('');
  const [gitlabCiContent, setGitlabCiContent] = useState('');
  const [overwriteDockerfile, setOverwriteDockerfile] = useState(false);
  const [overwriteGitlabCi, setOverwriteGitlabCi] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [savingFiles, setSavingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const servicesLoadKeyRef = useRef<string | null>(null);
  const statusLoadProjectRef = useRef<string | null>(null);

  const refreshBuildStatus = useCallback(() => {
    setBuildStatusLoading(true);
    buildService.getBuildStatus(projectId)
      .then(setBuildStatus)
      .catch(() => {/* silently ignore */})
      .finally(() => setBuildStatusLoading(false));
  }, [projectId]);

  useEffect(() => {
    if (!isGroupSource) return;
    const loadKey = `${projectId}:group-services`;
    if (servicesLoadKeyRef.current === loadKey) return;
    servicesLoadKeyRef.current = loadKey;
    setServicesLoading(true);
    projectsService.getServices(projectId)
      .then((svcs) => {
        setServices(svcs);
        if (svcs.length > 0 && !selectedServiceId) {
          setSelectedServiceId(svcs[0].id);
        }
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setServicesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isGroupSource]);

  useEffect(() => {
    if (statusLoadProjectRef.current === projectId) return;
    statusLoadProjectRef.current = projectId;
    refreshBuildStatus();
  }, [projectId, refreshBuildStatus]);

  const effectiveServiceId = isGroupSource ? selectedServiceId : undefined;
  const selectedServiceStatus = isGroupSource
    ? buildStatus?.services.find((service) => service.id === selectedServiceId) ?? null
    : null;
  const selectedServiceMissingRequirements = selectedServiceStatus?.missingRequirements ?? [];
  const selectedServiceReady = !isGroupSource || selectedServiceMissingRequirements.length === 0;

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    try {
      const result = await buildService.detect(projectId, effectiveServiceId);
      setDetected(result);
      setSelectedType(result.recommendedBuildType || result.type);
      setPort(String(result.recommendedPort || 3000));
      setStartCmd(result.recommendedStartCommand || 'node index.js');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setDetecting(false);
    }
  };

  const handleDetectAll = async () => {
    if (!isGroupSource || services.length === 0) return;

    setDetectAllRunning(true);
    setDetectAllResults(null);
    setError(null);
    setSuccessMsg(null);

    try {
      const results: Array<{
        serviceId: string;
        serviceName: string;
        status: 'SUCCESS' | 'FAILED';
        message: string;
      }> = [];

      for (const service of services) {
        try {
          const result = await buildService.detect(projectId, service.id);
          results.push({
            serviceId: service.id,
            serviceName: service.name,
            status: 'SUCCESS',
            message: `${result.recommendedBuildType || result.type} · port ${String(result.recommendedPort)}`,
          });
        } catch (err) {
          results.push({
            serviceId: service.id,
            serviceName: service.name,
            status: 'FAILED',
            message: getApiErrorMessage(err),
          });
        }
      }

      setDetectAllResults(results);
      const failed = results.filter((item) => item.status === 'FAILED').length;
      if (failed === 0) {
        setSuccessMsg(`Détection terminée pour ${String(results.length)} service(s).`);
      } else {
        setError(`${String(failed)} service(s) ont échoué pendant la détection.`);
      }
    } finally {
      setDetectAllRunning(false);
    }
  };

  const handlePrepare = async () => {
    setPreparing(true);
    setError(null);
    setSuccessMsg(null);
    setPrepareAllResults(null);
    try {
      await buildService.updateConfig(projectId, {
        projectType: selectedType,
        buildPort: parseInt(port, 10),
        buildStartCmd: startCmd,
        autoDeploy,
        autoDeployBranch: autoDeploy ? autoDeployBranch : undefined,
      });
      const result = await buildService.prepare(projectId, effectiveServiceId, {
        overwriteDockerfile,
        overwriteGitlabCi,
      });
      setPrepared(result);
      setDockerfileContent(result.dockerfileContent);
      setGitlabCiContent(result.gitlabCiContent);
      setPrepareAllResults([result.serviceResult]);
      setSuccessMsg(result.serviceResult.message);
      refreshBuildStatus();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPreparing(false);
    }
  };

  const handlePrepareAll = async () => {
    setPrepareAllRunning(true);
    setError(null);
    setSuccessMsg(null);
    setPrepareAllResults(null);
    try {
      const res = await buildService.prepareAll(projectId);
      setPrepareAllResults(res.results);
      const failed = res.results.filter((r) => r.status === 'FAILED');
      const partial = res.results.filter((r) => r.status === 'PARTIAL_SUCCESS');
      if (failed.length === 0 && partial.length === 0) {
        setSuccessMsg(`Tous les services (${String(res.results.length)}) ont été préparés avec succès.`);
      } else if (failed.length === 0) {
        setSuccessMsg(
          `Préparation terminée: ${String(res.results.length - partial.length)} succès complet(s), ${String(partial.length)} succès partiel(s) (webhook à finaliser).`,
        );
      } else {
        setError(
          `${String(failed.length)} service(s) en échec, ${String(partial.length)} en succès partiel. Voir les détails ci-dessous.`,
        );
      }
      refreshBuildStatus();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPrepareAllRunning(false);
    }
  };

  const handleReconcileWebhooks = async () => {
    setReconcileRunning(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await buildService.reconcileWebhooks(projectId);
      setPrepareAllResults(res.results);

      const configured = res.results.filter((r) => r.webhookStatus === 'CONFIGURED').length;
      const pending = res.results.filter((r) => r.webhookStatus === 'PENDING_CONFIGURATION').length;
      const failed = res.results.filter((r) => r.webhookStatus === 'FAILED').length;
      const disabled = res.results.filter((r) => r.webhookStatus === 'DISABLED').length;

      if (disabled === res.results.length) {
        setSuccessMsg(
          'Configuration webhook désactivée côté plateforme: aucune action webhook nécessaire pour builder.',
        );
      } else if (failed === 0 && pending === 0) {
        setSuccessMsg(`Webhooks configurés pour ${String(configured)} service(s).`);
      } else if (failed === 0) {
        setSuccessMsg(
          `Configuration partielle: ${String(configured)} configuré(s), ${String(pending)} en attente de configuration plateforme.`,
        );
      } else {
        setError(
          `Configuration incomplète: ${String(configured)} configuré(s), ${String(pending)} en attente, ${String(failed)} en échec.`,
        );
      }
      refreshBuildStatus();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setReconcileRunning(false);
    }
  };

  const handleSaveFiles = async () => {
    setSavingFiles(true);
    setError(null);
    try {
      await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent });
      setSuccessMsg('Fichiers sauvegardés en base.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSavingFiles(false);
    }
  };

  const handlePushFiles = async () => {
    setPushing(true);
    setError(null);
    try {
      await buildService.updateConfig(projectId, { dockerfileContent, gitlabCiContent });
      await buildService.pushFiles(projectId, effectiveServiceId);
      setSuccessMsg('Fichiers poussés dans le repo GitLab.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPushing(false);
    }
  };

  // Derive current build phase for the stepper
  const allServicesReady = buildStatus && buildStatus.services.length > 0 && buildStatus.services.every((s) => s.ready);
  const hasSuccessPipeline = buildStatus?.services.some((s) => s.lastPipeline?.status === 'success');
  const buildPhase = hasSuccessPipeline ? 4 : allServicesReady ? 3 : (prepared ?? dockerfileContent) ? 2 : 1;

  const buildSteps = [
    { id: 1, label: '① Détecter', desc: 'Analyser le framework' },
    { id: 2, label: '② Préparer', desc: 'Générer Dockerfile + CI' },
    { id: 3, label: '③ Vérifier', desc: 'Pipeline CI/CD' },
    { id: 4, label: '④ Déployer', desc: 'Lancer en production' },
  ];

  return (
    <div className="space-y-6">
      {/* Environment warning */}
      {!hasEnvironment && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-amber-300">Aucun environnement configuré</p>
            <p className="text-xs text-amber-400/70">Configurez un VPS cible avant de préparer ou déployer.</p>
          </div>
          {onGoToEnvironments && (
            <button type="button" onClick={onGoToEnvironments} className="shrink-0 rounded-lg bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/30">
              Configurer →
            </button>
          )}
        </div>
      )}
      {/* Linear progress stepper */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-1">
        <div className="grid grid-cols-4 gap-1">
          {buildSteps.map((s) => {
            const done = s.id < buildPhase;
            const active = s.id === buildPhase;
            return (
              <div
                key={s.id}
                className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-center transition ${
                  active ? 'bg-[var(--bg-card)] shadow-sm' : done ? 'opacity-70' : 'opacity-40'
                }`}
              >
                <span className={`text-xs font-bold ${done ? 'text-green-400' : active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {done ? '✓ ' : ''}{s.label}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] hidden sm:block">{s.desc}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
          <div
            className="h-1 rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${Math.max(5, (buildPhase - 1) * 33)}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400">
          <CheckCircle size={15} /> {successMsg}
        </div>
      )}

      <BuildStatusPanel
        buildStatus={buildStatus}
        buildStatusLoading={buildStatusLoading}
        onRefresh={refreshBuildStatus}
      />

      {/* Prepare All (GROUP only) */}
      {isGroupSource && services.length > 1 && (
        <SectionCard
          title="Préparer tous les services"
          description="Génère Dockerfile + .gitlab-ci.yml pour chaque service en un clic."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handlePrepareAll()}
                disabled={prepareAllRunning || reconcileRunning || !isAdmin}
                loading={prepareAllRunning}
                icon={prepareAllRunning ? undefined : <Layers size={14} />}
              >
                {prepareAllRunning ? 'Préparation en cours…' : `Préparer tous les services (${String(services.length)})`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => void handleReconcileWebhooks()}
                disabled={prepareAllRunning || reconcileRunning || !isAdmin}
                loading={reconcileRunning}
                icon={reconcileRunning ? undefined : <RefreshCw size={14} />}
              >
                {reconcileRunning ? 'Configuration webhook…' : 'Configurer les webhooks'}
              </Button>
            </div>

            {prepareAllResults && (
              <div className="space-y-1.5">
                {prepareAllResults.map((r) => (
                  <div key={r.serviceId} className="rounded-lg border border-[var(--border)] bg-[var(--hover)] px-3 py-2">
                    <div className="flex items-center gap-2">
                      {r.status === 'SUCCESS' ? (
                        <CheckCircle size={14} className="shrink-0 text-green-400" />
                      ) : r.status === 'PARTIAL_SUCCESS' ? (
                        <AlertTriangle size={14} className="shrink-0 text-amber-400" />
                      ) : (
                        <XCircle size={14} className="shrink-0 text-red-400" />
                      )}
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{r.serviceName}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Dockerfile: {r.dockerfileStatus} · .dockerignore: {r.dockerignoreStatus} · CI: {r.ciStatus}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${WEBHOOK_STATUS_STYLE[r.webhookStatus]}`}>
                        {WEBHOOK_STATUS_LABEL[r.webhookStatus]}
                      </span>
                    </div>
                    <p className={`mt-1 text-xs ${
                      r.status === 'FAILED'
                        ? 'text-red-300'
                        : r.status === 'PARTIAL_SUCCESS'
                          ? 'text-amber-300'
                          : 'text-green-300'
                    }`}>
                      {r.message}
                    </p>
                    {r.webhookMessage && (
                      <p className="mt-1 text-xs text-amber-200">
                        Détail webhook: {r.webhookMessage}
                      </p>
                    )}
                    {r.pipelineUrl && (
                      <a
                        href={r.pipelineUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                      >
                        Pipeline <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* Service selector for GROUP source */}
      {isGroupSource && (
        <SectionCard
          title="Service"
          description="Source type GROUP — sélectionnez le service à configurer."
        >
          {servicesLoading ? (
            <p className="text-sm text-[var(--text-secondary)]">Chargement des services…</p>
          ) : services.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Aucun service trouvé. Ajoutez des services dans l&apos;onglet <strong>Services</strong>.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {services.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => {
                      setSelectedServiceId(svc.id);
                      setDetected(null);
                      setPrepared(null);
                      setDockerfileContent('');
                      setGitlabCiContent('');
                      setError(null);
                      setSuccessMsg(null);
                      setPrepareAllResults(null);
                    }}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                      selectedServiceId === svc.id
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                        : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <GitBranch size={13} />
                    {svc.name}
                    {svc.repositoryPath && (
                      <span className="text-xs opacity-60">{svc.repositoryPath}</span>
                    )}
                  </button>
                ))}
              </div>
              {selectedServiceStatus && selectedServiceMissingRequirements.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Service non prêt: {selectedServiceMissingRequirements.join(' · ')}
                </div>
              )}
            </div>
          )}
        </SectionCard>
      )}

      <BuildTypeSelector
        isGroupSource={isGroupSource}
        isAdmin={isAdmin}
        servicesCount={services.length}
        selectedServiceId={selectedServiceId}
        selectedServiceReady={selectedServiceReady}
        detecting={detecting}
        detectAllRunning={detectAllRunning}
        detected={detected}
        detectAllResults={detectAllResults}
        selectedType={selectedType}
        port={port}
        startCmd={startCmd}
        autoDeploy={autoDeploy}
        autoDeployBranch={autoDeployBranch}
        onDetect={() => void handleDetect()}
        onDetectAll={() => void handleDetectAll()}
        onSelectedTypeChange={setSelectedType}
        onPortChange={setPort}
        onStartCmdChange={setStartCmd}
        onAutoDeployToggle={() => setAutoDeploy((v) => !v)}
        onAutoDeployBranchChange={setAutoDeployBranch}
      />

      {/* Prepare */}
      <SectionCard
        title="Préparation du projet"
        description="Génère Dockerfile, .dockerignore et .gitlab-ci.yml, les pousse dans GitLab et configure le webhook."
      >
        {(buildStatus?.projectDockerfileReady || buildStatus?.projectCiReady) && (
          <div className="mb-4 space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-amber-300">Fichiers déjà présents — régénération optionnelle</p>
            {buildStatus.projectDockerfileReady && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={overwriteDockerfile}
                  onChange={(e) => setOverwriteDockerfile(e.target.checked)}
                  disabled={!isAdmin}
                  className="rounded"
                />
                Régénérer le Dockerfile
                <span className="text-amber-400">(⚠️ écrase le fichier existant dans le repo)</span>
              </label>
            )}
            {buildStatus.projectCiReady && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={overwriteGitlabCi}
                  onChange={(e) => setOverwriteGitlabCi(e.target.checked)}
                  disabled={!isAdmin}
                  className="rounded"
                />
                Régénérer le .gitlab-ci.yml
                <span className="text-amber-400">(⚠️ écrase le fichier existant dans le repo)</span>
              </label>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => void handlePrepare()}
            disabled={
              preparing ||
              !isAdmin ||
              !selectedType ||
              (isGroupSource && (!selectedServiceId || !selectedServiceReady))
            }
            loading={preparing}
            icon={preparing ? undefined : <Rocket size={14} />}
          >
            {isGroupSource ? 'Préparer le service sélectionné' : 'Préparer le projet'}
          </Button>
        </div>
      </SectionCard>

      <BuildFilesPreview
        isAdmin={isAdmin}
        isVisible={Boolean(prepared ?? dockerfileContent)}
        isGroupSource={isGroupSource}
        selectedServiceReady={selectedServiceReady}
        dockerfileContent={dockerfileContent}
        gitlabCiContent={gitlabCiContent}
        preparing={preparing}
        pushing={pushing}
        reconcileRunning={reconcileRunning}
        savingFiles={savingFiles}
        onDockerfileChange={setDockerfileContent}
        onGitlabCiChange={setGitlabCiContent}
        onSaveFiles={() => void handleSaveFiles()}
        onPrepare={() => void handlePrepare()}
        onPush={() => void handlePushFiles()}
        onReconcile={() => void handleReconcileWebhooks()}
      />
    </div>
  );
}
