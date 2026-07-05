import { describe, expect, it, vi, beforeEach } from "vitest";
import api from "@/shared/lib/api";
import { automationService } from "./automation.service";

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
describe("automationService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getActions hits /automation/actions", async () => {
    await automationService.getActions();
    expect(mocked.get).toHaveBeenCalledWith("/automation/actions");
  });

});
