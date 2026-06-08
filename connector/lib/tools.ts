import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Vendored copy of src/services/keywordPlannerService.js because Vercel only
// uploads files inside the project root. Sync via scripts/sync-service.sh
// when the upstream service changes.
// @ts-ignore — JS file with no declarations
import keywordPlannerService from './keywordPlannerService.js';
import { log } from './logger';

/**
 * Tool input schemas. Exported so the .dxt proxy can mirror them.
 */
export const SCHEMAS = {
  research_keywords: {
    keyword: z.string().describe('Seed keyword to generate ideas from'),
    language: z.string().optional().default('en').describe('Language code (e.g., "en", "es", "fr")'),
    locations: z
      .array(z.number())
      .optional()
      .default([2840])
      .describe('Array of Google Ads geo target constant IDs. 2840 = US, 2826 = UK.'),
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
} as const;

/**
 * Register all keyword-research tools on an McpServer instance.
 * Called by both the hosted Vercel handler and (in the future) any other transport.
 */
export function registerTools(server: McpServer): void {
  server.tool(
    'research_keywords',
    'Discover keyword ideas for an article topic using Google Ads Keyword Planner. Pass a seed phrase like "engine leasing" and get back related keywords with monthly search volume, competition level, and CPC bid estimates. Use this as the first step when planning a new article.',
    SCHEMAS.research_keywords,
    async ({ keyword, language, locations, limit }) => {
      const t0 = Date.now();
      try {
        const results = await keywordPlannerService.generateKeywordIdeas(keyword, language, locations, limit);
        log('info', 'tool.ok', { tool: 'research_keywords', keyword, latencyMs: Date.now() - t0 });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ seedKeyword: keyword, count: results.length, keywordIdeas: results }, null, 2),
            },
          ],
        };
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        log('error', 'tool.err', { tool: 'research_keywords', keyword, latencyMs: Date.now() - t0, err });
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_keyword_metrics',
    'Get search volume, competition, and CPC bid estimates for a specific list of keywords (no expansion). Use this after research_keywords when you want fresh metrics for an exact shortlist you already have.',
    SCHEMAS.get_keyword_metrics,
    async ({ keywords, language, locations }) => {
      const t0 = Date.now();
      try {
        const results = await keywordPlannerService.getKeywordMetrics(keywords, language, locations);
        log('info', 'tool.ok', { tool: 'get_keyword_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0 });
        return {
          content: [
            { type: 'text', text: JSON.stringify({ keywords, count: results.length, metrics: results }, null, 2) },
          ],
        };
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        log('error', 'tool.err', { tool: 'get_keyword_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0, err });
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.tool(
    'get_historical_metrics',
    'Get historical forecast metrics for keywords by creating a temporary Google Ads keyword plan. Use this when you need projected performance, not just current monthly searches.',
    SCHEMAS.get_historical_metrics,
    async ({ keywords, language, locations }) => {
      const t0 = Date.now();
      try {
        const results = await keywordPlannerService.getHistoricalMetrics(keywords, language, locations);
        log('info', 'tool.ok', { tool: 'get_historical_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0 });
        return {
          content: [{ type: 'text', text: JSON.stringify({ keywords, forecastMetrics: results }, null, 2) }],
        };
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        log('error', 'tool.err', { tool: 'get_historical_metrics', keywordCount: keywords.length, latencyMs: Date.now() - t0, err });
        return { content: [{ type: 'text', text: `Error: ${err}` }], isError: true };
      }
    },
  );

  server.tool(
    'health_check',
    'Check that the SEO AI connector is up and that all required Google Ads env vars are present. Returns names of missing variables (never values).',
    {},
    async () => {
      const required = [
        'GOOGLE_ADS_DEVELOPER_TOKEN',
        'GOOGLE_ADS_CLIENT_ID',
        'GOOGLE_ADS_CLIENT_SECRET',
        'GOOGLE_ADS_REFRESH_TOKEN',
        'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
        'CONNECTOR_SHARED_TOKEN',
      ];
      const missing = required.filter((k) => !process.env[k]);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: missing.length === 0 ? 'ok' : 'misconfigured',
                tools: ['research_keywords', 'get_keyword_metrics', 'get_historical_metrics', 'health_check'],
                missingEnvVars: missing,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
