import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ReactQueryProvider } from "@/lib/react-query-provider";

const inter = Inter({ 
  subsets: ["latin"],
  display: "swap", // Use swap to prevent blocking on font load
  fallback: ["system-ui", "arial"], // Fallback fonts
});

export const metadata: Metadata = {
  title: "ReadyGo Consulting Platform",
  description: "Professional consulting platform",
  icons: {
    icon: 'data:,', // Empty data URI to prevent favicon 404
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}


