import { PublicPolicyPage } from "@/components/marketing/public-policy-page";

export default function TermsPage() {
  return (
    <PublicPolicyPage
      eyebrow="Conditions"
      title="Conditions d’utilisation"
      description="Ces conditions encadrent l’accès à Sovrack et l’utilisation de la plateforme avec vos propres serveurs."
      sections={[
        {
          title: "Compte et accès",
          paragraphs: [
            "Vous devez fournir des informations exactes, protéger vos identifiants et signaler rapidement tout accès suspect. Vous êtes responsable des actions réalisées depuis votre compte jusqu’à leur signalement.",
          ],
        },
        {
          title: "Serveurs et contenus",
          paragraphs: [
            "Vous devez disposer des droits nécessaires sur les serveurs, dépôts, images, domaines et contenus connectés à Sovrack. Vous restez responsable de leur conformité, de leur sécurité et de leurs sauvegardes applicatives.",
          ],
        },
        {
          title: "Disponibilité",
          paragraphs: [
            "Sovrack met en œuvre des mesures raisonnables de disponibilité et de reprise. L’accès gratuit ne comporte toutefois aucun engagement contractuel de niveau de service ou d’indemnisation.",
          ],
        },
        {
          title: "Suspension",
          paragraphs: [
            "Un compte ou un espace peut être suspendu en cas d’abus, de risque de sécurité, d’utilisation illégale ou d’atteinte au fonctionnement de la plateforme. Lorsque la situation le permet, le titulaire est informé par email.",
          ],
        },
        {
          title: "Évolution du service",
          paragraphs: [
            "Les fonctions disponibles et leurs limites peuvent évoluer. Une modification importante affectant les utilisateurs sera communiquée de manière appropriée avant son entrée en vigueur lorsque cela est possible.",
          ],
        },
      ]}
    />
  );
}
