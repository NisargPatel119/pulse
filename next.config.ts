import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard is a static page in /public; serve it at the root
  async rewrites() {
    return { afterFiles: [{ source: "/", destination: "/index.html" }] };
  },
};

export default nextConfig;
