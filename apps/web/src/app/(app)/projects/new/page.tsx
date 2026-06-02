import { redirect } from 'next/navigation';

export default function ProjectsNewRedirectPage() {
  redirect('/projects?dialog=create-project');
}
