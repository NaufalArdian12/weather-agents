// weather-agent.ts
import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import { weatherTool as rawWeatherTool } from "../tools/weather-tool";

// --- Optional: user prefs you might keep per user/session
type UserPrefs = {
  units?: "metric" | "imperial";
  locale?: string; // e.g., 'en', 'id'
};

// Normalize a user-entered location: trim, drop trailing admin parts, keep main toponym
function normalizeLocation(input: string) {
  if (!input) return input;
  const trimmed = input.trim();
  // Split by comma and keep the first non-empty piece
  const main =
    trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)[0] ?? trimmed;
  return main;
}

// Wrap your weather tool to enforce a timeout and friendly errors
const weatherTool = {
  ...rawWeatherTool,
  // If your tool shape allows, you can wrap/override the handler here.
  // Example pseudo-API; adapt to your actual weatherTool implementation.
  // handler: async (args: any, ctx: any) => {
  //   const controller = new AbortController();
  //   const id = setTimeout(() => controller.abort('Timeout'), 10_000);
  //   try {
  //     return await rawWeatherTool.handler(args, { ...ctx, signal: controller.signal });
  //   } catch (err: any) {
  //     // Surface a concise, user-friendly message to the model
  //     throw new Error(`WEATHER_TOOL_ERROR: ${err?.message ?? 'Unknown error'}`);
  //   } finally {
  //     clearTimeout(id);
  //   }
  // },
};

// Tighter, more “rule-like” system prompt
const SYSTEM_INSTRUCTIONS = `
You are Weather Agent — a concise, accurate weather assistant.

Rules:
1) If the user does not provide a location, ask exactly one brief question to get it.
2) If the location contains multiple parts (e.g., "New York, NY"), use the most relevant part ("New York").
3) If the location is non-English, translate it to English for the tool call, but KEEP the user's language in your reply if possible.
4) Always include: temperature, humidity, wind, and precipitation chances if available.
5) Be brief and helpful. Use bullet points for data; one short line for advice.
6) If the user asks for activities and you have a forecast, tailor suggestions to that forecast and the user's requested format.
7) If the tool fails or returns incomplete data, say so plainly and suggest the minimum info you need to try again.

Output format (when you have data):
- Headline: "<Location> — <Condition>, <Temp>°"
- Bullets: Humidity, Wind, Precipitation, Feels-like, UV (if available)
- One-liner: "Tip" or suggested activities if asked.
`;

// Optional: slight nudge for shorter, factual outputs
const MODEL = openai("gpt-4o-mini");

export const weatherAgent = new Agent({
  name: "Weather Agent",
  instructions: SYSTEM_INSTRUCTIONS,
  model: MODEL,
  tools: { weatherTool },
  // Give this agent its own memory namespace/table to avoid clashes
  memory: new Memory({
    storage: new LibSQLStore({
      // Tip: keep a per-agent DB or a per-agent table prefix if supported
      url: "file:../mastra.db",
      // tablePrefix: 'weather_' // if LibSQLStore supports prefixes; otherwise ignore
    }),
  }),

  // (Optional) A small pre-processing hook, if your Agent supports it.
  // If not available in your Mastra version, you can do this upstream in your route handler.
  // onBeforeRun: async (input, ctx) => {
  //   if (typeof input?.text === 'string') {
  //     const L = normalizeLocationFromFreeText(input.text); // your own NER/regex
  //     if (L) ctx.vars.location = normalizeLocation(L);
  //   }
  // },

  // (Optional) post-processing to enforce format or fallback behaviors
  // onAfterRun: async (output, ctx) => output,
});
