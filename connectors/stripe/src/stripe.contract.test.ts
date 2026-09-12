/**
 * Stripe connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { STRIPE_CONNECTOR_DEF, STRIPE_TOOLS } from './index.js';

describe('STRIPE_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(STRIPE_CONNECTOR_DEF.id).toBe('stripe');
    expect(STRIPE_CONNECTOR_DEF.slug).toBe('stripe');
    expect(STRIPE_CONNECTOR_DEF.name).toBe('Stripe');
    expect(STRIPE_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses Stripe API base URL', () => {
    expect(STRIPE_CONNECTOR_DEF.base_url).toBe('https://api.stripe.com/v1');
  });

  it('is api_key auth type (not oauth2)', () => {
    expect(STRIPE_CONNECTOR_DEF.auth.type).toBe('api_key');
  });

  it('uses Authorization header with Bearer scheme', () => {
    const { auth } = STRIPE_CONNECTOR_DEF;
    if (auth.type === 'api_key') {
      expect(auth.api_key.header).toBe('Authorization');
      expect(auth.api_key.scheme).toBe('Bearer');
    }
  });

  it('specifies env_var for the key', () => {
    const { auth } = STRIPE_CONNECTOR_DEF;
    if (auth.type === 'api_key') {
      expect(typeof auth.api_key.env_var).toBe('string');
      expect(auth.api_key.env_var.length).toBeGreaterThan(0);
    }
  });

  it('tools array matches STRIPE_TOOLS', () => {
    expect(STRIPE_CONNECTOR_DEF.tools).toBe(STRIPE_TOOLS);
  });

  it('category is payments', () => {
    expect(STRIPE_CONNECTOR_DEF.category).toBe('payments');
  });
});

describe('STRIPE_TOOLS', () => {
  it('has at least 8 tools', () => {
    expect(STRIPE_TOOLS.length).toBeGreaterThanOrEqual(8);
  });

  it('all tools have required fields', () => {
    for (const tool of STRIPE_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = STRIPE_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of STRIPE_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });

  it('read-only tools use GET or DELETE method', () => {
    for (const tool of STRIPE_TOOLS) {
      if (tool.read_only) {
        expect(tool.http.method).toBe('GET');
      }
    }
  });

  it('has tools for customers, payment_intents, subscriptions, and charges', () => {
    const slugs = STRIPE_TOOLS.map((t) => t.slug);
    expect(slugs.some((s) => s.includes('customer'))).toBe(true);
    expect(slugs.some((s) => s.includes('payment_intent'))).toBe(true);
    expect(slugs.some((s) => s.includes('subscription'))).toBe(true);
    expect(slugs.some((s) => s.includes('charge'))).toBe(true);
  });
});

describe('create_payment_intent tool', () => {
  const tool = STRIPE_TOOLS.find((t) => t.slug === 'create_payment_intent');
  it('exists and is not read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(false);
  });
  it('is POST to payment_intents', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toBe('/payment_intents');
  });
  it('requires amount and currency params', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('amount');
    expect(paramNames).toContain('currency');
  });
  it('has WRITE risk level', () => {
    expect(tool!.risk_level).toContain('WRITE');
  });
});

describe('cancel_subscription tool', () => {
  const tool = STRIPE_TOOLS.find((t) => t.slug === 'cancel_subscription');
  it('exists and is destructive', () => {
    expect(tool).toBeDefined();
    expect(tool!.destructive).toBe(true);
  });
  it('is DELETE to subscriptions endpoint', () => {
    expect(tool!.http.method).toBe('DELETE');
    expect(tool!.http.path).toContain('subscriptions');
  });
  it('has DESTRUCTIVE risk level', () => {
    expect(tool!.risk_level).toContain('DESTRUCTIVE');
  });
});

describe('list_customers tool', () => {
  const tool = STRIPE_TOOLS.find((t) => t.slug === 'list_customers');
  it('exists and is read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(true);
  });
  it('is GET to /customers', () => {
    expect(tool!.http.method).toBe('GET');
    expect(tool!.http.path).toBe('/customers');
  });
});
