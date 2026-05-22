/**
 * IEX India Market Analyzer — Scrape DAM/RTM/GDAM data from iexindia.com,
 * analyze pricing & volume patterns, and predict next 7 days.
 *
 * Uses Playwright directly for reliable table extraction, Socket.IO for
 * live screenshot streaming, and Chart.js for the dashboard.
 *
 * Prerequisites:
 *   npm install playwright express socket.io
 *   npx playwright install chromium
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx tsx examples/browser/34-iex-market-analyzer.ts
 *
 * Then open http://localhost:3004 in your browser.
 */

import { config } from "node:process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env from project root
try {
  const envPath = resolve(import.meta.dirname ?? ".", "../../.env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {}

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { chromium, type Page, type Browser } from "playwright";
import { Agent, anthropic } from "@agentium/core";

const PORT = 3004;
const app = express();
app.use(express.json());
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 10e6 });

/* ── Types ──────────────────────────────────────────────────────────── */

interface BlockRow {
  date: string;
  hour: number;
  timeBlock: string;
  purchaseBid: number;
  sellBid: number;
  mcv: number;
  scheduledVolume: number;
  mcp: number;
}

interface DaySummary {
  date: string;
  avgMcp: number;
  maxMcp: number;
  minMcp: number;
  totalMcv: number;
  totalPurchase: number;
  totalSell: number;
  blocks: BlockRow[];
}

interface AnalysisResult {
  market: string;
  days: DaySummary[];
  hourlyPattern: { hour: number; avgMcp: number }[];
  sma7: { date: string; value: number }[];
  sma14: { date: string; value: number }[];
  trend: { slope: number; intercept: number; r2: number };
  predictions: { date: string; avgMcp: number; peakMcp: number; offPeakMcp: number }[];
  blockPredictions: { date: string; hour: number; mcp: number }[];
}

interface BidBlockResult {
  hour: number;
  timeBlock: string;
  avgMcp: number;
  minMcp: number;
  maxMcp: number;
  clearRate: number;   // % of days the bid clears (bid >= MCP for buyer)
  avgSaving: number;   // avg (bid - MCP) when cleared, negative = overpay
  totalDays: number;
}

interface BidMarketResult {
  market: string;
  bidPrice: number;
  overallClearRate: number;
  avgMcpWhenCleared: number;
  avgSavingPerMwh: number;
  totalCostForAllBlocks: number;  // cost for 1 MW across 96 blocks
  blocks: BidBlockResult[];
  bestHours: number[];
  worstHours: number[];
  recommendation: string;
}

interface BidAnalysis {
  bidPrice: number;
  bidUnit: string;
  markets: Record<string, BidMarketResult>;
  bestMarket: string;
  summary: string;
  aiAnalysis?: string;
}

interface AllMarketsResult {
  DAM: AnalysisResult | null;
  RTM: AnalysisResult | null;
  GDAM: AnalysisResult | null;
  aiSummary?: string;
  bidAnalysis?: BidAnalysis;
}

const model = anthropic("claude-opus-4-6");

const analyst = new Agent({
  name: "iex-analyst",
  model,
  instructions: `You are a senior Indian electricity market analyst with deep expertise in IEX India markets (DAM, RTM, GDAM).

When given market data, you must:
1. Validate the numbers — flag anything that looks unrealistic (e.g., MCP below Rs 500/MWh or above Rs 15000/MWh for DAM/RTM is unusual; GDAM is typically lower).
2. Analyze price trends: slope direction, volatility, whether recent prices are above/below the period average.
3. Compare all three markets: which has the lowest average MCP, which is most volatile, which has the best peak/off-peak spread.
4. Identify supply-demand imbalances: when purchase bids >> sell bids, prices rise; the opposite means surplus.
5. Hourly patterns: peak hours (07:00-10:00, 18:00-22:00) vs off-peak, and how much the spread is.
6. For predictions: explain the methodology limitations (linear extrapolation + seasonal decomposition is simplistic), and give your expert opinion on likely direction.
7. Provide specific, actionable recommendations with numbers.

Use Rs/MWh consistently. Be precise with numbers. Keep analysis under 500 words.`,
});

const MARKETS: Record<string, string> = {
  DAM: "https://www.iexindia.com/market-data/day-ahead-market/market-snapshot",
  RTM: "https://www.iexindia.com/market-data/real-time-market/market-snapshot",
  GDAM: "https://www.iexindia.com/market-data/green-day-ahead-market/market-snapshot",
};

const dataCache: Record<string, BlockRow[]> = {};
let activeBrowser: Browser | null = null;

/* ── Scraping ───────────────────────────────────────────────────────── */

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function scrapeMarket(
  market: string,
  days: number,
  emit: (event: string, data: any) => void,
): Promise<BlockRow[]> {
  const url = MARKETS[market];
  if (!url) throw new Error(`Unknown market: ${market}`);

  emit("scrape.status", { message: `Launching browser for ${market}...` });

  const browser = await chromium.launch({ headless: true });
  activeBrowser = browser;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const allRows: BlockRow[] = [];

  try {
    emit("scrape.status", { message: `Navigating to ${market} market page...` });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const screenshot = await page.screenshot({ type: "png" });
    emit("scrape.screenshot", { data: screenshot.toString("base64") });

    for (let i = 0; i < days; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i - 1);
      const dateStr = formatDate(targetDate);
      const iso = isoDate(targetDate);

      emit("scrape.progress", {
        current: i + 1,
        total: days,
        date: dateStr,
        market,
        message: `Fetching ${market} data for ${dateStr} (${i + 1}/${days})...`,
      });

      try {
        await selectDate(page, targetDate);
        await page.waitForTimeout(1500);

        const ss = await page.screenshot({ type: "png" });
        emit("scrape.screenshot", { data: ss.toString("base64") });

        const rows = await extractTableData(page, iso);
        if (rows.length > 0) {
          allRows.push(...rows);
          emit("scrape.data", { date: dateStr, rowCount: rows.length, market });
        } else {
          emit("scrape.status", { message: `No data found for ${dateStr}` });
        }
      } catch (err: any) {
        emit("scrape.status", { message: `Error on ${dateStr}: ${err.message}` });
      }
    }
  } finally {
    await browser.close();
    activeBrowser = null;
  }

  dataCache[market] = allRows;
  return allRows;
}

async function selectDate(page: Page, date: Date): Promise<void> {
  const dateInput = page.locator('input[type="date"], input[placeholder*="date"], .date-picker input, input.form-control').first();
  const exists = await dateInput.count();

  if (exists > 0) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    await dateInput.fill(`${yyyy}-${mm}-${dd}`);
    await dateInput.press("Enter");
    await page.waitForTimeout(1000);
    return;
  }

  const datePickerBtn = page.locator('[class*="date"], [class*="calendar"], button:has-text("Today")').first();
  if (await datePickerBtn.count()) {
    await datePickerBtn.click();
    await page.waitForTimeout(500);
  }

  await page.evaluate((dateStr: string) => {
    const inputs = document.querySelectorAll("input");
    for (const input of inputs) {
      if (input.type === "text" && (input.placeholder?.includes("date") || input.closest("[class*='date']"))) {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        nativeSetter?.call(input, dateStr);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        break;
      }
    }
  }, formatDate(date));

  const updateBtn = page.locator('button:has-text("Update"), button:has-text("Go"), button:has-text("Submit"), button:has-text("View")').first();
  if (await updateBtn.count()) {
    await updateBtn.click();
    await page.waitForTimeout(1500);
  }
}

