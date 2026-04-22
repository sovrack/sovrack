import { redirect } from 'next/navigation';

export default function AdminTeamsNewRedirectPage() {
  redirect('/admin/users?dialog=create-team');
}
