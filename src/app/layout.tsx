import type { Metadata } from "next";
import { Outfit, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Outfit({ subsets: ["latin"], variable: "--ds-font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--ds-font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--ds-font-mono" });

export const metadata: Metadata = { title: "SyncFit", description: "Hybrid training readiness" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
