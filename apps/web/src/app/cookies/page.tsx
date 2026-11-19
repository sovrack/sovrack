import { PublicPolicyPage } from "@/components/marketing/public-policy-page";

export default function CookiesPage() {
  return (
    <PublicPolicyPage
      eyebrow="Navigation"
      title="Politique des cookies"
      description="Sovrack limite l’utilisation des cookies aux mécanismes indispensables à la sécurité des sessions."
      sections={[
        {
          title: "Cookies strictement nécessaires",
          paragraphs: [
            "La console client utilise un cookie HttpOnly de session limité au domaine app.sovrack.com. Le back-office utilise un cookie distinct, limité à staff.sovrack.com.",
            "Ces cookies servent uniquement à maintenir une session authentifiée et à protéger les espaces privés. Ils ne sont pas accessibles au code JavaScript du navigateur.",
          ],
        },
        {
          title: "Préférences locales",
          paragraphs: [
            "Le thème et la langue sont conservés dans le stockage local du navigateur. Ils ne sont pas utilisés pour suivre votre navigation entre plusieurs sites.",
          ],
        },
        {
          title: "Mesure d’audience et publicité",
          paragraphs: [
            "Sovrack n’active pas de cookie publicitaire ou de traceur d’audience non essentiel. Si cette politique change, le mécanisme concerné restera bloqué jusqu’au recueil du consentement lorsque celui-ci est requis.",
          ],
        },
      ]}
    />
  );
}
