import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["clawpdf", "tesseract.js", "unzipper"],
};

export default nextConfig;
