/**
 * IAM — Identité & Accès (porte publique unique du contexte).
 * Seuls ces exports sont importables depuis l'extérieur du contexte.
 */
export { AuthModule } from './auth/auth.module';
export { UsersModule } from './users/users.module';
export { TeamsModule } from './teams/teams.module';
export { SshKeysModule } from './ssh-keys/ssh-keys.module';
