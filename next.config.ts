import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  turbopack: {},
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback };
    config.ignoreWarnings = [/Module not found/];
    return config;
  },
};

export default nextConfig;