async function extractTableData(page: Page, dateStr: string): Promise<BlockRow[]> {
  return page.evaluate((iso: string) => {
    const rows: any[] = [];
    const tables = document.querySelectorAll("table");

    for (const table of tables) {
      const trs = table.querySelectorAll("tbody tr, tr");
      for (const tr of trs) {
        const cells = tr.querySelectorAll("td");
        if (cells.length < 5) continue;

        const texts = Array.from(cells).map((c) => c.textContent?.trim() ?? "");
        const timeBlockIdx = texts.findIndex((t) => /^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(t));
        if (timeBlockIdx < 0) continue;

        const timeBlock = texts[timeBlockIdx];
        const hour = parseInt(timeBlock.split(":")[0], 10) + 1;

        const nums = texts
          .slice(timeBlockIdx + 1)
          .map((t) => parseFloat(t.replace(/,/g, "")))
          .filter((n) => !isNaN(n));

        if (nums.length >= 4) {
          rows.push({
            date: iso,
            hour,
            timeBlock,
            purchaseBid: nums[0],
            sellBid: nums[1],
            mcv: nums[2],
            scheduledVolume: nums.length >= 4 ? nums[3] : nums[2],
            mcp: nums.length >= 5 ? nums[4] : nums[nums.length - 1],
          });
        }
      }
    }
    return rows;
  }, dateStr);
}

/* ── Analysis Engine ────────────────────────────────────────────────── */

function analyze(market: string, rows: BlockRow[]): AnalysisResult {
  const byDate = new Map<string, BlockRow[]>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  const days: DaySummary[] = [];
  for (const [date, blocks] of byDate) {
    const mcps = blocks.map((b) => b.mcp).filter((m) => m > 0);
    if (mcps.length === 0) continue;
    days.push({
      date,
      avgMcp: mcps.reduce((a, b) => a + b, 0) / mcps.length,
      maxMcp: Math.max(...mcps),
      minMcp: Math.min(...mcps),
      totalMcv: blocks.reduce((a, b) => a + b.mcv, 0),
      totalPurchase: blocks.reduce((a, b) => a + b.purchaseBid, 0),
      totalSell: blocks.reduce((a, b) => a + b.sellBid, 0),
      blocks,
    });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));

  const hourlyMap = new Map<number, number[]>();
  for (const r of rows) {
    if (r.mcp <= 0) continue;
    const h = r.hour;
    if (!hourlyMap.has(h)) hourlyMap.set(h, []);
    hourlyMap.get(h)!.push(r.mcp);
  }
  const hourlyPattern = Array.from(hourlyMap.entries())
    .map(([hour, mcps]) => ({ hour, avgMcp: mcps.reduce((a, b) => a + b, 0) / mcps.length }))
    .sort((a, b) => a.hour - b.hour);

  const sma7 = computeSMA(days, 7);
  const sma14 = computeSMA(days, 14);

  const trend = linearRegression(days.map((d, i) => [i, d.avgMcp]));

  const seasonalMean = hourlyPattern.reduce((a, b) => a + b.avgMcp, 0) / (hourlyPattern.length || 1);
  const seasonalByHour = new Map(hourlyPattern.map((h) => [h.hour, h.avgMcp - seasonalMean]));

  const predictions: { date: string; avgMcp: number; peakMcp: number; offPeakMcp: number }[] = [];
  const blockPredictions: { date: string; hour: number; mcp: number }[] = [];
  const n = days.length;

  for (let d = 1; d <= 7; d++) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + d);
    const iso = isoDate(futureDate);
    const trendVal = trend.slope * (n + d - 1) + trend.intercept;

    const hourPreds: { hour: number; mcp: number }[] = [];
    for (let h = 1; h <= 24; h++) {
      const seasonal = seasonalByHour.get(h) ?? 0;
      const predicted = Math.max(0, trendVal + seasonal);
      hourPreds.push({ hour: h, mcp: Math.round(predicted * 100) / 100 });
      blockPredictions.push({ date: iso, hour: h, mcp: Math.round(predicted * 100) / 100 });
    }

    const peakHours = hourPreds.filter((h) => (h.hour >= 7 && h.hour <= 10) || (h.hour >= 18 && h.hour <= 22));
    const offPeakHours = hourPreds.filter((h) => !((h.hour >= 7 && h.hour <= 10) || (h.hour >= 18 && h.hour <= 22)));

    predictions.push({
      date: iso,
      avgMcp: Math.round(trendVal * 100) / 100,
      peakMcp: peakHours.length > 0
        ? Math.round((peakHours.reduce((a, b) => a + b.mcp, 0) / peakHours.length) * 100) / 100
        : trendVal,
      offPeakMcp: offPeakHours.length > 0
        ? Math.round((offPeakHours.reduce((a, b) => a + b.mcp, 0) / offPeakHours.length) * 100) / 100
        : trendVal,
    });
  }

  return { market, days, hourlyPattern, sma7, sma14, trend, predictions, blockPredictions };
}

function computeSMA(days: DaySummary[], window: number): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  for (let i = window - 1; i < days.length; i++) {
    const slice = days.slice(i - window + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b.avgMcp, 0) / slice.length;
    result.push({ date: days[i].date, value: Math.round(avg * 100) / 100 });
  }
  return result;
}

