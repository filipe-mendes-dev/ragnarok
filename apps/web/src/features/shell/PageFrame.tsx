"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
interface PageFrameProps { children: ReactNode; header: ReactNode; footer: ReactNode }
export function PageFrame({ children, header, footer }: PageFrameProps) {
    const pathname = usePathname();
    const chat = pathname === "/chat" || pathname.startsWith("/chat/");
    return <div className={chat ? "flex h-dvh flex-col overflow-hidden" : "flex min-h-svh flex-col"}>
        <div className="shrink-0">{header}</div>
        <div className={chat ? "flex min-h-0 min-w-0 flex-1 flex-col" : "min-w-0 flex-1"}>{children}</div>
        {!chat && footer}
    </div>;
}
