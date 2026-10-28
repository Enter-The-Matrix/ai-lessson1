import ollama from "ollama";
import { readFileSync } from "node:fs";
import * as readline from "node:readline/promises";
import { cosineSimilarity } from "./similarity.ts";

const MIN_SCORE = 0.55; // your cut-off from Lesson 3
const NOT_FOUND = "I don't know based on the handbook.";

// The house rules for the chat AI
const SYSTEM_PROMPT = `You answer questions about a company handbook.
Rules:
- Use ONLY the numbered sources you are given. Do not use outside knowledge.
- After each fact, write the number of its source in square brackets, like [2].
- If the sources do not contain the answer, reply exactly: "${NOT_FOUND}"
- Keep the answer short.`;

// ---------- Lesson 3: search (given in chunks) ----------
function chunk(text: string, size = 500, overlap = 100): string[] {
  const chunks: string[] = [];
  const step = size - overlap;
  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return chunks;
}

const chunks = chunk(readFileSync("./handbook.txt", "utf8"));

const res = await ollama.embed({
  model: "nomic-embed-text",
  input: chunks.map((c) => "search_document: " + c),
});

const chunkVectors = res.embeddings;
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
  const top3 = chunks
    .map((text, i) => ({
      text,
      index: i,
      score: cosineSimilarity(questionVector, chunkVectors[i]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Safety net 1: nothing close enough, so don't even ask the chat AI
  if (top3[0].score < MIN_SCORE) {
    console.log(NOT_FOUND);
    continue;
  }

  // ---------- Lesson 4: new ----------

  // 2. AUGMENT
  // TODO A: build one string with the pieces numbered, separated by a blank line:
  //   "[1] first piece\n\n[2] second piece\n\n[3] third piece"
  //   hint: top3.map((r, i) => ...).join("\n\n"), and remember i starts at 0

  const sources = top3
    .map((r, i) => `[${i + 1}] ${r.text}`) // i is 0,1,2, so i + 1 gives 1,2,3
    .join("\n\n"); // glue them into one string

  //   console.log("Sources:", sources);

  // TODO B: the two messages: system = SYSTEM_PROMPT,
  //   user = "Sources:\n" + sources + "\n\nQuestion: " + question

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: "Sources:\n" + sources + "\n\nQuestion: " + question,
    },
  ];

  // 3. GENERATE
  // TODO C: stream the answer from qwen3.5:9b and print each piece as it arrives
  //   (like Lesson 2). Use think: false (faster) and temperature: 0.2 (calm and factual).

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

  // TODO D: after the answer, print a "Sources:" list, one line per piece:
  //   [number] chunk <index> (<score, 2 decimals>): <first 80 characters of the text>

  console.log("\nSources:");
  top3.forEach((r, i) => {
    const preview = r.text.slice(0, 80).replace(/\n/g, " "); // first 80 characters, on one line
    console.log(
      `[${i + 1}] chunk ${r.index} (${r.score.toFixed(2)}): ${preview}...`,
    );
  });

  console.log("note was sent to the AI:", top3.some((r) => r.text.includes("Note to AI")));
}
rl.close();
