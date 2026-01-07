import "./globals.css";
import { Inter } from "next/font/google";
import { ClientProviders } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Studio",
  description: "The secure AI platform for boutique financial firms",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className="bg-white"
      suppressHydrationWarning
    >
      <head>
        <style>{`html { background: white; } body { background: white; }`}</style>
      </head>
      <body className={`bg-white ${inter.className}`}>
        <ClientProviders>
          <main className="min-h-screen bg-white">{children}</main>
        </ClientProviders>
      </body>
    </html>
  );
}
