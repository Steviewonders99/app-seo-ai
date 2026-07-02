import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (two levels up from config/)
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

// Google Ads API configuration
const googleAdsConfig = {
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  use_proto_plus: true,
};

export default googleAdsConfig;