import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useWebhookStatus,
  useConfigureWebhook,
  useToggleWebhook,
} from "./use-webhook";
import { webhooksService } from "@/features/platform/api/webhooks.service";

vi.mock("@/features/platform/api/webhooks.service", () => ({
  webhooksService: {
    status: vi.fn(),
    configure: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  },
}));

const mocked = vi.mocked(webhooksService);

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useWebhookStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches the webhook status of a service", async () => {
    mocked.status.mockResolvedValue({ configured: true, isActive: true });
    const { wrapper } = setup();
    const { result } = renderHook(() => useWebhookStatus("p1", "s1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.status).toHaveBeenCalledWith("p1", "s1");
    expect(result.current.data?.configured).toBe(true);
  });
});

describe("useConfigureWebhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("configures the webhook then invalidates its status cache", async () => {
    mocked.configure.mockResolvedValue({ webhookUrl: "http://x", isNew: true });
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useConfigureWebhook("p1", "s1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mocked.configure).toHaveBeenCalledWith("p1", "s1");
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["webhook", "p1", "s1"],
    });
  });
});

describe("useToggleWebhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pauses when the webhook is currently active", async () => {
    mocked.pause.mockResolvedValue(undefined);
    const { wrapper } = setup();
    const { result } = renderHook(() => useToggleWebhook("p1", "s1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(true);
    });

    expect(mocked.pause).toHaveBeenCalledWith("p1", "s1");
    expect(mocked.resume).not.toHaveBeenCalled();
  });

  it("resumes when the webhook is currently paused", async () => {
    mocked.resume.mockResolvedValue(undefined);
    const { wrapper } = setup();
    const { result } = renderHook(() => useToggleWebhook("p1", "s1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync(false);
    });

    expect(mocked.resume).toHaveBeenCalledWith("p1", "s1");
    expect(mocked.pause).not.toHaveBeenCalled();
  });
});
