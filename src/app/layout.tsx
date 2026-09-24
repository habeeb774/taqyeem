import './design-system.css';
import { getBrandingOverrideCss } from '@/server/branding';

export default async function RootLayout({children}:{children:React.ReactNode}){
  const overrideCss = await getBrandingOverrideCss();

  return (
    <html lang="ar" dir="rtl">
      <head>
        <link href="/unified-font.css?v=20260924-original" rel="stylesheet" />
        <link href="/system-topbar.css" rel="stylesheet" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Alexandria:wght@300;400;500;600;700&family=Cairo:wght@300;400;500;600;700&family=Tajawal:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: overrideCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
