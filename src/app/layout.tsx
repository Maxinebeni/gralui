import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "@/lib/query";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter is served from this app (src/app/fonts), so builds work without
// internet access and pages make no request to Google. Variable font, Latin
// subset, from @fontsource-variable/inter 5.3.0 (SIL Open Font License 1.1).
const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "GRAL Operations Platform",
  description:
    "Global Risk Advisors Ltd operations platform for claims, client records and renewals.",
  authors: [{ name: "Global Risk Advisors Ltd" }],
  icons: {
    icon: [
      { url: "/favicon_io/favicon.ico", sizes: "any" },
      { url: "/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/favicon_io/apple-touch-icon.png",
  },
  manifest: "/favicon_io/site.webmanifest",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>
          <QueryProvider>
            {children}
            <Toaster position="bottom-right" />
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
