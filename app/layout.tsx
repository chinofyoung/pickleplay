import { Barlow, Barlow_Condensed } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
const barlow = Barlow({ subsets: ["latin"], weight: ["300","400","500","600","700"], variable: "--font-body", display: "swap" });
const barlowCondensed = Barlow_Condensed({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-heading", display: "swap" });
export const metadata = { title: "PicklePlay", description: "Book pickleball courts" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${barlow.variable} ${barlowCondensed.variable} antialiased selection:bg-primary/30 selection:text-white overflow-x-hidden`}>
        {children}
        <Toaster richColors closeButton position="top-right" />
      </body>
    </html>
  );
}
