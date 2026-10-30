import ollama from "ollama";
import pg from "pg";
import * as readline from "node:readline/promises";

// Read DATABASE_URL_POOLED from the .env file and connect to Neon
process.loadEnvFile("../.env"); // .env lives in the main project folder
const db = new pg.Client({ connectionString: process.env.DATABASE_URL_POOLED });
const t = performance.now(); // ⏱️ start
await db.connect();
console.log(Math.round(performance.now() - t), "ms to connect"); // ⏱️ stop

const MIN_SCORE = 0.55; // your cut-off from Lesson 3
const NOT_FOUND = "I don't know based on the handbook.";

// The house rules for the chat AI
const SYSTEM_PROMPT = `You answer questions about a company handbook.
Rules:
- Use ONLY the numbered sources you are given. Do not use outside knowledge.
- After each fact, write the number of its source in square brackets, like [2].
- If the sources do not contain the answer, reply exactly: "${NOT_FOUND}"
- Keep the answer short.`;

// No chunking or embedding the handbook here: ingest.ts already saved it in the database.
console.log("Ready (pieces come from the database)");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
while (true) {
  const question = await rl.question("\nask > ");
  if (question === "exit") break;

  // 1. RETRIEVE: get the question's address, then ask the database for the 3 closest pieces
  const qRes = await ollama.embed({
    model: "nomic-embed-text",
    input: "search_query: " + question,
  });
  const questionVector = qRes.embeddings[0];

  const t2 = performance.now(); // ⏱️ time one database search
  const { rows: top3 } = await db.query(
    `SELECT content AS text,                          -- the piece's words
            chunk_index AS "index",                   -- its position in the file
            1 - (embedding <=> $1::vector) AS score   -- distance turned back into a closeness score
     FROM chunks
     ORDER BY embedding <=> $1::vector                -- closest first
     LIMIT 3`, // only the top 3
    [JSON.stringify(questionVector)], // fills $1 with the question's address
  );
  console.log(Math.round(performance.now() - t2), "ms to search"); // ⏱️ stop

  // Safety net 1: nothing close enough, so don't even ask the chat AI
  if (top3.length === 0 || top3[0].score < MIN_SCORE) {
    console.log(NOT_FOUND);
    continue;
  }

  // 2. AUGMENT: number the pieces and build the two messages
  const sources = top3.map((r, i) => `[${i + 1}] ${r.text}`).join("\n\n");
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
    stream: true,
    options: { temperature: 0.2 },
  });
  for await (const part of stream) {
    process.stdout.write(part.message.content);
  }
  console.log();

  // Sources list under the answer
  console.log("\nSources:");
  top3.forEach((r, i) => {
    const preview = r.text.slice(0, 80).replace(/\n/g, " ");
    console.log(
      `[${i + 1}] chunk ${r.index} (${r.score.toFixed(2)}): ${preview}...`,
    );
  });
}
rl.close();
await db.end(); // hang up the database connection
