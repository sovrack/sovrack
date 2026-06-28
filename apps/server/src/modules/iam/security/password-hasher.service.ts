import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';

/**
 * Hachage des mots de passe — point unique pour toute la plateforme.
 *
 * Hache en **argon2id** (recommandation OWASP 2024, résistant GPU). Vérifie
 * de façon transparente les hachages legacy **bcrypt** : combiné à
 * {@link needsRehash}, cela permet une migration douce — chaque utilisateur
 * passe à argon2id à sa prochaine connexion réussie, sans reset de mot de
 * passe ni rupture des comptes existants.
 */
@Injectable()
export class PasswordHasher {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  /**
   * Vérifie un mot de passe contre un hachage argon2id OU bcrypt (legacy).
   * Le préfixe du hachage détermine l'algorithme — aucune config à passer.
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    if (hash.startsWith('$argon2')) {
      try {
        return await argon2.verify(hash, plain);
      } catch {
        return false;
      }
    }
    // Hachages legacy bcrypt ($2a$/$2b$/$2y$).
    return bcrypt.compare(plain, hash);
  }

  /** Vrai si le hachage n'est pas en argon2id → à re-hacher après vérif OK. */
  needsRehash(hash: string): boolean {
    return !hash.startsWith('$argon2');
  }
}
