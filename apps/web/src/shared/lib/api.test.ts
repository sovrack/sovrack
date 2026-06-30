import { describe, expect, it } from "vitest";
import { getApiErrorMessage } from "./api";

// Construit un faux AxiosError minimal (réponse + code + message).
const err = (over: {
  status?: number;
  data?: unknown;
  code?: string;
  message?: string;
}): unknown => ({
  code: over.code,
  message: over.message ?? "",
  response:
    over.status !== undefined || over.data !== undefined
      ? { status: over.status, data: over.data }
      : undefined,
});

describe("getApiErrorMessage", () => {
  it("priorise le message string du backend", () => {
    expect(getApiErrorMessage(err({ data: { message: "Boom métier" } }))).toBe(
      "Boom métier",
    );
  });

  it("joint un message tableau (validation NestJS)", () => {
    expect(
      getApiErrorMessage(
        err({ data: { message: ["champ A requis", "champ B"] } }),
      ),
    ).toBe("champ A requis, champ B");
  });

  it("détecte un timeout (ECONNABORTED)", () => {
    expect(getApiErrorMessage(err({ code: "ECONNABORTED" }))).toMatch(
      /longer than expected/i,
    );
  });

  it("messages clairs par status", () => {
    expect(getApiErrorMessage(err({ status: 401 }))).toMatch(
      /Authentification/i,
    );
    expect(getApiErrorMessage(err({ status: 403 }))).toMatch(/Access denied/i);
    expect(getApiErrorMessage(err({ status: 404 }))).toMatch(/introuvable/i);
    expect(getApiErrorMessage(err({ status: 409 }))).toMatch(/Conflict/i);
  });

  it("repli sur le message axios puis message générique", () => {
    expect(getApiErrorMessage(err({ message: "Network Error" }))).toBe(
      "Network Error",
    );
    expect(getApiErrorMessage(err({}))).toBe(
      "Une erreur inattendue est survenue.",
    );
  });
});
