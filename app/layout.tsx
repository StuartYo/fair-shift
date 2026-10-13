import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent core",
  description: "Nemotron on Nebius Token Factory with Tavily retrieval from official sources.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
