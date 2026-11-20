import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { connection } from "next/server";
import HeartbeatKeepalive from "@/components/HeartbeatKeepalive";
import { Sidebar } from "@/components/Sidebar";
import { PreviewModal } from "@/components/PreviewModal";
import { SearchPlatformsProvider } from "@/components/SearchPlatformsProvider";
import { availableSearchPlatforms } from "@/lib/sourceAvailability";
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
  description: "Search 3D printing, CAD and Blender / 3D asset libraries in one place",
  other: {
    "darkreader-lock": "",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read optional provider credentials at runtime, not when building the app.
  await connection();
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-spool-bg text-spool-text" suppressHydrationWarning>
        <HeartbeatKeepalive />
        <SearchPlatformsProvider platforms={availableSearchPlatforms()}>
          <div className="min-h-screen lg:flex">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">{children}</div>
          </div>
        </SearchPlatformsProvider>
        <PreviewModal />
      </body>
    </html>
  );
}
