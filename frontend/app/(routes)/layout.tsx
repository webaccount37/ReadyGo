/**
 * Layout for routes with sidebar navigation.
 */

import { MainLayout } from "@/components/layout/main-layout";

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}

