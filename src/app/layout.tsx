import './design-system.css';
import { FONT_STYLESHEET_URL, getBrandingOverrideCss } from '@/server/branding';
import { BrandingSync } from '@/components/BrandingSync';

export const dynamic = 'force-dynamic';

export default async function RootLayout({children}:{children:React.ReactNode}){
  const overrideCss = await getBrandingOverrideCss();

  return (
    <html lang="ar" dir="rtl">
      <head>
        <link href="/unified-font.css?v=20260924-original" rel="stylesheet" />
        <link href="/system-topbar.css" rel="stylesheet" />
        <link href={FONT_STYLESHEET_URL} rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: overrideCss }} />
      </head>
      <body>
        <BrandingSync />
        {children}
      </body>
    </html>
  );
}
