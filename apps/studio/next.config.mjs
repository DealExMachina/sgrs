/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@sgrs/ui", "@sgrs/graph"],
  typedRoutes: true,
};

export default nextConfig;
