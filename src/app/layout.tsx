export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link href="/unified-font.css" rel="stylesheet" />
        <link href="/system-topbar.css" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
