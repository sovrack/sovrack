import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEnvPreview } from "./use-env-preview";
import { deploymentsService } from "@/features/deployments/api/deployments.service";

vi.mock("@/features/deployments/api/deployments.service", () => ({
  deploymentsService: { previewEnv: vi.fn() },
}));

const mocked = vi.mocked(deploymentsService);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("useEnvPreview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays idle (no fetch) when serviceEnvId is null", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useEnvPreview(null), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mocked.previewEnv).not.toHaveBeenCalled();
  });

  it("fetches the injected-variables preview for a service environment", async () => {
    mocked.previewEnv.mockResolvedValue({
      variables: [
        { key: "PORT", origin: "service", isSecret: false, value: "3000" },
      ],
      warnings: [],
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useEnvPreview("env-9"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.previewEnv).toHaveBeenCalledWith("env-9");
    expect(result.current.data?.variables).toHaveLength(1);
  });
});
