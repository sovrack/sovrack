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

// LOT4f : premiere couverture de la feature (etait a ZERO test) — verrouille
// les endpoints reellement appeles par le service.
describe("teamsService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll hits /teams", async () => {
    await teamsService.getAll();
    expect(mocked.get).toHaveBeenCalledWith("/teams");
  });
  it("getById hits /teams/:id", async () => {
    await teamsService.getById("t1");
    expect(mocked.get).toHaveBeenCalledWith("/teams/t1");
  });

});
