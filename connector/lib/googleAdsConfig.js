// Google Ads API configuration.
// Env vars are injected by Vercel (production) and by Next.js .env.local (dev).
// dotenv is intentionally not used here — Next handles env loading and
// adding dotenv as a dep on the hosted connector would be redundant weight.

const googleAdsConfig = {
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  use_proto_plus: true,
};

export default googleAdsConfig;
