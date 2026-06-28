/**
 * Result<T, E> — alternative aux exceptions pour les chemins critiques.
 *
 * Usage :
 *   const result = await deployService.deploy(params);
 *   if (!result.ok) { handle(result.error); return; }
 *   use(result.value);
 *
 * Les services infrastructure/ et deployments/core/ DOIVENT retourner
 * Result pour les erreurs prévisibles (connexion perdue, timeout, image
 * introuvable). Les erreurs de programmation restent des exceptions.
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Construit un Result en succès */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construit un Result en échec */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Déballe la valeur ou relance l'erreur comme exception */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  if (result.error instanceof Error) throw result.error;
  throw new Error(String(result.error));
}
