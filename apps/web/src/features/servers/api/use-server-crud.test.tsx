import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useServersReachability } from "./use-server-crud";
import { serversService } from "@/features/servers/api/servers.service";

vi.mock("@/features/servers/api/servers.service", () => ({
  serversService: {
    getReachability: vi.fn(),
  },
}));

const mocked = vi.mocked(serversService);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

// A3: this hook is the frontend half of the live reachability indicator —
// it must call the dedicated reachability endpoint (not the full server
// list/validation), and expose the resulting id → boolean map as-is.
describe("useServersReachability", () => {
  it("fetches and exposes the id → isReachable map", async () => {
    mocked.getReachability.mockResolvedValue({ s1: true, s2: false });
    const { wrapper } = setup();

    const { result } = renderHook(() => useServersReachability(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual({
      s1: true,
      s2: false,
    }));
    expect(mocked.getReachability).toHaveBeenCalled();
  });
});
