import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@synapse/tour-engine", "@synapse/ui", "@synapse/domain", "@synapse/contracts"],
};

export default config;
