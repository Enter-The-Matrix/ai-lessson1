import ollama from "ollama";

const start = performance.now();
let firstTokenAt = 0;

const stream = await ollama.chat({
  model: "qwen3.5:9b",
  messages: [{ role: "user", content: "Explain how a CPU works in 5 sentences." }],
  think: false,
  stream: true, // <- the only change to the request
});

for await (const part of stream) {
  if (!firstTokenAt) firstTokenAt = performance.now();
  process.stdout.write(part.message.content); // write, not log: no new line per token

  if (part.done) {
    console.log(`\n\nTTFT: ${(firstTokenAt - start).toFixed(0)} ms`);
    console.log(`Total: ${(performance.now() - start).toFixed(0)} ms`);
    console.log(`Output tokens: ${part.eval_count} | Done reason: ${part.done_reason}`);
  }
}