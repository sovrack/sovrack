'use client';

import { Layers, RefreshCw, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BuildActionsProps = {
  onPrepare: () => void;
  onPush: () => void;
  onReconcile: () => void;
  isLoading: boolean;
  disabled?: boolean;
};

export function BuildActions({
  onPrepare,
  onPush,
  onReconcile,
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
        Préparer
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onPush}
        disabled={isLoading || disabled}
        icon={isLoading ? undefined : <RefreshCw size={14} />}
      >
        Push
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onReconcile}
        disabled={isLoading || disabled}
        icon={isLoading ? undefined : <Layers size={14} />}
      >
        Réconcilier
      </Button>
    </div>
  );
}
