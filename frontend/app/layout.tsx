import "./globals.css";
import { Lato } from "next/font/google";
import { ClientProviders } from "./providers";

const lato = Lato({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

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
      className={`${lato.className} bg-white`}
      suppressHydrationWarning
    >
      <head>
        <style>{`html { background: white; } body { background: white; }`}</style>
      </head>
      <body className="bg-white">
        <ClientProviders>
          <main className="min-h-screen bg-white">{children}</main>
        </ClientProviders>
      </body>
    </html>
  );
}
