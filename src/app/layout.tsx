export default function RootLayout({children}:{children:React.ReactNode}){
  return (
    <html lang="ar" dir="rtl">
      <head>
        <style>{`
          @font-face {
            font-family: 'ThSans';
            src: url('/thsans.otf') format('opentype');
            font-weight: 300 900;
            font-style: normal;
            font-display: swap;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
