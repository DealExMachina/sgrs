/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@sgrs/ui", "@sgrs/graph", "@sgrs/client-ts"],
  typedRoutes: true,
  turbopack: {
    root: "../../",
  },
};

export default nextConfig;
