'use client';

import { RefreshCw, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BuildActionsProps = {
  onPrepare: () => void;
  onPush: () => void;
  isLoading: boolean;
  disabled?: boolean;
};

export function BuildActions({
  onPrepare,
  onPush,
  isLoading,
  disabled = false,
}: BuildActionsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        type="button"
        onClick={onPrepare}
        disabled={isLoading || disabled}
        icon={isLoading ? undefined : <Rocket size={14} />}
      >
        Regenerate
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onPush}
        disabled={isLoading || disabled}
        icon={isLoading ? undefined : <RefreshCw size={14} />}
      >
        Pousser dans GitLab
      </Button>
    </div>
  );
}
