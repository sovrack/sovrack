"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/shared/contexts/confirm-context";
import { useToast } from "@/shared/contexts/toast-context";
import { servicesService } from "@/features/projects/api/services.service";
import { deploymentsService } from "@/features/deployments";
import { containersService } from "@/features/registry";
import { environmentsService } from "@/features/projects/api/environments.service";
import { getApiErrorMessage } from "@/shared/lib/api";
import type { Service } from "@/features/projects/types/service";
import type { Deployment } from "@/features/deployments/types";

type Env = { id: string; name: string };

/**
 * F-8 fix: imperative service-level actions (redeploy, stop, delete) extracted
 * from the 418-line page into a reusable hook. Keeps the page component focused
 * on layout and data fetching only.
 */
export function useServiceActions({
  projectId,
  serviceId,
  service,
  environments,
  selectedEnvId,
  lastDeployment,
  onDeployOpen,
  onReload,
}: {
  projectId: string;
  serviceId: string;
  service: Service | null;
  environments: Env[];
  selectedEnvId: string;
  lastDeployment: Deployment | null;
  onDeployOpen: () => void;
  onReload: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();

  const [deleting, setDeleting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [redeploying, setRedeploying] = useState(false);

  const handleRedeploy = async () => {
    const envId = selectedEnvId || environments[0]?.id;
    if (!envId) {
      onDeployOpen();
      return;
    }
    setRedeploying(true);
    try {
      const links = await environmentsService.getServiceLinks(projectId, envId);
      const link = links.find((l) => l.serviceId === serviceId);
      if (!link) {
        toast(
          "Service not linked to this environment — opening deploy dialog.",
          "error",
        );
        onDeployOpen();
        return;
      }
      await deploymentsService.create({
        serviceEnvId: link.id,
        branch: lastDeployment?.branch ?? undefined,
      });
      toast("Redeploy started.", "success");
      onReload();
    } catch (e) {
      toast(getApiErrorMessage(e), "error");
    } finally {
      setRedeploying(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const containers = await containersService.listByService(serviceId);
      const running =
        containers.find((c) => c.status === "RUNNING") ?? containers[0];
      if (!running) {
        toast("No running container found for this service.", "error");
        return;
      }
      await containersService.stop(running.id);
      toast("Container stopped.", "success");
      onReload();
    } catch (e) {
      toast(getApiErrorMessage(e), "error");
    } finally {
      setStopping(false);
    }
  };

  const handleDelete = async () => {
    if (!service) return;
    const ok = await confirm({
      title: `Delete service "${service.name}"?`,
      description:
        "The service is archived (deployment history is kept). This removes it from the project.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await servicesService.remove(projectId, serviceId);
      router.push(`/projects/${projectId}`);
    } catch (e) {
      toast(getApiErrorMessage(e), "error");
      setDeleting(false);
    }
  };

  return {
    deleting,
    stopping,
    redeploying,
    handleRedeploy,
    handleStop,
    handleDelete,
  };
}
