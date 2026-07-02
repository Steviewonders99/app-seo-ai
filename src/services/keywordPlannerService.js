import { OAuth2Client } from 'google-auth-library';
import googleAdsConfig from '../config/googleAdsConfig.js';

const API_VERSION = 'v21';
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}/customers/${googleAdsConfig.login_customer_id}`;

// Language code to Google Ads languageConstants resource name mapping
const LANGUAGE_MAP = {
  en: 'languageConstants/1000',
  de: 'languageConstants/1001',
  fr: 'languageConstants/1002',
  es: 'languageConstants/1003',
  it: 'languageConstants/1004',
  pt: 'languageConstants/1014',
  nl: 'languageConstants/1010',
  ja: 'languageConstants/1005',
  ko: 'languageConstants/1012',
  zh: 'languageConstants/1017',
  ru: 'languageConstants/1031',
  ar: 'languageConstants/1019',
  hi: 'languageConstants/1023',
};

// Competition level enum labels
const COMPETITION_LABELS = {
  UNSPECIFIED: 'UNSPECIFIED',
  UNKNOWN: 'UNKNOWN',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
};

// OAuth2 client for token management
const oauth2Client = new OAuth2Client(
  googleAdsConfig.client_id,
  googleAdsConfig.client_secret,
);
oauth2Client.setCredentials({ refresh_token: googleAdsConfig.refresh_token });

/**
 * Get a valid access token, refreshing if needed.
 */
async function getAccessToken() {
  const { token } = await oauth2Client.getAccessToken();
  return token;
}

/**
 * Make an authenticated REST call to the Google Ads API.
 */
async function googleAdsRequest(path, body) {
  const accessToken = await getAccessToken();
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': googleAdsConfig.developer_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Ads API error (${response.status}): ${errorBody}`);
  }

  return response.json();
}

function toLanguageResource(language) {
  return LANGUAGE_MAP[language] || `languageConstants/${language}`;
}

function toGeoResources(locations) {
  return locations.map((loc) =>
    String(loc).startsWith('geoTargetConstants/')
      ? String(loc)
      : `geoTargetConstants/${loc}`
  );
}

function formatIdeaResult(idea) {
  const metrics = idea.keywordIdeaMetrics || {};
  return {
    keyword: idea.text || '',
    avgMonthlySearches: Number(metrics.avgMonthlySearches) || 0,
    competition: COMPETITION_LABELS[metrics.competition] || metrics.competition || 'UNKNOWN',
    competitionIndex: Number(metrics.competitionIndex) || 0,
    lowTopOfPageBid: metrics.lowTopOfPageBidMicros
      ? Number(metrics.lowTopOfPageBidMicros) / 1_000_000
      : 0,
    highTopOfPageBid: metrics.highTopOfPageBidMicros
      ? Number(metrics.highTopOfPageBidMicros) / 1_000_000
      : 0,
  };
}

/**
 * Generate keyword ideas based on a seed keyword.
 */
export const generateKeywordIdeas = async (keyword, language = 'en', locations = [2840], limit = 50) => {
  try {
    const data = await googleAdsRequest(':generateKeywordIdeas', {
      keywordSeed: { keywords: [keyword] },
      language: toLanguageResource(language),
      geoTargetConstants: toGeoResources(locations),
      keywordPlanNetwork: 'GOOGLE_SEARCH_AND_PARTNERS',
      pageSize: limit,
    });

    const results = data.results || [];
    return results.slice(0, limit).map(formatIdeaResult);
  } catch (error) {
    console.error('Error generating keyword ideas:', error);
    throw new Error(`Failed to generate keyword ideas: ${error.message}`);
  }
};

/**
 * Get keyword volume and metrics for a list of keywords.
 */
export const getKeywordMetrics = async (keywords, language = 'en', locations = [2840]) => {
  try {
    const data = await googleAdsRequest(':generateKeywordIdeas', {
      keywordSeed: { keywords },
      language: toLanguageResource(language),
      geoTargetConstants: toGeoResources(locations),
      keywordPlanNetwork: 'GOOGLE_SEARCH_AND_PARTNERS',
    });

    const results = data.results || [];
    return results.map(formatIdeaResult);
  } catch (error) {
    console.error('Error getting keyword metrics:', error);
    throw new Error(`Failed to get keyword metrics: ${error.message}`);
  }
};

/**
 * Get historical metrics for keywords.
 */
export const getHistoricalMetrics = async (keywords, language = 'en', locations = [2840]) => {
  try {
    const data = await googleAdsRequest(':generateKeywordHistoricalMetrics', {
      keywords,
      language: toLanguageResource(language),
      geoTargetConstants: toGeoResources(locations),
      keywordPlanNetwork: 'GOOGLE_SEARCH_AND_PARTNERS',
    });

    const results = data.results || [];
    return results.map((item) => {
      const metrics = item.keywordMetrics || {};
      return {
        keyword: item.text || '',
        avgMonthlySearches: Number(metrics.avgMonthlySearches) || 0,
        competition: COMPETITION_LABELS[metrics.competition] || metrics.competition || 'UNKNOWN',
        competitionIndex: Number(metrics.competitionIndex) || 0,
        lowTopOfPageBid: metrics.lowTopOfPageBidMicros
          ? Number(metrics.lowTopOfPageBidMicros) / 1_000_000
          : 0,
        highTopOfPageBid: metrics.highTopOfPageBidMicros
          ? Number(metrics.highTopOfPageBidMicros) / 1_000_000
          : 0,
      };
    });
  } catch (error) {
    console.error('Error getting historical metrics:', error);
    throw new Error(`Failed to get historical metrics: ${error.message}`);
  }
};

export default {
  generateKeywordIdeas,
  getKeywordMetrics,
  getHistoricalMetrics,
};
