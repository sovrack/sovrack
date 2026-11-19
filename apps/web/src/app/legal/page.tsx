import { PublicPolicyPage } from "@/components/marketing/public-policy-page";

export default function LegalPage() {
  return (
    <PublicPolicyPage
      eyebrow="Informations légales"
      title="Mentions légales"
      description="Informations relatives à l’édition et à l’utilisation du site et du service Sovrack."
      sections={[
        {
          title: "Éditeur et contact",
          paragraphs: [
            "Le site et le service sont publiés sous le nom Sovrack depuis la Tunisie.",
            "Le point de contact unique pour toute demande administrative, technique ou relative aux données personnelles est contact@sovrack.com.",
          ],
        },
        {
          title: "Hébergement",
          paragraphs: [
            "Le site et le plan de contrôle Sovrack sont hébergés sur une infrastructure privée administrée par l’éditeur. Les applications déployées par les clients restent hébergées sur les serveurs qu’ils connectent au service.",
          ],
        },
        {
          title: "Propriété intellectuelle",
          paragraphs: [
            "La marque, le logo, l’interface, les textes et les composants propres à Sovrack sont protégés. Leur reproduction ou exploitation non autorisée est interdite.",
            "Le client conserve ses droits sur ses dépôts, images, domaines, configurations et contenus applicatifs.",
          ],
        },
        {
          title: "Responsabilité",
          paragraphs: [
            "Sovrack fournit des outils d’orchestration pour des serveurs contrôlés par le client. Le client reste responsable de ses contenus, de ses licences, de ses sauvegardes applicatives et de la sécurité des accès qu’il fournit.",
            "Les limites et responsabilités détaillées sont précisées dans les conditions d’utilisation.",
          ],
        },
        {
          title: "Droit applicable",
          paragraphs: [
            "Les présentes informations sont régies par le droit tunisien, sous réserve des règles impératives éventuellement applicables au lieu de résidence du client.",
          ],
        },
      ]}
    />
  );
}
