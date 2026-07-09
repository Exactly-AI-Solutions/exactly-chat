import type { ReactNode } from "react";

export const metadata = {
  title: "Exactly Chat",
  description: "Multi-tenant AI chat API",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
