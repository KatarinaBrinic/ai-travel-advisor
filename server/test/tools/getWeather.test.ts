import { describe, expect, it, vi } from 'vitest';
import { createGetWeatherTool } from '../../src/llm/tools/getWeather.ts';

function sequencedFetch(responses: unknown[]) {
  let i = 0;
  return vi.fn(async () => {
    const body = responses[i++];
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
}

describe('getWeatherTool', () => {
  it('geocodes the location then returns current conditions', async () => {
    const fetchImpl = sequencedFetch([
      { results: [{ name: 'Paris', admin1: 'Ile-de-France', country: 'France', latitude: 48.85, longitude: 2.35 }] },
      {
        current: {
          temperature_2m: 21,
          wind_speed_10m: 10,
          relative_humidity_2m: 60,
          weather_code: 1,
          time: '2026-08-12T12:00',
        },
      },
    ]);
    const tool = createGetWeatherTool(fetchImpl);

    const result = await tool.execute({ location: 'Paris' });

    expect(result).toMatchObject({
      resolvedLocation: 'Paris, Ile-de-France, France',
      temperatureC: 21,
      windSpeedKmh: 10,
      humidityPct: 60,
      condition: 'mostly clear',
      observedAt: '2026-08-12T12:00',
      source: 'open-meteo.com',
    });
  });

  it('falls back to a generic label for an unmapped weather code', async () => {
    const fetchImpl = sequencedFetch([
      { results: [{ name: 'Nowhere', latitude: 0, longitude: 0 }] },
      { current: { temperature_2m: 10, weather_code: 77 } },
    ]);
    const tool = createGetWeatherTool(fetchImpl);

    const result = await tool.execute({ location: 'Nowhere' });
    expect(result).toMatchObject({ condition: 'weather code 77' });
  });

  it('returns a structured error when the location cannot be found', async () => {
    const fetchImpl = sequencedFetch([{ results: [] }]);
    const tool = createGetWeatherTool(fetchImpl);

    const result = await tool.execute({ location: 'Nowhereville' });
    expect(result).toMatchObject({ error: expect.stringContaining('Nowhereville') });
  });

  it('rejects an empty location before making a request', async () => {
    const fetchImpl = sequencedFetch([]);
    const tool = createGetWeatherTool(fetchImpl);

    await expect(tool.execute({ location: '' })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws when the forecast service errors', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        return { ok: true, status: 200, json: async () => ({ results: [{ name: 'Paris', latitude: 1, longitude: 1 }] }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const tool = createGetWeatherTool(fetchImpl);

    await expect(tool.execute({ location: 'Paris' })).rejects.toThrow(/500/);
  });
});
