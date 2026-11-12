import { fetchWithTimeout } from './http.ts';

const TIMEOUT_MS = 8000;

export const getExchangeRateDefinition = {
  type: 'function' as const,
  name: 'get_exchange_rate',
  description:
    'Get the current exchange rate between two currencies, optionally converting a specific amount. ' +
    'Always use this for current/live exchange rate questions instead of relying on memorized rates, ' +
    'which go stale.',
  parameters: {
    type: 'object',
    properties: {
      base: { type: 'string', description: "3-letter ISO currency code to convert from, e.g. 'USD'" },
      target: { type: 'string', description: "3-letter ISO currency code to convert to, e.g. 'EUR'" },
      amount: { type: 'number', description: 'Amount to convert; defaults to 1 if omitted' },
    },
    required: ['base', 'target'],
    additionalProperties: false,
  },
};

interface ValidatedArgs {
  base: string;
  target: string;
  amount?: number;
}

function validateArgs(args: unknown): ValidatedArgs {
  if (typeof args !== 'object' || args === null) {
    throw new Error('Arguments must be an object');
  }
  const { base, target, amount } = args as Record<string, unknown>;
  if (typeof base !== 'string' || base.trim().length !== 3) {
    throw new Error('base must be a 3-letter currency code');
  }
  if (typeof target !== 'string' || target.trim().length !== 3) {
    throw new Error('target must be a 3-letter currency code');
  }
  if (amount !== undefined && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0)) {
    throw new Error('amount must be a positive number');
  }
  return { base: base.trim().toUpperCase(), target: target.trim().toUpperCase(), amount };
}

export function createGetExchangeRateTool(fetchImpl: typeof fetch = fetch) {
  return {
    definition: getExchangeRateDefinition,
    async execute(rawArgs: unknown): Promise<unknown> {
      const { base, target, amount } = validateArgs(rawArgs);
      const requestedAmount = amount ?? 1;
      const query = new URLSearchParams({ from: base, to: target, amount: String(requestedAmount) });
      const res = await fetchWithTimeout(
        fetchImpl,
        `https://api.frankfurter.app/latest?${query.toString()}`,
        TIMEOUT_MS,
      );
      if (!res.ok) {
        throw new Error(`Exchange rate service returned ${res.status}`);
      }
      const data = (await res.json()) as { date?: string; rates?: Record<string, number> };
      const convertedAmount = data.rates?.[target];
      if (typeof convertedAmount !== 'number') {
        throw new Error(`No rate available for ${base} to ${target}`);
      }
      return {
        base,
        target,
        requestedAmount,
        convertedAmount,
        unitRate: convertedAmount / requestedAmount,
        asOfDate: data.date,
        source: 'frankfurter.app (ECB reference rates)',
      };
    },
  };
}
