import './design-system.css';
import { getPublicBranding } from '@/server/branding';

export default async function RootLayout({children}:{children:React.ReactNode}){
  const branding = await getPublicBranding();
  const overrides = [
    branding.useSystemFont ? '--app-font: Tahoma, Arial, system-ui, sans-serif;' : '',
    branding.logoUrl ? `--brand-logo-url: url('${branding.logoUrl}');` : '',
  ].filter(Boolean).join(' ');

  return (
    <html lang="ar" dir="rtl">
      <head>
        <link href="/unified-font.css?v=20260924-original" rel="stylesheet" />
        <link href="/system-topbar.css" rel="stylesheet" />
        {overrides && <style dangerouslySetInnerHTML={{ __html: `:root{${overrides}}` }} />}
      </head>
      <body>{children}</body>
    </html>
  );
}
