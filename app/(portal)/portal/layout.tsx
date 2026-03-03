import { DashboardLayout } from "@/components/app-shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout mode="portal">{children}</DashboardLayout>;
}
