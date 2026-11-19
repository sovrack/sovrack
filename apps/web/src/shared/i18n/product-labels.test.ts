import { describe, expect, it } from "vitest";
import {
  deploymentStatusLabel,
  workspaceRoleLabel,
} from "./product-labels";

describe("product enum labels", () => {
  it("keeps workspace permissions technical while presenting French roles", () => {
    expect(workspaceRoleLabel("OWNER")).toBe("Propriétaire");
    expect(workspaceRoleLabel("ADMIN")).toBe("Administrateur");
    expect(workspaceRoleLabel("MEMBER")).toBe("Membre");
  });

  it("presents deployment and CI states consistently", () => {
    expect(deploymentStatusLabel("SUCCESS")).toBe("Réussi");
    expect(deploymentStatusLabel("failed")).toBe("Échoué");
    expect(deploymentStatusLabel("running")).toBe("En cours");
    expect(deploymentStatusLabel("canceled")).toBe("Annulé");
  });
});
