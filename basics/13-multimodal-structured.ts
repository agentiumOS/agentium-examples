/**
 * Multi-modal & Structured Output — Send images to an agent and get structured responses.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/basics/13-multimodal-structured.ts
 */

import { Agent, openai, type ContentPart } from "@agentium/core";
import { z } from "zod";

// ── 1. Structured output schema ──────────────────────────────────────────

const ImageAnalysis = z.object({
  description: z.string().describe("A detailed description of the image"),
  objects: z.array(z.string()).describe("List of objects detected"),
  dominantColors: z.array(z.string()).describe("Dominant colors"),
  mood: z.string().describe("Overall mood or feeling of the image"),
});

// ── 2. Agent with structured output + logging ────────────────────────────

const analyzer = new Agent({
  name: "ImageAnalyzer",
  model: openai("gpt-4o"),
  instructions: `You analyze images and return structured JSON output.
Always respond with valid JSON matching the requested schema.`,
  structuredOutput: ImageAnalysis,
  logLevel: "info",
});

// ── 3. Multi-modal input — image URL + text ──────────────────────────────

console.log("=== Example 1: Analyze an image via URL ===\n");

const multiModalInput: ContentPart[] = [
  { type: "text", text: "Analyze this image in detail." },
  {
    type: "image",
    data: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
    mimeType: "image/png",
  },
];

const result1 = await analyzer.run(multiModalInput);
console.log("\nRaw text:", result1.text);
console.log("Structured:", JSON.stringify(result1.structured, null, 2));

// ── 4. Plain text with structured output ─────────────────────────────────

console.log("\n=== Example 2: Structured output from text ===\n");

const textAnalyzer = new Agent({
  name: "CityInfo",
  model: openai("gpt-4o"),
  instructions: "You provide city information. Always respond with valid JSON matching the schema.",
  structuredOutput: z.object({
    name: z.string(),
    country: z.string(),
    population: z.number().describe("Approximate population"),
    landmarks: z.array(z.string()).describe("Famous landmarks"),
    bestTimeToVisit: z.string(),
  }),
  logLevel: "info",
});

const result2 = await textAnalyzer.run("Tell me about Paris, France.");
console.log("\nStructured:", JSON.stringify(result2.structured, null, 2));
console.log(`\nTokens used: ${result2.usage.totalTokens}`);
