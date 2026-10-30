import ollama from "ollama";
import { readFileSync } from "node:fs";
import * as readline from "node:readline/promises";
import { cosineSimilarity } from "./similarity.ts";
import { chunk } from "./chunk.ts";

const MIN_SCORE = 0.55; // your cut-off from Lesson 3
const NOT_FOUND = "I don't know based on the handbook.";

// The house rules for the chat AI
const SYSTEM_PROMPT = `You answer questions about a company handbook.
Rules:
- Use ONLY the numbered sources you are given. Do not use outside knowledge.
- After each fact, write the number of its source in square brackets, like [2].
- If the sources do not contain the answer, reply exactly: "${NOT_FOUND}"
- Keep the answer short.`;

// ---------- Lesson 3: search ----------
const chunks = chunk(readFileSync("./handbook.txt", "utf8"));

// Startup: embed every piece of the handbook (this is rag.ts's version of "connect")
const t = performance.now(); // ⏱️ start
const res = await ollama.embed({
  model: "nomic-embed-text",
  input: chunks.map((c) => "search_document: " + c),
});
const chunkVectors = res.embeddings;
console.log(Math.round(performance.now() - t), "ms to embed the handbook"); // ⏱️ stop
console.log(`Ready: ${chunks.length} chunks`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

while (true) {
  const question = await rl.question("\nask > ");
  if (question === "exit") break;

  // 1. RETRIEVE: find the 3 closest pieces (same as Lesson 3)
  const qRes = await ollama.embed({
    model: "nomic-embed-text",
    input: "search_query: " + question,
  });
  const questionVector = qRes.embeddings[0];

  const t2 = performance.now(); // ⏱️ time one search (same job as db.query in rag-db.ts)
  const top3 = chunks
    .map((text, i) => ({
      text,
      index: i,
      score: cosineSimilarity(questionVector, chunkVectors[i]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  // 2 decimals, because this one is so fast it would round to 0
  console.log((performance.now() - t2).toFixed(2), "ms to search"); // ⏱️ stop

  // Safety net 1: nothing close enough, so don't even ask the chat AI
  if (top3[0].score < MIN_SCORE) {
    console.log(NOT_FOUND);
    continue;
  }

  // ---------- Lesson 4: new ----------

  // 2. AUGMENT: number the pieces and build the two messages
  const sources = top3
    .map((r, i) => `[${i + 1}] ${r.text}`) // i is 0,1,2, so i + 1 gives 1,2,3
    .join("\n\n"); // glue them into one string

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: "Sources:\n" + sources + "\n\nQuestion: " + question,
    },
  ];

  // 3. GENERATE: stream the answer from qwen
  const stream = await ollama.chat({
    model: "qwen3.5:9b",
    messages,
    think: false,
    options: { temperature: 0.2 },
    stream: true,
  });

  for await (const part of stream) {
    process.stdout.write(part.message.content); // print each bit on the same line
  }
  console.log();

  // Sources list under the answer
  console.log("\nSources:");
  top3.forEach((r, i) => {
    const preview = r.text.slice(0, 80).replace(/\n/g, " "); // first 80 characters, on one line
    console.log(
      `[${i + 1}] chunk ${r.index} (${r.score.toFixed(2)}): ${preview}...`,
    );
  });
}
rl.close();
