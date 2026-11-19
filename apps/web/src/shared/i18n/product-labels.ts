/**
 * Libellés français des valeurs techniques exposées par l'API.
 *
 * Les enums restent en anglais dans le contrat et en base. Leur traduction
 * appartient uniquement à la couche de présentation afin de ne jamais faire
 * dépendre les autorisations d'un texte affiché.
 */
export function workspaceRoleLabel(role?: string | null): string {
  switch (role) {
    case "OWNER":
      return "Propriétaire";
    case "ADMIN":
      return "Administrateur";
    case "MEMBER":
      return "Membre";
    default:
      return "Membre";
  }
}

export function deploymentStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "SUCCESS":
      return "Réussi";
    case "FAILED":
      return "Échoué";
    case "RUNNING":
      return "En cours";
    case "PENDING":
    case "CREATED":
      return "En attente";
    case "CANCELED":
    case "CANCELLED":
      return "Annulé";
    case "SKIPPED":
      return "Ignoré";
    default:
      return status;
  }
}
