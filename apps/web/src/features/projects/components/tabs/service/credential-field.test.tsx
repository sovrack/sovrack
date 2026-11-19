import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CredentialField } from "./credential-field";

describe("CredentialField (Task 4)", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("shows a non-secret value in clear and has no reveal toggle", () => {
    render(<CredentialField label="User" value="appuser" />);
    expect(screen.getByText("appuser")).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/reveal value|hide value/i),
    ).not.toBeInTheDocument();
  });

  it("masks a secret until revealed, then shows it", () => {
    render(<CredentialField label="Password" value="s3cr3t" secret />);
    // Masked: the real value is not in the DOM yet.
    expect(screen.queryByText("s3cr3t")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Reveal value"));
    expect(screen.getByText("s3cr3t")).toBeInTheDocument();
    // Toggle back to hidden.
    fireEvent.click(screen.getByLabelText("Hide value"));
    expect(screen.queryByText("s3cr3t")).not.toBeInTheDocument();
  });

  it("copies the real value to the clipboard even while masked", async () => {
    render(<CredentialField label="Password" value="s3cr3t" secret />);
    fireEvent.click(screen.getByLabelText("Copy Password"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("s3cr3t");
  });
});
