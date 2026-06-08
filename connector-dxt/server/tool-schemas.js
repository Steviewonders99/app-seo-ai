import { z } from 'zod';

export const SCHEMAS = {
  research_keywords: {
    keyword: z.string().describe('Seed keyword to generate ideas from'),
    language: z.string().optional().default('en').describe('Language code (e.g., "en", "es", "fr")'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs. 2840 = US, 2826 = UK.'),
    limit: z.number().optional().default(50).describe('Maximum number of keyword ideas to return'),
  },
  get_keyword_metrics: {
    keywords: z.array(z.string()).describe('Array of exact keywords to get metrics for'),
    language: z.string().optional().default('en').describe('Language code'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs'),
  },
  get_historical_metrics: {
    keywords: z.array(z.string()).describe('Array of keywords to get historical metrics for'),
    language: z.string().optional().default('en').describe('Language code'),
    locations: z.array(z.number()).optional().default([2840]).describe('Array of geo target constant IDs'),
  },
};

export const DESCRIPTIONS = {
  research_keywords: 'Discover keyword ideas for an article topic using Google Ads Keyword Planner. Pass a seed phrase like "engine leasing" and get back related keywords with monthly search volume, competition level, and CPC bid estimates. Use this as the first step when planning a new article.',
  get_keyword_metrics: 'Get search volume, competition, and CPC bid estimates for a specific list of keywords (no expansion). Use this after research_keywords when you want fresh metrics for an exact shortlist you already have.',
  get_historical_metrics: 'Get historical forecast metrics for keywords by creating a temporary Google Ads keyword plan. Use this when you need projected performance, not just current monthly searches.',
  health_check: 'Check that the SEO AI connector is up and that all required Google Ads env vars are present.',
};
