import AuthProviders from '@/components/AuthProviders';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  verification: {
    google: "CIihGPwGogeiZMAvmEVlsVbhQcKNfsfG-CgC4JoeRTk",
  },
  title: "PU-FOP — Form & Title Online Portal",
  description:
    "The official dissertation management portal for Parul University, Faculty of Pharmacy. Submit, track, and manage research proposals.",
  keywords: [
    "Parul University",
    "pharmacy",
    "dissertation",
    "research",
    "PU-FOP",
  ],
  icons: {
    icon: "/images/pu_logo.png",
    apple: "/images/pu_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-white text-slate-900">
        <AuthProviders><ToastProvider>{children}</ToastProvider></AuthProviders>
      </body>
    </html>
  );
}
