import { describe, expect, it, vi, beforeEach } from "vitest";
import api from "@/shared/lib/api";
import { teamsService } from "./teams.service";

vi.mock("@/shared/lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const mocked = vi.mocked(api);

describe("teamsService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll hits /workspaces", async () => {
    await teamsService.getAll();
    expect(mocked.get).toHaveBeenCalledWith("/workspaces");
  });
  it("getById hits /workspaces/:id", async () => {
    await teamsService.getById("t1");
    expect(mocked.get).toHaveBeenCalledWith("/workspaces/t1");
  });
});
