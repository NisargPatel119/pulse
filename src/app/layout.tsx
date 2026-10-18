import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Pulse",
  description: "Recovery, sleep and strain from your Fitbit",
  // Lets you "Add to Home Screen" on iPhone and open it like an app
  appleWebApp: { capable: true, title: "Pulse", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0e1013",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0e1013" }}>{children}</body>
    </html>
  );
}
