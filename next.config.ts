import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.26"],
  experimental: {
    serverActions: {
      // Matches Vercel Hobby's hard 4.5 MB serverless body cap — raising
      // this higher would let large dev-mode uploads through but Vercel
      // would still 413 in production, masking the real ceiling. Image
      // uploads in TaskManager are resized client-side to stay well
      // under this, so the limit is rarely the binding constraint.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
