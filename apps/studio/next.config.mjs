/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  transpilePackages: ["@sgrs/ui", "@sgrs/graph", "@sgrs/client-ts"],
  typedRoutes: true,
  turbopack: {
    root: "../../",
  },
};

export default nextConfig;
