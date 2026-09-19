import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider, useI18n } from "./language-context";

function Probe() {
  const { lang, setLang, t } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="translated">{t("Deploy")}</span>
      <span data-testid="unknown">{t("Untranslated string")}</span>
      <button type="button" onClick={() => setLang(lang === "en" ? "fr" : "en")}>
        toggle
      </button>
    </div>
  );
}

// D1 : dictionnaire style gettext (clé = texte anglais source), bascule FR/EN
// persistée, et fallback identité hors provider (tests sans wrapper).
describe("LanguageProvider / useI18n", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to French and can still switch internally", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("lang")).toHaveTextContent("fr");
    expect(screen.getByTestId("translated")).toHaveTextContent("Déployer");

    fireEvent.click(screen.getByText("toggle"));
    expect(screen.getByTestId("lang")).toHaveTextContent("en");
    expect(screen.getByTestId("translated")).toHaveTextContent("Deploy");
    // Non traduit → reste en anglais (jamais de trou dans l'UI).
    expect(screen.getByTestId("unknown")).toHaveTextContent(
      "Untranslated string",
    );
    // Persistance du choix.
    expect(localStorage.getItem("deploy-automation-lang")).toBe("en");
  });

  it("falls back to French outside a provider (tests, storybook…)", () => {
    render(<Probe />);
    expect(screen.getByTestId("lang")).toHaveTextContent("fr");
    expect(screen.getByTestId("translated")).toHaveTextContent("Déployer");
  });
});
