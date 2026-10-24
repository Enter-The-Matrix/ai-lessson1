import ollama from "ollama";

const response = await ollama.chat({
  model: "qwen3.5:9b",
  messages: [
    { role: "system", content: "Answer like a little kid." },
    { role: "user", content: "Explain what a token is in one sentence." },
  ],
  think: false,
  options: { temperature: 0.2, num_predict: 300 },
});

console.log(response.message.content);
console.log("Thinking:", response.message.thinking);
console.log("done_reason:", response.done_reason);
console.log(
  "input tokens:",
  response.prompt_eval_count,
  "output tokens:",
  response.eval_count,
);
