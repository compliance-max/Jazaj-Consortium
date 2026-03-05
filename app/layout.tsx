import type { Metadata } from "next";
import "./globals.css";
import SupportChatWidget from "@/components/support-chat-widget";
import { Toaster } from "sonner";
import Providers from "@/app/providers";

export const metadata: Metadata = {
  title: "Consortium Manager",
  description: "CTPA consortium management platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {children}
          <SupportChatWidget />
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
