import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ["@microsoft/microsoft-graph-client"],
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei", "three-stdlib"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "graph.microsoft.com",
      },
    ],
  },
};

export default nextConfig;
