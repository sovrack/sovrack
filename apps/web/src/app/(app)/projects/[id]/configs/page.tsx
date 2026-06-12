import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export default async function ConfigsRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/projects/${id}?tab=environments`);
}
