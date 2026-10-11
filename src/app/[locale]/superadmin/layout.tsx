import { redirect } from "@/i18n/navigation";
import { getStaffContext } from "@/lib/supabase/get-staff-context";
import { AdminHeader } from "@/components/admin/AdminHeader";

export default async function SuperadminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { user, staffUser } = await getStaffContext();

  if (!user || !staffUser) {
    redirect({ href: "/iniciar-sesion", locale });
    return null;
  }

  // Only staff with the "super_admin" role may enter the superadmin area.
  if (staffUser.role !== "super_admin") {
    redirect({ href: "/admin", locale });
    return null;
  }

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader fullName={staffUser.full_name} role={staffUser.role} isSuperadmin />
      <main className="flex flex-1 flex-col bg-background-subtle">{children}</main>
    </div>
  );
}
