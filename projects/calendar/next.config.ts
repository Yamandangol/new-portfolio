import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // There is an unrelated package-lock.json in the parent directories, which
  // makes Turbopack's workspace-root inference ambiguous. Pin it here.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
