'use client';

import { Code2 } from 'lucide-react';
import { BuildActions } from '@/components/build/build-actions';
import { CicdEditor } from '@/components/build/cicd-editor';
import { DockerfileEditor } from '@/components/build/dockerfile-editor';
import { SectionCard } from '@/components/layout/section-card';
import { Button } from '@/components/ui/button';

export type BuildFilesPreviewProps = {
  isAdmin: boolean;
  isVisible: boolean;
  isGroupSource: boolean;
  selectedServiceReady: boolean;
  dockerfileContent: string;
  gitlabCiContent: string;
  preparing: boolean;
  pushing: boolean;
  reconcileRunning: boolean;
  savingFiles: boolean;
  onDockerfileChange: (value: string) => void;
  onGitlabCiChange: (value: string) => void;
  onSaveFiles: () => void;
  onPrepare: () => void;
  onPush: () => void;
  onReconcile: () => void;
};

export function BuildFilesPreview({
  isAdmin,
  isVisible,
  isGroupSource,
  selectedServiceReady,
  dockerfileContent,
  gitlabCiContent,
  preparing,
  pushing,
  reconcileRunning,
  savingFiles,
  onDockerfileChange,
  onGitlabCiChange,
  onSaveFiles,
  onPrepare,
  onPush,
  onReconcile,
}: BuildFilesPreviewProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <SectionCard
      title="Fichiers générés"
      description="Modifiez les fichiers générés puis poussez-les dans votre repo GitLab."
      contentClassName="space-y-5"
    >
      <DockerfileEditor
        value={dockerfileContent}
        onChange={onDockerfileChange}
        readonly={!isAdmin}
      />

      <CicdEditor
        value={gitlabCiContent}
        onChange={onGitlabCiChange}
        readonly={!isAdmin}
      />

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={onSaveFiles}
          disabled={savingFiles || !isAdmin}
          loading={savingFiles}
          icon={savingFiles ? undefined : <Code2 size={14} />}
        >
          Sauvegarder les modifications
        </Button>
        <BuildActions
          onPrepare={onPrepare}
          onPush={onPush}
          onReconcile={onReconcile}
          isLoading={preparing || pushing || reconcileRunning}
          disabled={!isAdmin || (isGroupSource && !selectedServiceReady)}
        />
      </div>
    </SectionCard>
  );
}
