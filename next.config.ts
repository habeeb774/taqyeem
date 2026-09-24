import type {NextConfig} from 'next';
const securityHeaders = [
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig:NextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  outputFileTracingIncludes:{
    '/forms':['./src/templates/forms.html'],
    '/assessment':['./src/templates/assessment.html'],
  },
  async headers(){
    return [
      {source:'/:path*',headers:securityHeaders},
      {source:'/legacy.html',headers:[...securityHeaders,{key:'Cache-Control',value:'no-store, no-cache, must-revalidate, max-age=0'}]},
      {source:'/full-services.js',headers:[...securityHeaders,{key:'Cache-Control',value:'no-store, no-cache, must-revalidate, max-age=0'}]},
    ];
  },
  async redirects(){
    return [
      {source:'/forms.html',destination:'/forms',permanent:true},
      {source:'/legacy.html',destination:'/assessment',permanent:true},
    ];
  },
};
export default nextConfig;
