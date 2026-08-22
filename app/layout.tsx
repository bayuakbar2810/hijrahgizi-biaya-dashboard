import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Analisis Biaya Produksi â€” Hijrah Gizi Hewani",
  description:
    "Dashboard analisis pembiayaan berdasarkan histori pekerjaan pesanan PT Hijrah Gizi Hewani",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${body.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}