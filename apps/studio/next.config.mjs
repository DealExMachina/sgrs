/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@sgrs/ui", "@sgrs/graph"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
