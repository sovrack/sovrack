import { describe, expect, it, vi, beforeEach } from "vitest";
import api from "@/shared/lib/api";
import { sshKeysService } from "./ssh-keys.service";

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
describe("sshKeysService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getAll hits /ssh-keys", async () => {
    await sshKeysService.getAll();
    expect(mocked.get).toHaveBeenCalledWith("/ssh-keys");
  });
  it("create posts to /ssh-keys", async () => {
    await sshKeysService.create({ name: "k", publicKey: "ssh-ed25519 AAA" } as never);
    expect(mocked.post).toHaveBeenCalledWith("/ssh-keys", { name: "k", publicKey: "ssh-ed25519 AAA" });
  });

});
