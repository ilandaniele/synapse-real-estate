import type { NextConfig } from "next";
import { securityHeaders } from "../../config/security-headers.mjs";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@synapse/tour-engine", "@synapse/ui", "@synapse/domain", "@synapse/contracts"],
  headers: async () => securityHeaders([], { googleSignIn: true }),
};

export default config;
