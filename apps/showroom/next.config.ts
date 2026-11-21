import type { NextConfig } from "next";
import path from "node:path";
import { securityHeaders } from "../../config/security-headers.mjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@synapse/tour-engine",
    "@synapse/3d-engine",
    "@synapse/ui",
    "@synapse/domain",
    "@synapse/contracts",
  ],
  headers: async () => securityHeaders(["https://tiles.openfreemap.org"], { googleSignIn: true }),
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
};

export default nextConfig;
