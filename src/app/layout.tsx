import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import HeartbeatKeepalive from "@/components/HeartbeatKeepalive";
import { Sidebar } from "@/components/Sidebar";
import { PreviewModal } from "@/components/PreviewModal";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "AnyStl - 3D Model Meta Search",
  description: "Search 21 3D model sites at once: 3D printing, CAD and Blender / 3D asset libraries",
  other: {
    "darkreader-lock": "",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-spool-bg text-spool-text" suppressHydrationWarning>
        <HeartbeatKeepalive />
        <div className="min-h-screen lg:flex">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
        <PreviewModal />
      </body>
    </html>
  );
}
