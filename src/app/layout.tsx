import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/config/branding';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${BRAND.orgName} — ${BRAND.productName}`,
    template: `%s · ${BRAND.orgName}`,
  },
  description: `${BRAND.productName} for ${BRAND.orgName}. Local build.`,
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  themeColor: BRAND.primary,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
