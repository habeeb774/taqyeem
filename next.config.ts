import type {NextConfig} from 'next';
const nextConfig:NextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  async headers(){
    return [
      {source:'/legacy.html',headers:[{key:'Cache-Control',value:'no-store, no-cache, must-revalidate, max-age=0'}]},
      {source:'/full-services.js',headers:[{key:'Cache-Control',value:'no-store, no-cache, must-revalidate, max-age=0'}]},
    ];
  },
};
export default nextConfig;
