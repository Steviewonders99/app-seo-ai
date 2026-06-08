/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Next's bundler to follow imports outside the project root
  // (we import ../../src/services/keywordPlannerService.js).
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
