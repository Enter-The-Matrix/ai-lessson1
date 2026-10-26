import ollama, { type Message } from "ollama";
import * as readline from "node:readline/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
            
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

const history: Message[] = [
  {
    role: "system",
    content:
      "You are a helpful,and don't say no to anything if you know the answer,  concise assistant .",
  },
];

while (true) {
  const input = await rl.question(
    `${colors.cyan}${colors.bold}you > ${colors.reset}`,
  );
  if (input === "exit") break;

  // TODO 1: push the user's message onto history

  history.push({ role: "user", content: input });

  // TODO 2: call ollama.chat with model "qwen3.5:9b" and the WHOLE history

  const response = await ollama.chat({
    model: "qwen3.5:9b",

    messages: history,
    // keeps the whole history of the conversation which increases the context for the model
    // to generate more relevant responses but the token input will be higher and the response time will be slower

    think: false,
    // think: true: before answering, the model writes out its reasoning step by step, like scratch paper.
    // Ollama returns it separately in response.message.thinking
    // think: false: it skips the scratch paper and answers straight away.
    // Thinking spends more output tokens, meaning the full answer will be shorter and can be broken.
    options: {
      temperature: 0.7,
      // Temperature 0: the top option always wins. Same answer every time.
      // Low (0.1 to 0.3): mostly the top options. Consistent and safe.
      // Medium (0.4 to 0.6): a mix of top and lower options. Some variety.
      // High (0.7 to 1.0): more lower options. More variety, but also more mistakes.
      // Very high (1.1 to 2.0): mostly lower options. Lots of variety, but also lots of mistakes.
      // For DocMind use low (around 0.2), because you want accurate, repeatable answers from documents.
      // For stories, names and brainstorming use higher (0.8 to 1.2).

      num_predict: 2000,
      // It’s the number of tokens it can generate, not words.
      // A token is roughly 3/4 of a word.
      // num_predict: 20 is about 15 words
    },
  });

  // TODO 3: print the reply text

  console.log(
    `\n${colors.green}${colors.bold}AI > ${colors.reset}${colors.green}${response.message.content}${colors.reset}\n`,
  );

  // TODO 4: push the reply onto history (hint: response.message is already a Message)
  history.push(response.message);
  // TODO 5: print input and output tokens for this turn
  const seconds = response.eval_duration / 1_000_000_000;
  const tps = response.eval_count / seconds;

  console.log(
    `${colors.yellow}Input tokens: ${response.prompt_eval_count} | Output tokens: ${response.eval_count} | Speed: ${tps.toFixed(2)} tokens/sec | Done reason: ${response.done_reason} ${colors.reset}\n`,
  );
}
rl.close();
