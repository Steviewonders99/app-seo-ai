import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requireBearerToken } from '../lib/auth.js';

describe('requireBearerToken', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('CONNECTOR_SHARED_TOKEN', 'correct-secret-token-value');
  });

  it('returns null when the bearer token matches', () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer correct-secret-token-value' },
    });
    expect(requireBearerToken(req)).toBeNull();
  });

  it('returns 401 when the header is missing', async () => {
    const req = new Request('https://x.test/mcp');
    const res = requireBearerToken(req);
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(401);
  });

  it('returns 401 when the scheme is not Bearer', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Basic correct-secret-token-value' },
    });
    expect(requireBearerToken(req)!.status).toBe(401);
  });

  it('returns 401 when the token does not match', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(requireBearerToken(req)!.status).toBe(401);
  });

  it('returns 401 when the token is the right length but wrong (constant-time path)', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer correct-secret-token-valuX' },
    });
    expect(requireBearerToken(req)!.status).toBe(401);
  });

  it('returns 500 when the server env var is not configured', async () => {
    vi.stubEnv('CONNECTOR_SHARED_TOKEN', '');
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer anything' },
    });
    expect(requireBearerToken(req)!.status).toBe(500);
  });

  it('does not leak the expected token in the 401 body', async () => {
    const req = new Request('https://x.test/mcp', {
      headers: { Authorization: 'Bearer wrong' },
    });
    const body = await requireBearerToken(req)!.text();
    expect(body).not.toContain('correct-secret-token-value');
  });
});
