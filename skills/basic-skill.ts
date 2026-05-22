/**
 * Skills — Load pre-packaged tool bundles into an agent.
 *
 * Shows how to define a Skill object and pass it to an agent.
 * Skills provide tools + optional instruction fragments.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/skills/basic-skill.ts
 */

import { Agent, openai, defineTool } from "@agentium/core";
import type { Skill } from "@agentium/core";
import { z } from "zod";

const shippingSkill: Skill = {
  name: "shipping",
  description: "Shipping rate calculation and tracking",
  version: "1.0.0",
  tools: [
    defineTool({
      name: "calculate_shipping",
      description: "Calculate shipping cost based on weight and destination",
      parameters: z.object({
        weightKg: z.number().describe("Package weight in kilograms"),
        destination: z.string().describe("Destination country"),
        express: z.boolean().optional().describe("Express shipping"),
      }),
      execute: async ({ weightKg, destination, express }) => {
        const base = weightKg * 2.5;
        const multiplier = express ? 2.0 : 1.0;
        const regionMultiplier = destination.toLowerCase().includes("us") ? 1.0 : 1.5;
        const cost = (base * multiplier * regionMultiplier).toFixed(2);
        return `Shipping to ${destination}: $${cost} (${express ? "express" : "standard"}, ${weightKg}kg)`;
      },
    }),
    defineTool({
      name: "track_package",
      description: "Track a package by tracking number",
      parameters: z.object({
        trackingNumber: z.string().describe("Tracking number"),
      }),
      execute: async ({ trackingNumber }) => {
        const statuses = ["In transit", "Out for delivery", "Delivered", "Customs clearance"];
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        return `Package ${trackingNumber}: ${status}`;
      },
    }),
  ],
  instructions: `When the user asks about shipping costs, use calculate_shipping.
When they want to track a package, use track_package.
Always confirm the details before calculating.`,
};

const agent = new Agent({
  name: "ShippingAssistant",
  model: openai("gpt-4o"),
  instructions: "You are a helpful shipping assistant.",
  skills: [shippingSkill],
  logLevel: "info",
});

console.log("=== Shipping Skill Demo ===\n");

const r1 = await agent.run("How much would it cost to ship a 5kg package to Germany?");
console.log("Assistant:", r1.text);

console.log("\n---\n");

const r2 = await agent.run("Can you track package XQ-12345-DE?");
console.log("Assistant:", r2.text);

process.exit(0);
