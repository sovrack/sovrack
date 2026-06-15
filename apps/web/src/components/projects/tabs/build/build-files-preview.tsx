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
  savingFiles: boolean;
  onDockerfileChange: (value: string) => void;
  onGitlabCiChange: (value: string) => void;
  onSaveFiles: () => void;
  onPrepare: () => void;
  onPush: () => void;
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
  savingFiles,
  onDockerfileChange,
  onGitlabCiChange,
  onSaveFiles,
  onPrepare,
  onPush,
}: BuildFilesPreviewProps) {
  if (!isVisible) return null;

  return (
    <SectionCard
      title="Generated files"
      description="Edit then push to your GitLab repo. These files let GitLab CI build your Docker image."
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
          Sauvegarder
        </Button>
        <BuildActions
          onPrepare={onPrepare}
          onPush={onPush}
          isLoading={preparing || pushing}
          disabled={!isAdmin || (isGroupSource && !selectedServiceReady)}
        />
      </div>
    </SectionCard>
  );
}
