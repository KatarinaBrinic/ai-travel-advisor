import { fetchWithTimeout } from './http.ts';

const TIMEOUT_MS = 8000;

export const getWeatherDefinition = {
  type: 'function' as const,
  name: 'get_weather',
  description:
    'Get current weather conditions for a location. Always use this for current/live weather ' +
    'questions instead of guessing, since weather changes constantly and cannot be reliably known ' +
    'from memory.',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: "A place name, e.g. 'Paris, France' or 'Tokyo'" },
    },
    required: ['location'],
    additionalProperties: false,
  },
};

interface ValidatedArgs {
  location: string;
}

function validateArgs(args: unknown): ValidatedArgs {
  if (typeof args !== 'object' || args === null) {
    throw new Error('Arguments must be an object');
  }
  const { location } = args as Record<string, unknown>;
  if (typeof location !== 'string' || location.trim().length === 0) {
    throw new Error('location must be a non-empty string');
  }
  return { location: location.trim() };
}

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'clear sky',
  1: 'mostly clear',
  2: 'partly cloudy',
  3: 'overcast',
  45: 'fog',
  48: 'freezing fog',
  51: 'light drizzle',
  53: 'moderate drizzle',
  55: 'dense drizzle',
  61: 'light rain',
  63: 'moderate rain',
  65: 'heavy rain',
  71: 'light snow',
  73: 'moderate snow',
  75: 'heavy snow',
  80: 'light rain showers',
  81: 'moderate rain showers',
  82: 'violent rain showers',
  95: 'thunderstorm',
  96: 'thunderstorm with light hail',
  99: 'thunderstorm with heavy hail',
};

function describeWeatherCode(code: number): string {
  return WEATHER_CODE_DESCRIPTIONS[code] ?? `weather code ${code}`;
}

interface GeocodeResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export function createGetWeatherTool(fetchImpl: typeof fetch = fetch) {
  return {
    definition: getWeatherDefinition,
    async execute(rawArgs: unknown): Promise<unknown> {
      const { location } = validateArgs(rawArgs);

      const geoRes = await fetchWithTimeout(
        fetchImpl,
        `https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: location, count: '1' })}`,
        TIMEOUT_MS,
      );
      if (!geoRes.ok) {
        throw new Error(`Location lookup service returned ${geoRes.status}`);
      }
      const geoData = (await geoRes.json()) as { results?: GeocodeResult[] };
      const place = geoData.results?.[0];
      if (!place) {
        return { error: `Could not find a location matching "${location}"` };
      }

      const forecastRes = await fetchWithTimeout(
        fetchImpl,
        `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
          latitude: String(place.latitude),
          longitude: String(place.longitude),
          current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m',
        })}`,
        TIMEOUT_MS,
      );
      if (!forecastRes.ok) {
        throw new Error(`Weather service returned ${forecastRes.status}`);
      }
      const forecastData = (await forecastRes.json()) as {
        current?: {
          temperature_2m?: number;
          wind_speed_10m?: number;
          relative_humidity_2m?: number;
          weather_code?: number;
          time?: string;
        };
      };
      const current = forecastData.current;
      if (!current || typeof current.weather_code !== 'number') {
        return { error: 'Weather service did not return current conditions' };
      }

      return {
        resolvedLocation: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
        temperatureC: current.temperature_2m,
        windSpeedKmh: current.wind_speed_10m,
        humidityPct: current.relative_humidity_2m,
        condition: describeWeatherCode(current.weather_code),
        observedAt: current.time,
        source: 'open-meteo.com',
      };
    },
  };
}
