import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import AmbientBackground from "./components/ui/AmbientBackground";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "StreamArc",
  description: "Pay only for what you watch",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="font-sans">
        <AmbientBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
