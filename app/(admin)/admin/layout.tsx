import { DashboardLayout } from "@/components/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout mode="admin">{children}</DashboardLayout>;
}
