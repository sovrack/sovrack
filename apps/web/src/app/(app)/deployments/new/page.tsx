import { redirect } from 'next/navigation';

export default function DeploymentsNewRedirectPage() {
  redirect('/deployments?dialog=create-deployment');
}
