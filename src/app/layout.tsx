import type { Metadata } from "next";
import { connection } from "next/server";
import HeartbeatKeepalive from "@/components/HeartbeatKeepalive";
import { ComparisonTray } from "@/components/ComparisonTray";
import { OnboardingModal } from "@/components/OnboardingModal";
import { OrcaWebViewStyle } from "@/components/OrcaWebViewStyle";
import { Sidebar } from "@/components/Sidebar";
import { PreviewModal } from "@/components/PreviewModal";
import { SearchPlatformsProvider } from "@/components/SearchPlatformsProvider";
import { availableSearchPlatforms } from "@/lib/sourceAvailability";
import "./globals.css";

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
      className="h-full antialiased dark"
      suppressHydrationWarning
    >
      <body className="min-h-full bg-spool-bg text-spool-text" suppressHydrationWarning>
        <OrcaWebViewStyle />
        <HeartbeatKeepalive />
        <SearchPlatformsProvider platforms={availableSearchPlatforms()}>
          <div className="min-h-screen lg:flex">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              {children}
              <ComparisonTray />
            </div>
          </div>
        </SearchPlatformsProvider>
        <PreviewModal />
        <OnboardingModal />
      </body>
    </html>
  );
}
