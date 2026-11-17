import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AZIMARA RELAY — Non-custodial treasury operations on Solana",
  description:
    "AZIMARA RELAY is an intelligent financial operations platform for managing, approving, executing, monitoring and reconciling onchain payments. Non-custodial. MultiHopper routing. AI-assisted operations.",
  keywords: ["Solana", "treasury", "payments", "non-custodial", "MultiHopper", "USDC", "batch payouts", "approval policy"],
  authors: [{ name: "AI Azimara" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
