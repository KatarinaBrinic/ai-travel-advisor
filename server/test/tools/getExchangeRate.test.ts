import { describe, expect, it, vi } from 'vitest';
import { createGetExchangeRateTool } from '../../src/llm/tools/getExchangeRate.ts';

function fakeFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('getExchangeRateTool', () => {
  it('returns a converted amount from a valid response', async () => {
    const fetchImpl = fakeFetch({ amount: 10, base: 'USD', date: '2026-08-12', rates: { EUR: 9.2 } });
    const tool = createGetExchangeRateTool(fetchImpl);

    const result = (await tool.execute({ base: 'usd', target: 'eur', amount: 10 })) as Record<string, unknown>;

    expect(result).toMatchObject({
      base: 'USD',
      target: 'EUR',
      requestedAmount: 10,
      convertedAmount: 9.2,
      asOfDate: '2026-08-12',
    });
    expect(result.unitRate as number).toBeCloseTo(0.92, 5);
  });

  it('defaults the amount to 1 when not provided', async () => {
    const fetchImpl = fakeFetch({ date: '2026-08-12', rates: { EUR: 0.92 } });
    const tool = createGetExchangeRateTool(fetchImpl);

    const result = await tool.execute({ base: 'USD', target: 'EUR' });

    expect(result).toMatchObject({ requestedAmount: 1, convertedAmount: 0.92, unitRate: 0.92 });
  });

  it('rejects invalid currency codes before making a request', async () => {
    const fetchImpl = fakeFetch({});
    const tool = createGetExchangeRateTool(fetchImpl);

    await expect(tool.execute({ base: 'dollars', target: 'EUR' })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a non-positive amount before making a request', async () => {
    const fetchImpl = fakeFetch({});
    const tool = createGetExchangeRateTool(fetchImpl);

    await expect(tool.execute({ base: 'USD', target: 'EUR', amount: -5 })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws when the upstream service errors', async () => {
    const fetchImpl = fakeFetch({}, false, 503);
    const tool = createGetExchangeRateTool(fetchImpl);

    await expect(tool.execute({ base: 'USD', target: 'EUR' })).rejects.toThrow(/503/);
  });

  it('throws when the target currency is not in the response', async () => {
    const fetchImpl = fakeFetch({ date: '2026-08-12', rates: {} });
    const tool = createGetExchangeRateTool(fetchImpl);

    await expect(tool.execute({ base: 'USD', target: 'ZZZ' })).rejects.toThrow(/No rate available/);
  });
});
