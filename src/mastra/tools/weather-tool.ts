import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface GeocodingResponse {
  results?: {
    latitude: number;
    longitude: number;
    name: string;
    country?: string;
  }[];
}

interface WeatherResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number | null;
    weather_code: number;
  };
}

const inputSchema = z.object({
  location: z
    .string()
    .min(2, "Location name too short")
    .max(80, "Location name too long")
    .describe("City name"),
});

const outputSchema = z.object({
  temperature: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  windSpeed: z.number(),
  windGust: z.number(),
  conditions: z.string(),
  location: z.string(),
  observedAt: z.string(),
});

export const weatherTool = createTool({
  id: "get-weather",
  description: "Get current weather for a location",
  inputSchema,
  outputSchema,
  execute: async (raw: unknown) => {
    // raw bisa berupa { input: {...} } atau langsung {...}
    const maybeInput = (raw as any)?.input ?? raw;
    const input = inputSchema.parse(maybeInput); // pastikan { location: string }
    return await getWeather(input.location);
  },
});

const getWeather = async (location: string) => {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    location
  )}&count=1`;

  const geocodingResponse = await fetchWithErrors(geocodingUrl);
  const geocodingData = (await geocodingResponse.json()) as GeocodingResponse;

  if (!geocodingData.results?.[0]) {
    throw new Error(`Location '${location}' not found`);
  }

  const { latitude, longitude, name, country } = geocodingData.results[0];

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code&timezone=auto`;

  const weatherResponse = await fetchWithErrors(weatherUrl);
  const data = (await weatherResponse.json()) as WeatherResponse;

  return {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    windGust: data.current.wind_gusts_10m ?? data.current.wind_speed_10m,
    conditions: getWeatherCondition(data.current.weather_code),
    location: country ? `${name}, ${country}` : name,
    observedAt: data.current.time,
  };
};

async function fetchWithErrors(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Request to ${url} timed out`);
    }
    throw new Error(`Network error for ${url}: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return conditions[code] || "Unknown";
}
