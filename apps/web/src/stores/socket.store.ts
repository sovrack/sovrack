import { create } from 'zustand';

type DeploymentSocketState = {
  connectedDeploymentId: string | null;
  isConnected: boolean;
  activeDeploymentIds: Set<string>;
};

type DeploymentSocketActions = {
  setConnected: (deploymentId: string) => void;
  setDisconnected: () => void;
  addActiveDeployment: (deploymentId: string) => void;
  removeActiveDeployment: (deploymentId: string) => void;
  clearAll: () => void;
};

export const useSocketStore = create<DeploymentSocketState & DeploymentSocketActions>()(
  (set) => ({
    connectedDeploymentId: null,
    isConnected: false,
    activeDeploymentIds: new Set(),

    setConnected: (deploymentId) =>
      set({ connectedDeploymentId: deploymentId, isConnected: true }),

    setDisconnected: () =>
      set({ connectedDeploymentId: null, isConnected: false }),

    addActiveDeployment: (deploymentId) =>
      set((state) => ({
        activeDeploymentIds: new Set([...state.activeDeploymentIds, deploymentId]),
      })),

    removeActiveDeployment: (deploymentId) =>
      set((state) => {
        const next = new Set(state.activeDeploymentIds);
        next.delete(deploymentId);
        return { activeDeploymentIds: next };
      }),

    clearAll: () =>
      set({
        connectedDeploymentId: null,
        isConnected: false,
        activeDeploymentIds: new Set(),
      }),
  }),
);
