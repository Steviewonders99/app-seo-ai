/** @type {import('next').NextConfig} */
const nextConfig = {
  // No special config required. Service files (keywordPlannerService.js,
  // googleAdsConfig.js) are vendored into lib/ by scripts/sync-service.sh,
  // so there are no cross-directory imports to handle.
};

export default nextConfig;
