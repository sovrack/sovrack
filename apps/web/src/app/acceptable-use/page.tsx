import { PublicPolicyPage } from "@/components/marketing/public-policy-page";

export default function AcceptableUsePage() {
  return (
    <PublicPolicyPage
      eyebrow="Utilisation responsable"
      title="Politique d’utilisation acceptable"
      description="Sovrack doit être utilisé pour administrer des systèmes et contenus dont vous avez l’autorisation."
      sections={[
        {
          title: "Usages interdits",
          paragraphs: ["Il est interdit d’utiliser Sovrack pour :"],
          items: [
            "accéder à un serveur, dépôt ou compte sans autorisation ;",
            "diffuser des logiciels malveillants, du phishing ou du contenu illégal ;",
            "contourner des contrôles de sécurité ou rechercher des vulnérabilités sans autorisation ;",
            "perturber la plateforme ou les ressources d’autres utilisateurs ;",
            "dissimuler une activité abusive ou usurper une identité.",
          ],
        },
        {
          title: "Réponse aux abus",
          paragraphs: [
            "Sovrack peut limiter ou suspendre un accès afin de protéger la plateforme, les autres utilisateurs ou un tiers. Les signalements doivent être envoyés à contact@sovrack.com avec les éléments techniques utiles, sans partager de secret.",
          ],
        },
      ]}
    />
  );
}
