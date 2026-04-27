import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ServerDetailsRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/admin/servers/${id}`);
}
