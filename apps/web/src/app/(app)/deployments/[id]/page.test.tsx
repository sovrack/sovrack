import { describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, type ReactNode } from "react";
import type { Deployment } from "@/features/deployments/types";
import { ToastProvider } from "@/shared/contexts/toast-context";
import DeploymentDetailPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// jsdom doesn't implement Element.scrollTo — LogTerminal (reused here from
// shared/common) auto-scrolls its container on new logs via this API.
Element.prototype.scrollTo = vi.fn();

const getByIdMock = vi.fn();
vi.mock("@/features/deployments/api/deployments.service", () => ({
  deploymentsService: {
    getById: (...args: unknown[]) => getByIdMock(...args),
  },
}));

// D1: this hook is exercised with enabled:false on this page (no live socket
// connection — see use-deployment-socket.ts) so we let the real implementation
// run; it just needs `io`/websocket resolution to stay inert, which it already
// does when enabled is false.

const dep: Deployment = {
  id: "dep-1",
  status: "FAILED",
  logs: "Starting build\nSuccessfully pulled image\nError: build failed",
  dockerImage: null,
  imageSha: null,
  specSnapshot: null,
  resolvedRefs: null,
  conditions: [],
  branch: "main",
  environmentId: "env-1",
  serviceId: "svc-1",
  projectId: "proj-1",
  userId: "user-1",
  startedAt: "2026-07-01T10:00:00.000Z",
  finishedAt: "2026-07-01T10:01:00.000Z",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-01T10:01:00.000Z",
  externalPipelineId: null,
  project: { id: "proj-1", name: "Demo project" },
  environment: {
    id: "env-1",
    name: "PRODUCTION",
    server: { id: "srv-1", name: "srv-1", host: "10.0.0.1" },
  },
  user: { id: "user-1", email: "jane@demo.dev", fullName: "Jane Doe" },
  service: { id: "svc-1", name: "api", type: "GIT" },
  publicUrl: null,
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ToastProvider>
          <Suspense fallback={<div>Loading…</div>}>{children}</Suspense>
        </ToastProvider>
      </QueryClientProvider>
    );
  }
  return Wrapper;
}

// P2.4 (mission finale) : la page est passée en onglets (Général / Logs /
// Conteneur). Les logs vivent dans l'onglet Logs (LogTerminal plein cadre),
// plus dans une section "Journal" ni une modale.
describe("DeploymentDetailPage — onglets (P2.4)", () => {
  it("shows the stored logs (structured per-line) in the Logs tab", async () => {
    getByIdMock.mockResolvedValue(dep);

    await act(async () => {
      render(
        <DeploymentDetailPage params={Promise.resolve({ id: "dep-1" })} />,
        { wrapper: setup() },
      );
    });

    // Onglet Général par défaut : les logs ne sont pas encore affichés.
    await waitFor(() =>
      expect(screen.getByText("Détails")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Starting build")).not.toBeInTheDocument();

    // Bascule sur l'onglet Logs.
    fireEvent.click(screen.getByText("Journaux"));

    await waitFor(() =>
      expect(screen.getByText("Starting build")).toBeInTheDocument(),
    );
    // Réutilise LogTerminal (shared/common/log-terminal.tsx).
    expect(screen.getByText("Deployment terminal")).toBeInTheDocument();
    expect(screen.getByText("Successfully pulled image")).toBeInTheDocument();
    expect(screen.getByText(/build failed/)).toBeInTheDocument();
    // Pas de blob brut multi-lignes.
    expect(
      screen.queryByText(
        "Starting build\nSuccessfully pulled image\nError: build failed",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a General tab (Details) and never a legacy 'Journal' section", async () => {
    getByIdMock.mockResolvedValue({ ...dep, logs: null });

    await act(async () => {
      render(
        <DeploymentDetailPage params={Promise.resolve({ id: "dep-1" })} />,
        { wrapper: setup() },
      );
    });

    await waitFor(() =>
      expect(screen.getByText("Demo project")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Journal")).not.toBeInTheDocument();
  });
});
