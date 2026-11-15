import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@synapse/tour-engine",
    "@synapse/3d-engine",
    "@synapse/ui",
    "@synapse/domain",
    "@synapse/contracts",
  ],
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;
