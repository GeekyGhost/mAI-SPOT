import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: { MAISPOT_VERSION: pkg.version },
  // Dev and production builds live in separate folders so switching modes never corrupts either.
  distDir: process.env.MAISPOT_VERIFY_BUILD === "1" ? ".next-verify" : process.env.MAISPOT_DEV === "1" ? ".next-dev" : ".next",
  // Loaded with Node's own require so its WASM file is found on disk.
  serverExternalPackages: ["node-unrar-js"],
};

export default nextConfig;
