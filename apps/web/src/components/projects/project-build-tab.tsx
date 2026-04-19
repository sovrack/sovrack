'use client';

import { useState } from 'react';
import { Loader2, Cpu, Code2, Rocket } from 'lucide-react';
import { SectionCard } from '@/components/layout/section-card';
import { getApiErrorMessage } from '@/lib/api';
import api from '@/lib/api';

type DetectResult = { type: string; confidence: string };
type PrepareResult = {
  type: string;
  confidence: string;
  dockerfileContent: string;
  gitlabCiContent: string;
};

type Props = { projectId: string; isAdmin: boolean };

const PROJECT_TYPES = ['nodejs', 'python', 'php', 'static', 'docker', 'ruby'];

export function ProjectBuildTab({ projectId, isAdmin }: Props) {
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectResult | null>(null);
  const [selectedType, setSelectedType] = useState('');
  const [port, setPort] = useState('3000');
  const [startCmd, setStartCmd] = useState('index.js');
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleDetect = async () => {
    setDetecting(true);
    setError(null);
    try {
      const res = await api.get<DetectResult>(`/projects/${projectId}/build/detect`);
      setDetected(res.data);
      setSelectedType(res.data.type);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setDetecting(false);
    }
  };

  const handlePrepare = async () => {
    setPreparing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      // Mettre à jour la config d'abord
      await api.put(`/projects/${projectId}/build/config`, {
        projectType: selectedType,
        buildPort: parseInt(port, 10),
        buildStartCmd: startCmd,
      });
      // Préparer (génère + pousse + configure webhook)
      const res = await api.post<PrepareResult>(`/projects/${projectId}/build/prepare`);
      setPrepared(res.data);
      setSuccessMsg('Fichiers générés et poussés dans le repo GitLab. Webhook configuré.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPreparing(false);
    }
  };

  const handlePushFiles = async () => {
    setPushing(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/build/push-files`);
      setSuccessMsg('Fichiers poussés dans le repo GitLab.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* Détection du type */}
      <SectionCard title="Type de projet" description="Détectez automatiquement ou choisissez manuellement le type de projet.">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => void handleDetect()}
              disabled={detecting || !isAdmin}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {detecting ? <Loader2 size={14} className="animate-spin" /> : <Cpu size={14} />}
              Détecter automatiquement
            </button>
            {detected && (
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                Détecté: {detected.type} ({detected.confidence})
              </span>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Type de projet
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
            >
              <option value="">-- Sélectionner --</option>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Configuration */}
      <SectionCard title="Configuration" description="Port et commande de démarrage de votre application.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Port de l&apos;application
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={!isAdmin}
              min={1}
              max={65535}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Commande de démarrage
            </label>
            <input
              type="text"
              value={startCmd}
              onChange={(e) => setStartCmd(e.target.value)}
              disabled={!isAdmin}
              placeholder="index.js / app.py / ..."
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
            />
          </div>
        </div>
      </SectionCard>

      {/* Fichiers générés */}
      <SectionCard title="Fichiers générés" description="Dockerfile et .gitlab-ci.yml générés et poussés dans votre repo GitLab.">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => void handlePrepare()}
              disabled={preparing || !isAdmin || !selectedType}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {preparing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
              Préparer le projet
            </button>
            {prepared && (
              <button
                onClick={() => void handlePushFiles()}
                disabled={pushing || !isAdmin}
                className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-60"
              >
                {pushing ? <Loader2 size={14} className="animate-spin" /> : <Code2 size={14} />}
                Re-pousser les fichiers
              </button>
            )}
          </div>

          {prepared && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">Dockerfile</p>
                <pre className="overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-200">
                  {prepared.dockerfileContent}
                </pre>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">.gitlab-ci.yml</p>
                <pre className="overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-200">
                  {prepared.gitlabCiContent}
                </pre>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
