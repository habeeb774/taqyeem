export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/brand-logo.png" />
        <link href="/unified-font.css" rel="stylesheet" />
        <link href="/system-topbar.css" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
