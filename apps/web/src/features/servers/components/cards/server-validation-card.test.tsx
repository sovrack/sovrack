import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServerValidationCard } from "./server-validation-card";
import type { ServerValidationResult } from "@/features/servers/types/server";

function makeResult(
  over: Partial<ServerValidationResult> = {},
): ServerValidationResult {
  return {
    id: "v1",
    serverId: "s1",
    sshReachable: true,
    authSucceeded: true,
    sudoAvailable: true,
    pythonAvailable: true,
    ...over,
  } as ServerValidationResult;
}

describe("ServerValidationCard", () => {
  it("shows a placeholder when no validation has been persisted yet", () => {
    render(<ServerValidationCard results={[]} />);
    expect(
      screen.getByText("No SSH validation has been persisted yet."),
    ).toBeInTheDocument();
  });

  it("does not show an error message when the latest validation succeeded", () => {
    render(
      <ServerValidationCard
        results={[makeResult({ validationMessage: null })]}
      />,
    );
    expect(screen.queryByText(/Connexion SSH/i)).not.toBeInTheDocument();
  });

  // Regression: the specific failure reason (host key mismatch, connection
  // refused, auth failure…) was persisted server-side but never rendered
  // here — only visible by digging into the Jobs panel.
  it("shows the specific validation error message when auth failed", () => {
    render(
      <ServerValidationCard
        results={[
          makeResult({
            authSucceeded: false,
            sudoAvailable: false,
            validationMessage:
              "Connexion SSH échouée ou validation impossible: ECONNREFUSED",
          }),
        ]}
      />,
    );
    expect(
      screen.getByText(
        "Connexion SSH échouée ou validation impossible: ECONNREFUSED",
      ),
    ).toBeInTheDocument();
  });
});
