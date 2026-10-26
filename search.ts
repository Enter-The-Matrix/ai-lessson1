import ollama from "ollama";
import { readFileSync } from "node:fs";
import * as readline from "node:readline/promises";
import { cosineSimilarity } from "./similarity.ts";

// Terminal colours (codes the terminal understands)
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

// Lowest score we still accept. Below it: "nothing relevant found".
// Found in experiment 2 (France ~0.4, quit question ~0.71). Re-check it if you
// change the model, the labels, or the chunk size.
const MIN_SCORE = 0.55;

const text = readFileSync("./handbook.txt", "utf8");

// TODO 1: cut the text into pieces of `size` characters.
// Each new piece starts `overlap` characters before the previous one ended,
// so a sentence cut at the edge of one piece is still whole in the next.
function chunk(text: string, size = 500, overlap = 100): string[] {
  const chunks: string[] = []; // the pieces we collect
  const step = size - overlap; // how far to jump each time: 500 - 100 = 400

  // start = where the current piece begins: 0, then 400, then 800, ...
  for (let start = 0; start < text.length; start += step) {
    // take `size` characters from `start`, e.g. 0 to 500, then 400 to 900
    // (slice is fine at the end: the last piece is just shorter)
    chunks.push(text.slice(start, start + size));

    // this piece already reached the end of the text, so stop
    // (otherwise we'd add one more tiny piece that only repeats the overlap)
    if (start + size >= text.length) break;
  }

  return chunks;
}

const chunks = chunk(text);
console.log(`Split into ${chunks.length} chunks`);

// TODO 2: get an address for every piece, all in one request (done ONCE at startup)
const t0 = performance.now(); // ⏱️ start the stopwatch
const res = await ollama.embed({
  model: "nomic-embed-text",
  // stick the "this is a page" label on the front of each piece
  input: chunks.map((c) => "search_document: " + c),
});
// chunkVectors[0] is the address of chunks[0], chunkVectors[1] of chunks[1], and so on
const chunkVectors = res.embeddings;
const embedMs = Math.round(performance.now() - t0); // ⏱️ stop
console.log(
  `${colors.cyan}Embedded ${chunkVectors.length} chunks in ${embedMs} ms${colors.reset}`,
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

while (true) {
  const question = await rl.question(
    `\n${colors.green}${colors.bold}search > ${colors.reset}`,
  );
  if (question === "exit") break;

  // TODO 3: get an address for the question, with the "this is a question" label
  const t1 = performance.now(); // ⏱️ time one search
  const qRes = await ollama.embed({
    model: "nomic-embed-text",
    input: "search_query: " + question,
  });
  // we sent only one text, so there's only one address: number 0
  const questionVector = qRes.embeddings[0];

  // TODO 4: score every piece against the question, keep the best 3
  const scored = chunks.map((text, i) => ({
    text, // the piece's words
    score: cosineSimilarity(questionVector, chunkVectors[i]), // how close it is to the question
  }));

  const top3 = scored
    .sort((a, b) => b.score - a.score) // highest score first
    .slice(0, 3); // keep only the first 3

  const searchMs = Math.round(performance.now() - t1); // ⏱️ stop
  console.log(`${colors.cyan}(search took ${searchMs} ms)${colors.reset}`);

  // Cut-off: even the best piece is too far away, so admit it
  if (top3[0].score < MIN_SCORE) {
    console.log(
      `${colors.yellow}Nothing relevant found (best score ${top3[0].score.toFixed(2)}).${colors.reset}`,
    );
    continue; // skip printing, go back to "search >"
  }

  // TODO 5: print each result's score (2 decimals) and its text
  for (const { text, score } of top3) {
    console.log(`\n${colors.red}Score:${colors.reset} ${score.toFixed(2)}`);
    console.log(`${colors.red}Text:${colors.reset} ${text}`);
  }
}
rl.close();
