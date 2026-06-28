import { redirect } from 'next/navigation';

// Retro-compat: the global "new deployment" flow was removed (deployments are
// created from a project/service). Old bookmarks land on the deployments center.
export default function DeploymentsNewRedirectPage() {
  redirect('/deployments');
}
