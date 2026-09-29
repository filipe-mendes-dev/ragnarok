import type { Metadata } from "next";

import { PageFrame } from "@/features/shell/PageFrame";
import { SiteFooter } from "@/features/shell/SiteFooter";
import { SiteHeader } from "@/features/shell/SiteHeader";
import { getCurrentUser } from "@/server/auth/session";

import "./globals.css";

export const metadata: Metadata = {
  title: "RAGnarok",
  description: "Grounded document answers with inspectable retrieval traces.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <PageFrame header={<SiteHeader user={user} />} footer={<SiteFooter />}>{children}</PageFrame>
      </body>
    </html>
  );
}
