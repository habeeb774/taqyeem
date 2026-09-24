import './design-system.css';
import { GOOGLE_FONTS_URL, getBrandingOverrideCss } from '@/server/branding';

export default async function RootLayout({children}:{children:React.ReactNode}){
  const overrideCss = await getBrandingOverrideCss();

  return (
    <html lang="ar" dir="rtl">
      <head>
        <link href="/unified-font.css?v=20260924-original" rel="stylesheet" />
        <link href="/system-topbar.css" rel="stylesheet" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_URL} rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: overrideCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
