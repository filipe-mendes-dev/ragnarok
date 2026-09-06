import type { Metadata } from "next";

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
      <body className="flex min-h-svh flex-col">
        <SiteHeader user={user} />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
