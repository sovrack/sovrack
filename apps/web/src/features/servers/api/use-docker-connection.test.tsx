import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useDockerConnection } from "./use-server-preparation";
import { serversService } from "./servers.service";

vi.mock("./servers.service", () => ({
  serversService: { getDockerConnection: vi.fn() },
}));

const mocked = vi.mocked(serversService);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Mission docker_tls (T3): the server detail page shows "Connected" from this
// hook once the Setup Server flow has auto-registered the DockerConnection.
describe("useDockerConnection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the connection metadata when configured", async () => {
    mocked.getDockerConnection.mockResolvedValue({
      id: "c1",
      serverId: "s1",
      endpoint: "tcp://10.0.0.9:2376",
      apiVersion: "1.47",
      lastCheckedAt: null,
      isReachable: true,
      createdAt: "",
      updatedAt: "",
    });
    const { result } = renderHook(() => useDockerConnection("s1"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.data?.endpoint).toBe("tcp://10.0.0.9:2376"),
    );
  });

  it("returns null (not an error) when no connection is configured", async () => {
    mocked.getDockerConnection.mockResolvedValue(null);
    const { result } = renderHook(() => useDockerConnection("s1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
