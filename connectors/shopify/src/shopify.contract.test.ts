/**
 * Shopify connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { SHOPIFY_CONNECTOR_DEF, SHOPIFY_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('SHOPIFY_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(SHOPIFY_CONNECTOR_DEF.id).toBe('shopify');
    expect(SHOPIFY_CONNECTOR_DEF.slug).toBe('shopify');
    expect(SHOPIFY_CONNECTOR_DEF.name).toBe('Shopify');
    expect(SHOPIFY_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('base_url contains shop template', () => {
    expect(SHOPIFY_CONNECTOR_DEF.base_url).toContain('{shop}');
    expect(SHOPIFY_CONNECTOR_DEF.base_url).toContain('myshopify.com');
  });

  it('is oauth2 type', () => {
    expect(SHOPIFY_CONNECTOR_DEF.auth.type).toBe('oauth2');
  });

  it('pkce is false (Shopify does not support PKCE)', () => {
    const { auth } = SHOPIFY_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(false);
    }
  });

  it('refresh_supported is false', () => {
    const { auth } = SHOPIFY_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.refresh_supported).toBe(false);
    }
  });

  it('tools array matches SHOPIFY_TOOLS', () => {
    expect(SHOPIFY_CONNECTOR_DEF.tools).toBe(SHOPIFY_TOOLS);
  });
});

describe('SHOPIFY_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(SHOPIFY_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of SHOPIFY_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = SHOPIFY_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of SHOPIFY_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });

  it('paths end with .json (Shopify REST convention)', () => {
    for (const tool of SHOPIFY_TOOLS) {
      expect(tool.http.path).toMatch(/\.json/);
    }
  });
});

describe('list_products tool', () => {
  const tool = SHOPIFY_TOOLS.find((t) => t.slug === 'list_products');
  it('exists and is read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(true);
  });
  it('is GET to products.json', () => {
    expect(tool!.http.method).toBe('GET');
    expect(tool!.http.path).toBe('/products.json');
  });
});

describe('create_product tool', () => {
  const tool = SHOPIFY_TOOLS.find((t) => t.slug === 'create_product');
  it('exists and is not read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(false);
  });
  it('is POST to products.json', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toBe('/products.json');
  });
  it('requires product body param', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('product');
  });
});

describe('get_shop tool', () => {
  const tool = SHOPIFY_TOOLS.find((t) => t.slug === 'get_shop');
  it('exists and is read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(true);
  });
  it('is GET to shop.json', () => {
    expect(tool!.http.method).toBe('GET');
    expect(tool!.http.path).toBe('/shop.json');
  });
});

describe('Shopify OAuth helpers', () => {
  it('generateCodeVerifier produces base64url string', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v.length).toBeGreaterThan(40);
  });

  it('buildAuthorizationUrl targets shop-specific myshopify.com', () => {
    const url = new URL(buildAuthorizationUrl({
      shop: 'mystore',
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['read_products'],
      state: generateState(),
    }));
    expect(url.hostname).toBe('mystore.myshopify.com');
    expect(url.pathname).toBe('/admin/oauth/authorize');
  });

  it('startOAuthFlow returns url, state, codeVerifier', () => {
    const r = startOAuthFlow({
      shop: 'mystore',
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['read_products'],
    });
    expect(typeof r.url).toBe('string');
    expect(typeof r.state).toBe('string');
    expect(typeof r.codeVerifier).toBe('string');
  });

  it('state in URL matches returned state', () => {
    const r = startOAuthFlow({
      shop: 'mystore',
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['read_products'],
    });
    const url = new URL(r.url);
    expect(url.searchParams.get('state')).toBe(r.state);
  });

  it('validateState timing-safe', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
  });
});
