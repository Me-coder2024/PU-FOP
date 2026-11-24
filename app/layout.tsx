import AuthProviders from '@/components/AuthProviders';
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { SITE_URL, SITE_DESCRIPTION } from '@/lib/site';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: 'PU-FOP',
  openGraph: {
    type: 'website', locale: 'en_IN', siteName: 'PU-FOP',
    title: 'PU-FOP | Parul University Pharmacy Research Portal',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PU-FOP | Parul University Pharmacy Research Portal',
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
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
