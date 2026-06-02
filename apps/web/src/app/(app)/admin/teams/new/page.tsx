import { redirect } from 'next/navigation';

export default function AdminTeamsNewRedirectPage() {
  redirect('/admin/teams?dialog=create-team');
}
