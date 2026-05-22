/**
 * Multimodal embedding with Gemini Embedding 2.
 *
 * Indexes images + captions into a single vector space and runs an image
 * similarity search. Requires `gemini-embedding-2` (GA Apr 2026).
 *
 * Usage:
 *   GOOGLE_API_KEY=AIza... npx tsx examples/knowledge/29-multimodal-embedding.ts ./img1.jpg ./img2.jpg ./query.jpg
 *
 * If no image paths are passed, the example falls back to remote URLs.
 */

import {
  GoogleEmbedding,
  InMemoryVectorStore,
  fetchAsBase64,
  partsFromFile,
} from "@agentium/core";

const DEFAULT_IMAGES = [
  { url: "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png", caption: "Dice on a checkerboard, PNG transparency demo" },
  { url: "https://upload.wikimedia.org/wikipedia/commons/3/3a/Cat03.jpg", caption: "A black cat sitting on a stone" },
];

async function loadPart(source: string) {
  if (/^https?:\/\//.test(source)) {
    const { data, mimeType } = await fetchAsBase64(source);
    return { type: "image" as const, data, mimeType: mimeType as any };
  }
  return partsFromFile(source);
}

async function main() {
  const args = process.argv.slice(2);
  const useUrls = args.length === 0;

  const embedder = new GoogleEmbedding({
    model: "gemini-embedding-2",
    // Smaller vectors store more efficiently; 768 keeps high accuracy
    dimensions: 768,
  });
  const store = new InMemoryVectorStore(embedder);

  console.log(`Indexing ${useUrls ? DEFAULT_IMAGES.length : args.length - 1} image(s)...`);

  if (useUrls) {
    for (let i = 0; i < DEFAULT_IMAGES.length; i++) {
      const { url, caption } = DEFAULT_IMAGES[i];
      const part = await loadPart(url);
      await store.upsert("photos", {
        id: `photo-${i}`,
        content: caption,
        parts: [{ type: "text", text: caption }, part],
        metadata: { source: url },
      });
      console.log(`  indexed photo-${i}: ${caption}`);
    }
  } else {
    const [, ...corpus] = args;
    const docs = args.slice(0, -1);
    for (let i = 0; i < docs.length; i++) {
      const path = docs[i];
      const part = await partsFromFile(path);
      await store.upsert("photos", {
        id: `photo-${i}`,
        content: path,
        parts: [{ type: "text", text: path }, part],
        metadata: { path },
      });
      console.log(`  indexed photo-${i}: ${path}`);
    }
  }

  const queryPath = useUrls ? DEFAULT_IMAGES[1].url : args[args.length - 1];
  console.log(`\nSearching by image: ${queryPath}`);
  const queryPart = await loadPart(queryPath);
  const results = await store.search("photos", [queryPart], { topK: 5 });

  console.log("\nTop matches:");
  for (const r of results) {
    console.log(`  ${r.score.toFixed(4)}  ${r.id}  -  ${r.content}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
