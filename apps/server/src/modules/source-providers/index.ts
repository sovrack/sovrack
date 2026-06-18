/**
 * Source — intégration des fournisseurs Git (porte publique unique du contexte).
 * Façade générique + adapters GitHub/GitLab.
 */
export { SourceProvidersModule } from './source-providers.module';
export { GitlabModule } from './adapters/gitlab/gitlab.module';
export { GithubModule } from './adapters/github/github.module';