function linearRegression(points: number[][]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.[1] ?? 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const [x, y] of points) {
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; sumY2 += y * y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssRes = points.reduce((a, [x, y]) => a + (y - (slope * x + intercept)) ** 2, 0);
  const meanY = sumY / n;
  const ssTot = points.reduce((a, [, y]) => a + (y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return {
    slope: Math.round(slope * 1000) / 1000,
    intercept: Math.round(intercept * 100) / 100,
    r2: Math.round(r2 * 10000) / 10000,
  };
}

/* ── Bid Analysis Engine ────────────────────────────────────────────── */

function analyzeBid(bidPriceRs: number, allData: AllMarketsResult): BidAnalysis {
  const bidMwh = bidPriceRs * 1000; // Rs/kWh → Rs/MWh (if user enters 3, means Rs 3/kWh = Rs 3000/MWh)
  const markets: Record<string, BidMarketResult> = {};

  for (const mkt of ["DAM", "RTM", "GDAM"] as const) {
    const analysis = allData[mkt];
    if (!analysis || analysis.days.length === 0) continue;

    const allRows = analysis.days.flatMap(d => d.blocks);
    const hourMap = new Map<number, BlockRow[]>();
    for (const r of allRows) {
      if (!hourMap.has(r.hour)) hourMap.set(r.hour, []);
      hourMap.get(r.hour)!.push(r);
    }

    const blocks: BidBlockResult[] = [];
    let totalCleared = 0;
    let totalBlocks = 0;
    let sumMcpCleared = 0;
    let clearedCount = 0;

    for (let h = 1; h <= 24; h++) {
      const hourRows = hourMap.get(h) ?? [];
      if (hourRows.length === 0) continue;
      const mcps = hourRows.map(r => r.mcp).filter(m => m > 0);
      if (mcps.length === 0) continue;

      const cleared = mcps.filter(m => bidMwh >= m).length;
      const clearRate = (cleared / mcps.length) * 100;
      const avgMcp = mcps.reduce((a, b) => a + b, 0) / mcps.length;
      const clearedMcps = mcps.filter(m => bidMwh >= m);
      const avgSaving = clearedMcps.length > 0
        ? (bidMwh - clearedMcps.reduce((a, b) => a + b, 0) / clearedMcps.length)
        : 0;

      blocks.push({
        hour: h,
        timeBlock: `${String(h - 1).padStart(2, "0")}:00-${String(h).padStart(2, "0")}:00`,
        avgMcp, minMcp: Math.min(...mcps), maxMcp: Math.max(...mcps),
        clearRate: Math.round(clearRate * 10) / 10,
        avgSaving: Math.round(avgSaving * 100) / 100,
        totalDays: mcps.length,
      });

      totalCleared += cleared;
      totalBlocks += mcps.length;
      sumMcpCleared += clearedMcps.reduce((a, b) => a + b, 0);
      clearedCount += clearedMcps.length;
    }

    const overallClearRate = totalBlocks > 0 ? (totalCleared / totalBlocks) * 100 : 0;
    const avgMcpWhenCleared = clearedCount > 0 ? sumMcpCleared / clearedCount : 0;
    const avgSavingPerMwh = clearedCount > 0 ? bidMwh - avgMcpWhenCleared : 0;

    // Cost: for 1 MW across 96 blocks (each 15 min = 0.25 hr), you pay MCP for cleared blocks
    const dailyCostIfCleared = blocks.reduce((sum, b) => {
      const avgClearedMcp = b.clearRate > 0 ? (b.avgMcp * b.clearRate / 100) : 0;
      return sum + avgClearedMcp * 0.25; // 15-min block = 0.25 MWh per MW
    }, 0);

    const sortedByRate = [...blocks].sort((a, b) => b.clearRate - a.clearRate);
    const bestHours = sortedByRate.slice(0, 4).map(b => b.hour);
    const worstHours = sortedByRate.slice(-4).reverse().map(b => b.hour);

    let rec = "";
    if (overallClearRate > 80) rec = `Excellent. Your bid of Rs ${bidPriceRs}/kWh clears ${overallClearRate.toFixed(0)}% of blocks in ${mkt}.`;
    else if (overallClearRate > 50) rec = `Moderate. Rs ${bidPriceRs}/kWh clears ${overallClearRate.toFixed(0)}% in ${mkt}. Consider increasing bid for peak hours.`;
    else if (overallClearRate > 20) rec = `Low clearance. Only ${overallClearRate.toFixed(0)}% of blocks clear at Rs ${bidPriceRs}/kWh in ${mkt}.`;
    else rec = `Very low. Rs ${bidPriceRs}/kWh clears only ${overallClearRate.toFixed(0)}% in ${mkt}. Bid is below market for most blocks.`;

    markets[mkt] = {
      market: mkt, bidPrice: bidMwh, overallClearRate: Math.round(overallClearRate * 10) / 10,
      avgMcpWhenCleared: Math.round(avgMcpWhenCleared), avgSavingPerMwh: Math.round(avgSavingPerMwh),
      totalCostForAllBlocks: Math.round(dailyCostIfCleared),
      blocks, bestHours, worstHours, recommendation: rec,
    };
  }

  const sorted = Object.values(markets).sort((a, b) => b.overallClearRate - a.overallClearRate);
  const best = sorted[0]?.market ?? "N/A";

  const summaryLines = sorted.map(m =>
    `${m.market}: ${m.overallClearRate}% clear rate, avg MCP when cleared = Rs ${m.avgMcpWhenCleared}/MWh`
  );

  return {
    bidPrice: bidPriceRs,
    bidUnit: "Rs/kWh",
    markets,
    bestMarket: best,
    summary: `At Rs ${bidPriceRs}/kWh (Rs ${bidMwh}/MWh) for 96 blocks:\n${summaryLines.join("\n")}\n\nBest market: ${best}`,
  };
}

async function getAiBidAnalysis(bid: BidAnalysis, allData: AllMarketsResult): Promise<string> {
  const prompt = `A power trader wants to bid Rs ${bid.bidPrice}/kWh (Rs ${bid.bidPrice * 1000}/MWh) for ALL 96 time blocks (15-min intervals) in a day on IEX India.

Here are the results based on last 30 days of historical data:

${Object.values(bid.markets).map(m => `${m.market}:
- Overall clearing rate: ${m.overallClearRate}%
- Avg MCP when bid clears: Rs ${m.avgMcpWhenCleared}/MWh
- Avg saving per MWh when cleared: Rs ${m.avgSavingPerMwh}/MWh
- Best hours (highest clear rate): ${m.bestHours.join(", ")}
- Worst hours (lowest clear rate): ${m.worstHours.join(", ")}
- Recommendation: ${m.recommendation}`).join("\n\n")}

Best market overall: ${bid.bestMarket}

Provide a concise trading recommendation:
1. Which market should they prefer and why?
2. Should they bid the same price for all 96 blocks or differentiate peak/off-peak?
3. What bid price adjustments would maximize clearing while minimizing cost?
4. Any specific time blocks where they have a significant advantage?
Keep it under 300 words with specific numbers.`;

  try {
    const result = await analyst.run(prompt);
    return result.text ?? "Analysis unavailable.";
  } catch (err: any) {
    return `AI analysis unavailable: ${err.message}`;
  }
}

/* ── Socket.IO ──────────────────────────────────────────────────────── */

const ns = io.of("/iex");

async function getAiSummary(results: AllMarketsResult): Promise<string> {
  const parts: string[] = [];
  for (const mkt of ["DAM", "RTM", "GDAM"] as const) {
    const r = results[mkt];
    if (!r || r.days.length === 0) continue;
    const avg = r.days.reduce((a, d) => a + d.avgMcp, 0) / r.days.length;
    const last5 = r.days.slice(-5);
    const first5 = r.days.slice(0, 5);
    const peakHours = r.hourlyPattern.filter(h => (h.hour >= 7 && h.hour <= 10) || (h.hour >= 18 && h.hour <= 22));
    const offPeakHours = r.hourlyPattern.filter(h => !((h.hour >= 7 && h.hour <= 10) || (h.hour >= 18 && h.hour <= 22)));
    const peakAvg = peakHours.length > 0 ? peakHours.reduce((a, b) => a + b.avgMcp, 0) / peakHours.length : 0;
    const offPeakAvg = offPeakHours.length > 0 ? offPeakHours.reduce((a, b) => a + b.avgMcp, 0) / offPeakHours.length : 0;
    const totalVol = r.days.reduce((a, d) => a + d.totalMcv, 0);
    const avgPurchase = r.days.reduce((a, d) => a + d.totalPurchase, 0) / r.days.length;
    const avgSell = r.days.reduce((a, d) => a + d.totalSell, 0) / r.days.length;

    parts.push(`=== ${mkt} MARKET ===
Period: ${r.days.length} days (${r.days[0].date} to ${r.days[r.days.length - 1].date})
Overall Avg MCP: Rs ${avg.toFixed(0)}/MWh
Min daily avg: Rs ${Math.min(...r.days.map(d => d.avgMcp)).toFixed(0)}/MWh
Max daily avg: Rs ${Math.max(...r.days.map(d => d.avgMcp)).toFixed(0)}/MWh
Absolute max (single block): Rs ${Math.max(...r.days.map(d => d.maxMcp)).toFixed(0)}/MWh
Absolute min (single block): Rs ${Math.min(...r.days.map(d => d.minMcp)).toFixed(0)}/MWh

First 5 days avg MCP: ${first5.map(d => `${d.date}=${d.avgMcp.toFixed(0)}`).join(", ")}
Last 5 days avg MCP: ${last5.map(d => `${d.date}=${d.avgMcp.toFixed(0)}`).join(", ")}

Trend: slope=${r.trend.slope > 0 ? "+" : ""}${r.trend.slope.toFixed(2)} Rs/MWh per day, R²=${r.trend.r2.toFixed(4)}
7-day SMA (last): ${r.sma7.length > 0 ? r.sma7[r.sma7.length - 1].value.toFixed(0) : "N/A"} Rs/MWh
14-day SMA (last): ${r.sma14.length > 0 ? r.sma14[r.sma14.length - 1].value.toFixed(0) : "N/A"} Rs/MWh

Peak hours (7-10, 18-22) avg MCP: Rs ${peakAvg.toFixed(0)}/MWh
Off-peak avg MCP: Rs ${offPeakAvg.toFixed(0)}/MWh
Peak premium: Rs ${(peakAvg - offPeakAvg).toFixed(0)}/MWh (${((peakAvg / offPeakAvg - 1) * 100).toFixed(1)}%)

Total MCV: ${(totalVol / 1000).toFixed(0)} GWh
Avg daily purchase bids: ${avgPurchase.toFixed(0)} MW
Avg daily sell bids: ${avgSell.toFixed(0)} MW
Supply-demand ratio: ${(avgSell / avgPurchase).toFixed(2)}

Predicted next 7 days avg MCP: ${r.predictions.map(p => p.avgMcp.toFixed(0)).join(", ")} Rs/MWh
Predicted peak avg: ${r.predictions.map(p => p.peakMcp.toFixed(0)).join(", ")} Rs/MWh
Predicted off-peak avg: ${r.predictions.map(p => p.offPeakMcp.toFixed(0)).join(", ")} Rs/MWh`);
  }
  if (parts.length === 0) return "No data available for analysis.";

  try {
    const result = await analyst.run(
      `Analyze this IEX India electricity market data in detail. Compare all markets and give actionable insights:\n\n${parts.join("\n\n")}`
    );
    return result.text ?? "Analysis could not be generated.";
  } catch (err: any) {
    return `AI analysis unavailable: ${err.message}`;
  }
}

ns.on("connection", (socket) => {
  socket.on("scrape.start", async (data: { market?: string; days: number; allMarkets?: boolean }) => {
    const days = Math.min(data.days ?? 30, 60);
    const emit = (ev: string, d: any) => socket.emit(ev, d);
    const marketsToScrape = data.allMarkets ? ["DAM", "RTM", "GDAM"] : [data.market?.toUpperCase() ?? "DAM"];

    try {
      const allResults: AllMarketsResult = { DAM: null, RTM: null, GDAM: null };

      for (const market of marketsToScrape) {
        emit("scrape.status", { message: `Starting ${market} scrape for ${days} days...` });
        const rows = await scrapeMarket(market, days, emit);
        emit("scrape.status", { message: `Scraped ${rows.length} blocks for ${market}. Analyzing...` });
        const analysis = analyze(market, rows);
        allResults[market as keyof AllMarketsResult] = analysis as any;
        emit("market.complete", analysis);
      }

      emit("scrape.status", { message: "Generating AI analysis with Claude..." });
      allResults.aiSummary = await getAiSummary(allResults);
      emit("all.complete", allResults);
      emit("scrape.status", { message: `Done! All ${marketsToScrape.length} markets analyzed.` });
    } catch (err: any) {
      emit("scrape.error", { error: err.message });
    }
  });

  socket.on("scrape.stop", () => {
    if (activeBrowser) {
      activeBrowser.close().catch(() => {});
      activeBrowser = null;
    }
    socket.emit("scrape.stopped");
  });

  socket.on("bid.analyze", async (data: { bidPrice: number }) => {
    const bidPrice = data.bidPrice ?? 3;
    const allData: AllMarketsResult = { DAM: null, RTM: null, GDAM: null };
    let hasData = false;
    for (const mkt of ["DAM", "RTM", "GDAM"] as const) {
      const rows = dataCache[mkt];
      if (rows && rows.length > 0) {
        allData[mkt] = analyze(mkt, rows);
        hasData = true;
      }
    }
    if (!hasData) {
      socket.emit("bid.error", { error: "No market data loaded. Load demo or scrape first." });
      return;
    }
    socket.emit("bid.status", { message: `Analyzing bid of Rs ${bidPrice}/kWh across all markets...` });
    const bidResult = analyzeBid(bidPrice, allData);
    socket.emit("bid.status", { message: "Getting AI trading recommendation..." });
    bidResult.aiAnalysis = await getAiBidAnalysis(bidResult, allData);
    socket.emit("bid.complete", bidResult);
  });
});

/* ── Demo data for instant preview ──────────────────────────────────── */

function generateDemoData(market: string): BlockRow[] {
  const rows: BlockRow[] = [];

  // Realistic IEX India price profiles per market
  const profiles: Record<string, { base: number; peakPremium: number; volatility: number; trend: number; volBase: number }> = {
    DAM: { base: 3200, peakPremium: 2200, volatility: 600, trend: 15, volBase: 12000 },
    RTM: { base: 3500, peakPremium: 2800, volatility: 1200, trend: 20, volBase: 5000 },
    GDAM: { base: 900, peakPremium: 400, volatility: 200, trend: 5, volBase: 3000 },
  };
  const p = profiles[market] ?? profiles.DAM;

  // Seeded random for reproducibility within a session
  let seed = market.charCodeAt(0) * 1000 + 42;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };

  for (let d = 30; d >= 1; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const iso = isoDate(date);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekendDiscount = isWeekend ? -300 : 0;

    for (let h = 1; h <= 24; h++) {
      const isPeak = (h >= 7 && h <= 10) || (h >= 18 && h <= 22);
      const isShoulder = (h >= 11 && h <= 17);

      // Hourly shape: low at night, peak morning & evening
      const hourFactor = isPeak ? p.peakPremium : isShoulder ? p.peakPremium * 0.4 : -p.peakPremium * 0.3;
      const trendOffset = (30 - d) * p.trend;
      const noise = (rand() - 0.5) * 2 * p.volatility;

      // RTM can have spikes
      const spike = (market === "RTM" && rand() < 0.05) ? (rand() * 3000 + 2000) : 0;

      const mcp = Math.max(200, p.base + hourFactor + trendOffset + weekendDiscount + noise + spike);

      const baseVol = p.volBase + (isPeak ? p.volBase * 0.6 : isShoulder ? p.volBase * 0.2 : -p.volBase * 0.3);
      const mcv = Math.max(500, baseVol + (rand() - 0.5) * p.volBase * 0.3);
      const purchaseBid = mcv * (1.15 + rand() * 0.3);
      const sellBid = mcv * (1.5 + rand() * 0.5);

      rows.push({
        date: iso,
        hour: h,
        timeBlock: `${String(h - 1).padStart(2, "0")}:00 - ${String(h).padStart(2, "0")}:00`,
        purchaseBid: Math.round(purchaseBid),
        sellBid: Math.round(sellBid),
        mcv: Math.round(mcv),
        scheduledVolume: Math.round(mcv * (0.95 + rand() * 0.05)),
        mcp: Math.round(mcp * 100) / 100,
      });
    }
  }
  return rows;
}

/* ── REST Endpoints ─────────────────────────────────────────────────── */

app.get("/api/demo/all", async (_req, res) => {
  const result: AllMarketsResult = { DAM: null, RTM: null, GDAM: null };
  for (const mkt of ["DAM", "RTM", "GDAM"] as const) {
    const rows = generateDemoData(mkt);
    dataCache[mkt] = rows;
    result[mkt] = analyze(mkt, rows);
  }
  result.aiSummary = await getAiSummary(result);
  res.json(result);
});

app.get("/api/demo/:market", (req, res) => {
  const market = req.params.market.toUpperCase();
  const rows = generateDemoData(market);
  dataCache[market] = rows;
  const analysis = analyze(market, rows);
  res.json(analysis);
});

app.get("/api/data/:market", (req, res) => {
  const market = req.params.market.toUpperCase();
  const rows = dataCache[market];
  if (!rows) return res.status(404).json({ error: "No data. Run scrape or load demo first." });
  res.json(analyze(market, rows));
});

app.post("/api/bid-analysis", async (req, res) => {
  const bidPrice = req.body?.bidPrice ?? 3;
  const allData: AllMarketsResult = { DAM: null, RTM: null, GDAM: null };
  let hasData = false;
  for (const mkt of ["DAM", "RTM", "GDAM"] as const) {
    const rows = dataCache[mkt];
    if (rows && rows.length > 0) { allData[mkt] = analyze(mkt, rows); hasData = true; }
  }
  if (!hasData) return res.status(400).json({ error: "No market data. Load demo or scrape first." });
  const bidResult = analyzeBid(bidPrice, allData);
  bidResult.aiAnalysis = await getAiBidAnalysis(bidResult, allData);
  res.json(bidResult);
});

/* ── UI ─────────────────────────────────────────────────────────────── */

app.get("/", (_req, res) => { res.send(HTML); });

server.listen(PORT, () => {
  console.log(`\n  IEX Market Analyzer running at http://localhost:${PORT}\n`);
  console.log("  Open the URL in your browser to start.\n");
});

/* ── HTML ───────────────────────────────────────────────────────────── */

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IEX Market Analyzer — Agentium</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    :root {
      --bg: #0a0b0f; --surface: #12141a; --border: #1e2028;
      --text: #e0e2e8; --text-dim: #6b7080; --accent: #6366f1;
      --green: #22c55e; --red: #ef4444; --yellow: #f59e0b; --blue: #3b82f6;
      --dam: #6366f1; --rtm: #f59e0b; --gdam: #22c55e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }

    header {
      background: var(--surface); border-bottom: 1px solid var(--border);
      padding: 12px 24px; display: flex; align-items: center; gap: 16px;
    }
    header h1 { font-size: 18px; font-weight: 700; }
    header h1 span { color: var(--accent); }
    .badge { font-size: 11px; padding: 3px 10px; border-radius: 12px; font-weight: 600; }
    .badge-idle { background: #1a1a2e; color: var(--text-dim); }
    .badge-running { background: #0d2818; color: var(--green); animation: pulse 1.5s infinite; }
    .badge-done { background: #1a1a2e; color: var(--accent); }
    .badge-error { background: #2d1215; color: var(--red); }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
    .model-tag { font-size: 10px; padding: 3px 8px; border-radius: 8px; background: #1a1520; color: #a78bfa; margin-left: auto; }

    .controls-bar {
      background: var(--surface); border-bottom: 1px solid var(--border);
      padding: 10px 24px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    .controls-bar label { font-size: 12px; color: var(--text-dim); }
    .controls-bar select {
      padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text); font-size: 13px;
    }
    .btn {
      padding: 7px 18px; border-radius: 6px; border: none; cursor: pointer;
      font-size: 13px; font-weight: 600; transition: all .2s;
    }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #5558e6; }
    .btn-primary:disabled { background: #333; color: #666; cursor: not-allowed; }
    .btn-demo { background: #1a2332; color: var(--blue); border: 1px solid var(--border); }
    .btn-demo:hover { background: #1e2940; }
    .btn-stop { background: var(--red); color: #fff; }
    .btn-stop:disabled { background: #333; color: #666; cursor: not-allowed; }
    .progress-text { font-size: 12px; color: var(--text-dim); flex: 1; text-align: right; }

    .main { display: flex; flex: 1; min-height: calc(100vh - 100px); }
    .main.with-scrape .scrape-panel { display: flex; }

    .scrape-panel {
      width: 380px; background: var(--surface); border-right: 1px solid var(--border);
      display: none; flex-direction: column;
    }
    .scrape-viewer { height: 220px; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .scrape-viewer img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .scrape-viewer .placeholder { color: #333; font-size: 13px; }
    .scrape-log { flex: 1; overflow-y: auto; padding: 8px; }
    .log-entry { font-size: 11px; padding: 4px 8px; margin-bottom: 2px; border-radius: 3px; font-family: monospace; word-break: break-word; }
    .log-info { background: #111318; color: var(--text-dim); }
    .log-data { background: #0d1b2a; color: var(--blue); }
    .log-ok { background: #0d2818; color: var(--green); }
    .log-err { background: #2d1215; color: var(--red); }

    .charts-area { flex: 1; padding: 20px; overflow-y: auto; }

    .ai-summary {
      background: linear-gradient(135deg, #1a1520 0%, #12141a 100%);
      border: 1px solid #2d2640; border-radius: 10px; padding: 18px; margin-bottom: 20px;
    }
    .ai-summary h3 { font-size: 14px; color: #a78bfa; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
    .ai-summary .ai-text { font-size: 13px; line-height: 1.7; color: var(--text); white-space: pre-wrap; }
    .ai-summary .ai-loading { color: var(--text-dim); font-style: italic; }

    .market-section { margin-bottom: 28px; }
    .market-section h2 {
      font-size: 16px; font-weight: 700; margin-bottom: 14px; padding-bottom: 8px;
      border-bottom: 2px solid var(--border); display: flex; align-items: center; gap: 10px;
    }
    .market-section h2 .dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot-dam { background: var(--dam); }
    .dot-rtm { background: var(--rtm); }
    .dot-gdam { background: var(--gdam); }

    .stats-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 16px; flex: 1; min-width: 130px;
    }
    .stat-card .label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .5px; }
    .stat-card .value { font-size: 20px; font-weight: 700; margin-top: 3px; }
    .stat-card .sub { font-size: 10px; color: var(--text-dim); margin-top: 2px; }
    .trend-up { color: var(--red); }
    .trend-down { color: var(--green); }

    .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .chart-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 14px; min-height: 260px;
    }
    .chart-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
    .chart-card canvas { width: 100% !important; }

    .pred-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .pred-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
    .pred-card h3 { font-size: 13px; font-weight: 600; margin-bottom: 10px; }
    .pred-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .pred-table th { text-align: left; padding: 5px 6px; color: var(--text-dim); border-bottom: 1px solid var(--border); font-weight: 600; }
    .pred-table td { padding: 5px 6px; border-bottom: 1px solid var(--border); }
    .pred-table .peak { color: var(--red); font-weight: 600; }
    .pred-table .offpeak { color: var(--green); font-weight: 600; }

    .compare-section { margin-bottom: 28px; }
    .compare-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }

    .empty-state { text-align: center; padding: 80px 40px; color: var(--text-dim); }
    .empty-state h2 { font-size: 20px; margin-bottom: 8px; color: var(--text); }
    .empty-state p { font-size: 14px; }

    .bid-section {
      background: linear-gradient(135deg, #0f1520 0%, #12141a 100%);
      border: 1px solid #1a2535; border-radius: 10px; padding: 18px; margin-bottom: 20px;
    }
    .bid-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 14px; color: var(--yellow); display: flex; align-items: center; gap: 8px; }
    .bid-input-row { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
    .bid-input-row label { font-size: 12px; color: var(--text-dim); }
    .bid-input-row input {
      width: 100px; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border);
      background: var(--bg); color: var(--yellow); font-size: 16px; font-weight: 700; text-align: center;
    }
    .bid-input-row input:focus { border-color: var(--yellow); outline: none; }
    .bid-input-row .unit { font-size: 13px; color: var(--text-dim); }
    .btn-bid { background: var(--yellow); color: #000; font-weight: 700; }
    .btn-bid:hover { background: #e09000; }
    .btn-bid:disabled { background: #333; color: #666; }

    .bid-results { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
    .bid-market-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px;
      position: relative;
    }
    .bid-market-card.best { border-color: var(--green); }
    .bid-market-card.best::after {
      content: "BEST"; position: absolute; top: 8px; right: 8px;
      font-size: 9px; padding: 2px 8px; border-radius: 6px; background: var(--green); color: #000; font-weight: 700;
    }
    .bid-market-card h4 { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
    .bid-market-card .big-num { font-size: 28px; font-weight: 800; margin-bottom: 4px; }
    .bid-market-card .big-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; margin-bottom: 10px; }
    .bid-detail { font-size: 12px; color: var(--text-dim); margin-bottom: 3px; }
    .bid-detail span { color: var(--text); font-weight: 600; }

    .bid-heatmap { margin-bottom: 16px; }
    .bid-heatmap h3 { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .heatmap-grid { display: grid; grid-template-columns: 80px repeat(24, 1fr); gap: 2px; font-size: 10px; }
    .heatmap-label { padding: 4px; color: var(--text-dim); font-weight: 600; display: flex; align-items: center; }
    .heatmap-cell {
      padding: 4px 2px; text-align: center; border-radius: 3px; font-weight: 600; font-size: 9px;
      min-height: 28px; display: flex; align-items: center; justify-content: center;
    }
    .heatmap-header { font-weight: 600; color: var(--text-dim); text-align: center; padding: 4px 2px; }

    .bid-ai {
      background: linear-gradient(135deg, #1a1520 0%, #12141a 100%);
      border: 1px solid #2d2640; border-radius: 10px; padding: 16px; margin-top: 14px;
    }
    .bid-ai h3 { font-size: 13px; color: #a78bfa; margin-bottom: 8px; }
    .bid-ai .ai-text { font-size: 12px; line-height: 1.7; white-space: pre-wrap; }
  </style>
</head>
<body>
  <header>
    <h1><span>IEX</span> Market Analyzer</h1>
    <span id="status" class="badge badge-idle">Ready</span>
    <span class="model-tag">Claude Opus 4.6</span>
  </header>

  <div class="controls-bar">
    <label>Days:</label>
    <select id="daysSelect">
      <option value="7">7 days</option>
      <option value="14">14 days</option>
      <option value="30" selected>30 days</option>
    </select>
    <button class="btn btn-primary" id="scrapeBtn" onclick="startScrapeAll()">Scrape All Markets</button>
    <button class="btn btn-demo" onclick="loadDemoAll()">Load Demo Data (All 3)</button>
    <button class="btn btn-stop" id="stopBtn" onclick="stopScrape()" disabled>Stop</button>
    <span style="color:#333;margin:0 4px;">|</span>
    <label>Bid Price:</label>
    <input id="bidInput" type="number" value="3" min="0.1" max="20" step="0.1" style="width:70px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--yellow);font-size:14px;font-weight:700;text-align:center;" />
    <span style="font-size:12px;color:var(--text-dim);">Rs/kWh</span>
    <button class="btn btn-bid" id="bidBtn" onclick="runBidAnalysis()">Analyze Bid</button>
    <span class="progress-text" id="progressText"></span>
  </div>

  <div class="main" id="mainArea">
    <div class="scrape-panel" id="scrapePanel">
      <div class="scrape-viewer" id="scrapeViewer">
        <div class="placeholder">Browser view</div>
      </div>
      <div class="scrape-log" id="scrapeLog"></div>
    </div>

    <div class="charts-area" id="chartsArea">
      <div class="empty-state" id="emptyState">
        <h2>No Data Loaded</h2>
        <p>Click "Load Demo Data (All 3)" for an instant preview with predictions for DAM, RTM &amp; GDAM,<br/>or "Scrape All Markets" to fetch real data from iexindia.com</p>
      </div>
      <div id="dashboard" style="display:none;"></div>
    </div>
  </div>

<script>
const socket = io("/iex");
let charts = {};
const MKT_COLORS = { DAM: "#6366f1", RTM: "#f59e0b", GDAM: "#22c55e" };

function setStatus(label, cls) {
  const el = document.getElementById("status");
  el.textContent = label; el.className = "badge badge-" + cls;
}

function addLog(cls, text) {
  const log = document.getElementById("scrapeLog");
  const d = document.createElement("div");
  d.className = "log-entry " + cls; d.textContent = text;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
}

function startScrapeAll() {
  const days = parseInt(document.getElementById("daysSelect").value);
  document.getElementById("mainArea").classList.add("with-scrape");
  document.getElementById("scrapePanel").style.display = "flex";
  document.getElementById("scrapeLog").innerHTML = "";
  document.getElementById("scrapeViewer").innerHTML = '<div class="placeholder">Launching...</div>';
  document.getElementById("scrapeBtn").disabled = true;
  document.getElementById("stopBtn").disabled = false;
  setStatus("Scraping all markets", "running");
  socket.emit("scrape.start", { allMarkets: true, days });
}

function stopScrape() {
  socket.emit("scrape.stop");
  setStatus("Stopped", "idle");
  document.getElementById("scrapeBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
}

async function loadDemoAll() {
  setStatus("Loading all markets...", "running");
  try {
    const res = await fetch("/api/demo/all");
    const data = await res.json();
    renderAllMarkets(data);
    setStatus("Demo loaded — all 3 markets", "done");
  } catch(e) { setStatus("Error: " + e.message, "error"); }
}

socket.on("scrape.screenshot", ({data}) => {
  const viewer = document.getElementById("scrapeViewer");
  let img = viewer.querySelector("img");
  if (!img) { viewer.innerHTML = ""; img = document.createElement("img"); viewer.appendChild(img); }
  img.src = "data:image/png;base64," + data;
});

socket.on("scrape.status", ({message}) => addLog("log-info", message));
socket.on("scrape.progress", ({current, total, date, message}) => {
  document.getElementById("progressText").textContent = current + "/" + total + " — " + date;
  addLog("log-info", message);
});
socket.on("scrape.data", ({date, rowCount, market}) => addLog("log-data", market + " " + date + ": " + rowCount + " blocks"));
socket.on("scrape.error", ({error}) => {
  addLog("log-err", error);
  setStatus("Error", "error");
  document.getElementById("scrapeBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
});
socket.on("scrape.stopped", () => {
  addLog("log-info", "Stopped");
  document.getElementById("scrapeBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
});
socket.on("market.complete", (data) => {
  addLog("log-ok", data.market + " analysis complete: " + data.days.length + " days");
});
socket.on("all.complete", (data) => {
  addLog("log-ok", "All markets analyzed! Rendering dashboard...");
  renderAllMarkets(data);
  setStatus("Done — all 3 markets", "done");
  document.getElementById("scrapeBtn").disabled = false;
  document.getElementById("stopBtn").disabled = true;
  document.getElementById("progressText").textContent = "";
});

const chartOpts = {
  responsive: true,
  plugins: { legend: { labels: { color: "#8b8fa0", font: { size: 10 } } } },
  scales: {
    x: { ticks: { color: "#6b7080", font: { size: 9 }, maxRotation: 45 }, grid: { color: "#1e2028" } },
    y: { ticks: { color: "#6b7080", font: { size: 9 } }, grid: { color: "#1e2028" } },
  },
};

function destroyCharts() { Object.values(charts).forEach(c => { if (c && c.destroy) c.destroy(); }); charts = {}; }

function renderAllMarkets(data) {
  destroyCharts();
  document.getElementById("emptyState").style.display = "none";
  const dash = document.getElementById("dashboard");
  dash.style.display = "block";

  let html = "";

  // AI Summary
  html += '<div class="ai-summary"><h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> Claude AI Analysis</h3>';
  if (data.aiSummary) {
    html += '<div class="ai-text">' + escHtml(data.aiSummary) + '</div>';
  } else {
    html += '<div class="ai-text ai-loading">Generating analysis...</div>';
  }
  html += '</div>';

  // Cross-market comparison charts
  html += '<div class="compare-section"><h2>Cross-Market Comparison</h2>';
  html += '<div class="chart-grid">';
  html += '<div class="chart-card"><h3>MCP Price Trend — All Markets (Rs/MWh)</h3><canvas id="chartCompTrend"></canvas></div>';
  html += '<div class="chart-card"><h3>7-Day Prediction — All Markets</h3><canvas id="chartCompPred"></canvas></div>';
  html += '</div></div>';

  // Per-market sections
  for (const mkt of ["DAM", "RTM", "GDAM"]) {
    const m = data[mkt];
    if (!m || !m.days || m.days.length === 0) continue;
    const dotCls = "dot-" + mkt.toLowerCase();
    html += '<div class="market-section" id="section-' + mkt + '">';
    html += '<h2><span class="dot ' + dotCls + '"></span>' + mkt + ' Market</h2>';
    html += '<div class="stats-row" id="stats-' + mkt + '"></div>';
    html += '<div class="chart-grid">';
    html += '<div class="chart-card"><h3>Hourly Price Pattern</h3><canvas id="chartHourly-' + mkt + '"></canvas></div>';
    html += '<div class="chart-card"><h3>Volume &amp; Supply/Demand</h3><canvas id="chartVol-' + mkt + '"></canvas></div>';
    html += '</div>';
    html += '<div class="pred-grid">';
    html += '<div class="pred-card"><h3>7-Day Prediction</h3><canvas id="chartPred-' + mkt + '"></canvas></div>';
    html += '<div class="pred-card"><h3>Peak &amp; Off-Peak Forecast</h3><table class="pred-table" id="predTable-' + mkt + '"><thead><tr><th>Date</th><th>Avg</th><th>Peak</th><th>Off-Peak</th></tr></thead><tbody></tbody></table></div>';
    html += '</div></div>';
  }

  dash.innerHTML = html;

  // Render cross-market comparison
  const allLabels = getLongestLabels(data);
  const compDatasets = [];
  const predDatasets = [];
  for (const mkt of ["DAM", "RTM", "GDAM"]) {
    const m = data[mkt];
    if (!m || !m.days || m.days.length === 0) continue;
    const dayMap = new Map(m.days.map(d => [d.date.slice(5), d.avgMcp]));
    compDatasets.push({
      label: mkt, data: allLabels.map(l => dayMap.get(l) ?? null),
      borderColor: MKT_COLORS[mkt], tension: .3, pointRadius: 1,
    });
    const predLabels = m.predictions.map(p => p.date.slice(5));
    predDatasets.push({
      label: mkt, data: m.predictions.map(p => p.avgMcp),
      borderColor: MKT_COLORS[mkt], tension: .3, pointRadius: 3, borderDash: [5,3],
    });
  }
  charts.compTrend = new Chart(document.getElementById("chartCompTrend"), {
    type: "line", data: { labels: allLabels, datasets: compDatasets }, options: {...chartOpts},
  });
  const predLabelsAll = data.DAM?.predictions?.map(p => p.date.slice(5)) || data.RTM?.predictions?.map(p => p.date.slice(5)) || data.GDAM?.predictions?.map(p => p.date.slice(5)) || [];
  charts.compPred = new Chart(document.getElementById("chartCompPred"), {
    type: "line", data: { labels: predLabelsAll, datasets: predDatasets }, options: {...chartOpts},
  });

  // Render per-market sections
  for (const mkt of ["DAM", "RTM", "GDAM"]) {
    const m = data[mkt];
    if (!m || !m.days || m.days.length === 0) continue;
    renderMarketSection(mkt, m);
  }
}

function renderMarketSection(mkt, data) {
  const days = data.days;
  const last = days[days.length - 1];
  const avgAll = days.reduce((a,d) => a + d.avgMcp, 0) / days.length;
  const trendDir = data.trend.slope > 0 ? "up" : "down";
  const color = MKT_COLORS[mkt];

  document.getElementById("stats-" + mkt).innerHTML =
    statCard("Avg MCP", avgAll.toFixed(0) + " Rs", days.length + " days") +
    statCard("Latest", last?.avgMcp.toFixed(0) + " Rs", last?.date || "") +
    statCard("Trend", (data.trend.slope > 0 ? "+" : "") + data.trend.slope.toFixed(1) + " Rs/day",
      "R\\u00b2 = " + data.trend.r2.toFixed(3), trendDir) +
    statCard("Peak Max", Math.max(...days.map(d=>d.maxMcp)).toFixed(0) + " Rs", "Highest block") +
    statCard("Volume", (days.reduce((a,d)=>a+d.totalMcv,0)/1000).toFixed(0) + " GWh", "Total MCV");

  // Hourly Pattern
  const hp = data.hourlyPattern;
  const barColors = hp.map(h => (h.hour>=7&&h.hour<=10)||(h.hour>=18&&h.hour<=22) ? "#ef4444" : color);
  charts["hourly-"+mkt] = new Chart(document.getElementById("chartHourly-" + mkt), {
    type: "bar",
    data: { labels: hp.map(h => h.hour + ":00"), datasets: [{ label: "Avg MCP", data: hp.map(h => h.avgMcp), backgroundColor: barColors, borderRadius: 3 }] },
    options: {...chartOpts},
  });

  // Volume + Supply/Demand combo
  charts["vol-"+mkt] = new Chart(document.getElementById("chartVol-" + mkt), {
    type: "line",
    data: {
      labels: days.map(d => d.date.slice(5)),
      datasets: [
        { label: "MCV", data: days.map(d => d.totalMcv), borderColor: color, backgroundColor: color + "18", fill: true, tension: .3, pointRadius: 1 },
        { label: "Purchase", data: days.map(d => d.totalPurchase), borderColor: "#ef4444", tension: .3, pointRadius: 0, borderDash: [3,2] },
        { label: "Sell", data: days.map(d => d.totalSell), borderColor: "#22c55e", tension: .3, pointRadius: 0, borderDash: [3,2] },
      ],
    },
    options: {...chartOpts},
  });

  // Prediction chart
  const actSlice = days.slice(-7);
  const predLabels = [...actSlice.map(d=>d.date.slice(5)), ...data.predictions.map(p=>p.date.slice(5))];
  const actualData = [...actSlice.map(d=>d.avgMcp), ...Array(data.predictions.length).fill(null)];
  const predData = [...Array(actSlice.length).fill(null), ...data.predictions.map(p=>p.avgMcp)];
  if (actSlice.length > 0) predData[actSlice.length - 1] = actSlice[actSlice.length-1].avgMcp;

  charts["pred-"+mkt] = new Chart(document.getElementById("chartPred-" + mkt), {
    type: "line",
    data: {
      labels: predLabels,
      datasets: [
        { label: "Actual", data: actualData, borderColor: color, tension: .3, pointRadius: 3 },
        { label: "Predicted", data: predData, borderColor: "#f59e0b", borderDash: [6,3], tension: .3, pointRadius: 3 },
      ],
    },
    options: {...chartOpts},
  });

  // Prediction table
  const tbody = document.querySelector("#predTable-" + mkt + " tbody");
  tbody.innerHTML = data.predictions.map(p =>
    "<tr><td>" + p.date.slice(5) + '</td><td>' + p.avgMcp.toFixed(0) +
    '</td><td class="peak">' + p.peakMcp.toFixed(0) +
    '</td><td class="offpeak">' + p.offPeakMcp.toFixed(0) + "</td></tr>"
  ).join("");
}

function getLongestLabels(data) {
  let longest = [];
  for (const mkt of ["DAM", "RTM", "GDAM"]) {
    const m = data[mkt];
    if (m && m.days && m.days.length > longest.length) longest = m.days.map(d => d.date.slice(5));
  }
  return longest;
}

function padSMA(sma, days) {
  const map = new Map(sma.map(s => [s.date, s.value]));
  return days.map(d => map.get(d.date) ?? null);
}

function escHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function statCard(label, value, sub, trend) {
  const trendCls = trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : "";
  return '<div class="stat-card"><div class="label">' + label +
    '</div><div class="value ' + trendCls + '">' + value +
    '</div><div class="sub">' + sub + '</div></div>';
}

// ── Bid Analysis ──

function runBidAnalysis() {
  const bidPrice = parseFloat(document.getElementById("bidInput").value) || 3;
  document.getElementById("bidBtn").disabled = true;
  setStatus("Analyzing bid...", "running");
  socket.emit("bid.analyze", { bidPrice });
}

socket.on("bid.status", ({message}) => addLog("log-info", message));
socket.on("bid.error", ({error}) => {
  addLog("log-err", error);
  setStatus("Error", "error");
  document.getElementById("bidBtn").disabled = false;
});

socket.on("bid.complete", (data) => {
  setStatus("Bid analysis done", "done");
  document.getElementById("bidBtn").disabled = false;
  renderBidAnalysis(data);
});

function renderBidAnalysis(bid) {
  let existing = document.getElementById("bidAnalysisSection");
  if (existing) existing.remove();

  const section = document.createElement("div");
  section.id = "bidAnalysisSection";
  section.className = "bid-section";

  const bidMwh = bid.bidPrice * 1000;
  let html = '<h2><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> Bid Analysis: Rs ' + bid.bidPrice + '/kWh (Rs ' + bidMwh + '/MWh) for 96 Blocks</h2>';

  // Market comparison cards
  html += '<div class="bid-results">';
  const mkts = Object.values(bid.markets);
  mkts.sort((a,b) => b.overallClearRate - a.overallClearRate);
  for (const m of mkts) {
    const isBest = m.market === bid.bestMarket;
    const color = MKT_COLORS[m.market] || "#fff";
    html += '<div class="bid-market-card' + (isBest ? ' best' : '') + '">';
    html += '<h4 style="color:' + color + '">' + m.market + '</h4>';
    html += '<div class="big-num" style="color:' + (m.overallClearRate > 50 ? "var(--green)" : m.overallClearRate > 20 ? "var(--yellow)" : "var(--red)") + '">' + m.overallClearRate + '%</div>';
    html += '<div class="big-label">Block Clearing Rate</div>';
    html += '<div class="bid-detail">Avg MCP when cleared: <span>Rs ' + m.avgMcpWhenCleared + '/MWh</span></div>';
    html += '<div class="bid-detail">Avg saving/MWh: <span>Rs ' + m.avgSavingPerMwh + '</span></div>';
    html += '<div class="bid-detail">Est. daily cost (1MW): <span>Rs ' + m.totalCostForAllBlocks.toLocaleString() + '</span></div>';
    html += '<div class="bid-detail">Best hours: <span>' + m.bestHours.map(h=>h+":00").join(", ") + '</span></div>';
    html += '<div class="bid-detail">Worst hours: <span>' + m.worstHours.map(h=>h+":00").join(", ") + '</span></div>';
    html += '<div style="margin-top:8px;font-size:11px;color:var(--text-dim);font-style:italic;">' + escHtml(m.recommendation) + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Heatmap: clearing rate by hour for each market
  html += '<div class="bid-heatmap"><h3>Hourly Clearing Rate Heatmap (% of days bid clears per hour)</h3>';
  html += '<div class="heatmap-grid">';
  html += '<div class="heatmap-header"></div>';
  for (let h = 1; h <= 24; h++) html += '<div class="heatmap-header">' + h + '</div>';
  for (const m of mkts) {
    html += '<div class="heatmap-label" style="color:' + (MKT_COLORS[m.market]||"#fff") + '">' + m.market + '</div>';
    for (let h = 1; h <= 24; h++) {
      const block = m.blocks.find(b => b.hour === h);
      const rate = block ? block.clearRate : 0;
      const bg = rate > 80 ? "rgba(34,197,94,.7)" : rate > 50 ? "rgba(245,158,11,.6)" : rate > 20 ? "rgba(245,158,11,.3)" : rate > 0 ? "rgba(239,68,68,.3)" : "rgba(255,255,255,.05)";
      html += '<div class="heatmap-cell" style="background:' + bg + '">' + rate.toFixed(0) + '</div>';
    }
  }
  html += '</div></div>';

  // Clearing rate chart
  html += '<div class="chart-grid"><div class="chart-card"><h3>Clearing Rate by Hour — All Markets</h3><canvas id="chartBidClear"></canvas></div>';
  html += '<div class="chart-card"><h3>Avg MCP vs Your Bid by Hour</h3><canvas id="chartBidMcp"></canvas></div></div>';

  // AI recommendation
  if (bid.aiAnalysis) {
    html += '<div class="bid-ai"><h3>Claude AI Trading Recommendation</h3><div class="ai-text">' + escHtml(bid.aiAnalysis) + '</div></div>';
  }

  section.innerHTML = html;

  const dashboard = document.getElementById("dashboard");
  if (dashboard.firstChild) dashboard.insertBefore(section, dashboard.firstChild);
  else dashboard.appendChild(section);
  document.getElementById("emptyState").style.display = "none";
  dashboard.style.display = "block";

  // Render charts
  const hours = Array.from({length:24}, (_,i) => (i+1) + ":00");

  const clearDatasets = mkts.map(m => ({
    label: m.market,
    data: Array.from({length:24}, (_,i) => { const b = m.blocks.find(b=>b.hour===i+1); return b ? b.clearRate : 0; }),
    borderColor: MKT_COLORS[m.market], backgroundColor: MKT_COLORS[m.market] + "30", fill: false, tension: .3, pointRadius: 2,
  }));
  if (charts.bidClear) charts.bidClear.destroy();
  charts.bidClear = new Chart(document.getElementById("chartBidClear"), {
    type: "line", data: { labels: hours, datasets: clearDatasets },
    options: {...chartOpts, scales: {...chartOpts.scales, y: {...chartOpts.scales.y, min: 0, max: 100, title: { display: true, text: "Clear Rate %", color: "#6b7080" } }}},
  });

  const mcpDatasets = mkts.map(m => ({
    label: m.market + " Avg MCP",
    data: Array.from({length:24}, (_,i) => { const b = m.blocks.find(b=>b.hour===i+1); return b ? b.avgMcp : null; }),
    borderColor: MKT_COLORS[m.market], tension: .3, pointRadius: 2,
  }));
  mcpDatasets.push({
    label: "Your Bid (Rs " + bidMwh + "/MWh)",
    data: Array(24).fill(bidMwh),
    borderColor: "#ef4444", borderDash: [8,4], pointRadius: 0, tension: 0,
  });
  if (charts.bidMcp) charts.bidMcp.destroy();
  charts.bidMcp = new Chart(document.getElementById("chartBidMcp"), {
    type: "line", data: { labels: hours, datasets: mcpDatasets }, options: {...chartOpts},
  });
}
</script>
</body>
</html>`;
