import type { Metadata, Viewport } from 'next';
import { BRAND } from '@/config/branding';
import { ThemeProvider } from '@/components/ThemeProvider';
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

const themeInitScript = `
  (function() {
    try {
      var saved = localStorage.getItem('theme');
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'dark' || ((!saved || saved === 'system') && prefersDark)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
