import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useServerActions } from "./use-server-actions";
import { serversService } from "@/features/servers/api/servers.service";
import type { Server, ServerJob } from "@/features/servers/types/server";

vi.mock("@/features/servers/api/servers.service", () => ({
  serversService: {
    getAll: vi.fn(),
    getJobs: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    verify: vi.fn(),
    detect: vi.fn(),
    startSetup: vi.fn(),
    installKey: vi.fn(),
    remove: vi.fn(),
    retryJob: vi.fn(),
    cancelJob: vi.fn(),
  },
}));

const toastMock = vi.fn();
vi.mock("@/shared/contexts/toast-context", () => ({
  useToast: () => toastMock,
}));

const mocked = vi.mocked(serversService);

const aServer = (over: Partial<Server> = {}): Server =>
  ({
    id: "srv1",
    name: "prod-1",
    host: "1.2.3.4",
    port: 22,
    isVerified: false,
    status: "PENDING",
    activeJob: null,
    ...over,
  }) as Server;

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useServerActions(), { wrapper });
}

describe("useServerActions — state management (useReducer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.getAll.mockResolvedValue([aServer()]);
  });

  it("loads servers via react-query", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.servers).toHaveLength(1));
    expect(result.current.servers[0].id).toBe("srv1");
  });

  it("handleVerify sets verifyingId during the call and clears it after", async () => {
    let resolveVerify: () => void = () => {};
    mocked.verify.mockReturnValue(
      new Promise((resolve) => {
        resolveVerify = () => resolve({ ok: true } as never);
      }),
    );
    mocked.getJobs.mockResolvedValue([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.servers).toHaveLength(1));

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.handleVerify("srv1");
    });
    await waitFor(() => expect(result.current.verifyingId).toBe("srv1"));

    await act(async () => {
      resolveVerify();
      await promise;
    });

    expect(result.current.verifyingId).toBeNull();
    expect(toastMock).toHaveBeenCalledWith(
      "SSH validation started",
      "success",
    );
  });

  it("handleVerify shows an error toast and clears verifyingId on failure", async () => {
    mocked.verify.mockRejectedValue(new Error("SSH unreachable"));
    const { result } = setup();
    await waitFor(() => expect(result.current.servers).toHaveLength(1));

    await act(async () => {
      await result.current.handleVerify("srv1");
    });

    expect(result.current.verifyingId).toBeNull();
    expect(toastMock).toHaveBeenCalledWith("SSH unreachable", "error");
  });

  it("handleCreate toggles creating and returns the created server", async () => {
    mocked.create.mockResolvedValue({ id: "srv-new" } as never);
    const { result } = setup();
    await waitFor(() => expect(result.current.servers).toHaveLength(1));

    let created: unknown;
    await act(async () => {
      created = await result.current.handleCreate({ name: "x" } as never);
    });

    expect(result.current.creating).toBe(false);
    expect(created).toEqual({ id: "srv-new" });
  });

  it("handleDelete removes the server's jobs entry from jobsByServer", async () => {
    const jobs: ServerJob[] = [
      { id: "j1", type: "VERIFY", status: "SUCCESS" } as ServerJob,
    ];
    mocked.getJobs.mockResolvedValue(jobs);
    mocked.remove.mockResolvedValue(undefined);
    const { result } = setup();
    await waitFor(() => expect(result.current.servers).toHaveLength(1));

    await act(async () => {
      await result.current.refreshJobs("srv1");
    });
    expect(result.current.jobsByServer.srv1).toEqual(jobs);

    await act(async () => {
      await result.current.handleDelete("srv1", "prod-1");
    });

    expect(result.current.jobsByServer.srv1).toBeUndefined();
    expect(toastMock).toHaveBeenCalledWith(
      'Server "prod-1" deleted',
      "success",
    );
  });

  it("handleStartSetup sends the given payload as-is and resets settingUpId after success", async () => {
    mocked.startSetup.mockResolvedValue(undefined as never);
    mocked.getJobs.mockResolvedValue([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.servers).toHaveLength(1));

    const server = aServer();
    await act(async () => {
      await result.current.handleStartSetup(server, {
        gitlabRunnerExecutor: "shell",
      });
    });

    expect(mocked.startSetup).toHaveBeenCalledWith(server.id, {
      gitlabRunnerExecutor: "shell",
    });
    expect(result.current.settingUpId).toBeNull();
  });
});
