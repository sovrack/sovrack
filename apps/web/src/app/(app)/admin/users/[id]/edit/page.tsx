import { redirect } from "next/navigation";

export default function LegacyEditUserPage() {
  redirect("/admin/teams");
}
