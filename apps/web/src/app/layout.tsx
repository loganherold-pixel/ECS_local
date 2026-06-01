import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ECS Vehicle Trail System",
  description: "Initial ECS trail legality and route-planning scaffold.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
