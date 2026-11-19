import { redirect } from "next/navigation";

export default function AdminUsersNewRedirectPage() {
  redirect("/admin/teams");
}
