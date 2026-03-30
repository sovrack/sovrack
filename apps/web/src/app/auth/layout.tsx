export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth pages don't have a header/sidebar
  return <>{children}</>;
}
