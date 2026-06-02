'use client';

import {
  ProjectBuildTabContent,
  type ProjectBuildTabContentProps,
} from './build-tab-content';

export type BuildTabProps = ProjectBuildTabContentProps;

export function ProjectBuildTab(props: BuildTabProps) {
  return <ProjectBuildTabContent {...props} />;
}
