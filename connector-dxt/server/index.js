import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SCHEMAS, DESCRIPTIONS } from './tool-schemas.js';

const REMOTE_URL = process.env.CONNECTOR_REMOTE_URL;
const SHARED_TOKEN = process.env.CONNECTOR_SHARED_TOKEN;

if (!REMOTE_URL) {
  console.error('CONNECTOR_REMOTE_URL not set — check the .dxt manifest.');
  process.exit(1);
}
if (!SHARED_TOKEN) {
  console.error('CONNECTOR_SHARED_TOKEN not set — open Claude Desktop → Settings → Extensions and paste the shared token.');
  process.exit(1);
}

const server = new McpServer({
  name: 'seo-ai-keywords',
  version: '0.1.0',
});

/**
 * Build a tool handler that forwards a tools/call request to the hosted /mcp
 * endpoint over HTTPS and returns the resulting MCP content blocks verbatim.
 */
function proxyHandler(toolName) {
  return async (args) => {
    try {
      const rpcId = Math.floor(Math.random() * 1e9);
      const res = await fetch(REMOTE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': `Bearer ${SHARED_TOKEN}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: rpcId,
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return {
          content: [{ type: 'text', text: `Connector error (${res.status}): ${body.slice(0, 500)}` }],
          isError: true,
        };
      }

      // The hosted server returns text/event-stream framed JSON-RPC.
      // Body looks like:  "event: message\ndata: { ... }\n\n"
      const raw = await res.text();
      const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
      const jsonPayload = dataLine ? dataLine.slice(5).trim() : raw;
      let data;
      try {
        data = JSON.parse(jsonPayload);
      } catch {
        return {
          content: [{ type: 'text', text: `Connector returned non-JSON response: ${raw.slice(0, 500)}` }],
          isError: true,
        };
      }

      if (data.error) {
        return {
          content: [{ type: 'text', text: `Connector error: ${data.error.message || JSON.stringify(data.error)}` }],
          isError: true,
        };
      }
      // The remote already returns the MCP-shaped content array.
      return data.result;
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Network error reaching connector: ${err.message}` }],
        isError: true,
      };
    }
  };
}

server.tool('research_keywords', DESCRIPTIONS.research_keywords, SCHEMAS.research_keywords, proxyHandler('research_keywords'));
server.tool('get_keyword_metrics', DESCRIPTIONS.get_keyword_metrics, SCHEMAS.get_keyword_metrics, proxyHandler('get_keyword_metrics'));
server.tool('get_historical_metrics', DESCRIPTIONS.get_historical_metrics, SCHEMAS.get_historical_metrics, proxyHandler('get_historical_metrics'));
server.tool('health_check', DESCRIPTIONS.health_check, {}, proxyHandler('health_check'));

const transport = new StdioServerTransport();
await server.connect(transport);
