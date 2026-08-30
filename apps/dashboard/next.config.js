/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@lolpamin/core", "@lolpamin/db"],
  experimental: {
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

module.exports = nextConfig;
