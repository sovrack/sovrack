import { PublicPolicyPage } from "@/components/marketing/public-policy-page";

export default function SecurityPage() {
  return (
    <PublicPolicyPage
      eyebrow="Confiance"
      title="Sécurité de Sovrack"
      description="Principes appliqués pour protéger les identités, les secrets et les opérations de déploiement."
      sections={[
        {
          title: "Séparation des accès",
          paragraphs: [
            "Le site public, la console client et le back-office utilisent des domaines distincts. Les sessions client et staff reposent sur des cookies host-only séparés.",
          ],
        },
        {
          title: "Secrets",
          paragraphs: [
            "Les jetons Git, identifiants de registre et autres configurations sensibles sont chiffrés au repos. Les réponses API et les journaux ne doivent jamais renvoyer leur valeur en clair.",
          ],
        },
        {
          title: "Contrôle des opérations",
          paragraphs: [
            "Les autorisations sont évaluées par espace de travail et par projet. Les comptes staff sont séparés des utilisateurs clients et leurs actions sensibles sont auditées.",
          ],
        },
        {
          title: "Protection du compte client",
          paragraphs: [
            "La connexion standard utilise l’adresse email et le mot de passe. La double authentification TOTP est facultative pour les clients : elle n’est demandée que si le titulaire choisit de l’activer dans Mon compte. Des codes de secours à usage unique sont alors fournis.",
          ],
        },
        {
          title: "Signaler une vulnérabilité",
          paragraphs: [
            "Envoyez un signalement responsable à contact@sovrack.com avec une description, les étapes de reproduction et l’impact estimé. N’accédez pas aux données d’un tiers et n’interrompez pas le service.",
          ],
        },
      ]}
    />
  );
}
