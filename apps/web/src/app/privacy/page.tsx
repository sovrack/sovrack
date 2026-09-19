import { PublicPolicyPage } from "@/components/marketing/public-policy-page";

export default function PrivacyPage() {
  return (
    <PublicPolicyPage
      eyebrow="Données personnelles"
      title="Politique de confidentialité"
      description="Cette politique explique quelles données Sovrack traite pour fournir, sécuriser et améliorer le service."
      sections={[
        {
          title: "Données traitées",
          paragraphs: [
            "Sovrack traite uniquement les informations nécessaires au fonctionnement du service.",
          ],
          items: [
            "Identité du compte : nom, adresse email et état de vérification.",
            "Appartenances, rôles et invitations des espaces de travail.",
            "Métadonnées des projets, serveurs, services et déploiements.",
            "Journaux techniques, de sécurité et d’audit.",
            "Informations de session telles que l’adresse IP et l’agent utilisateur lorsque la sécurité l’exige.",
          ],
        },
        {
          title: "Finalités",
          paragraphs: [
            "Ces données sont utilisées pour authentifier les utilisateurs, exécuter les opérations demandées, appliquer les autorisations, prévenir les abus, diagnostiquer les incidents et assurer la traçabilité.",
          ],
        },
        {
          title: "Secrets et accès techniques",
          paragraphs: [
            "Les secrets enregistrés par le service sont chiffrés au repos. Ils ne sont jamais demandés par email. Les membres du back-office utilisent des comptes séparés et les sessions d’assistance sont limitées, motivées et journalisées.",
          ],
        },
        {
          title: "Conservation et suppression",
          paragraphs: [
            "Les données du compte sont conservées pendant son utilisation. Une suppression confirmée révoque immédiatement l’accès et ouvre un délai de grâce de 30 jours avant purge des données concernées, sous réserve des journaux nécessaires à la sécurité ou des obligations légales.",
          ],
        },
        {
          title: "Vos droits",
          paragraphs: [
            "Vous pouvez demander l’accès, la rectification, l’export ou la suppression de vos données en écrivant à contact@sovrack.tech. Une vérification d’identité peut être demandée afin d’éviter toute divulgation à un tiers.",
          ],
        },
      ]}
    />
  );
}
