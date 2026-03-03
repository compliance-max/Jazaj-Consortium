import type { Metadata } from "next";
import "./globals.css";
import SupportChatWidget from "@/components/support-chat-widget";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Consortium Manager",
  description: "CTPA consortium management platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SupportChatWidget />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
