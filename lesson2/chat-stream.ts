import ollama, { type Message } from "ollama";
import * as readline from "node:readline/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const history: Message[] = [
  { role: "system", content: "You are a helpful, concise assistant." },
];

while (true) {
  const input = await rl.question("you > ");
  if (input === "exit") break;

  // TODO 1: push the user's message onto history (same as before)
  history.push({ role: "user", content: input });

  // TODO 2: call ollama.chat with stream: true and the whole history
  const stream = await ollama.chat({
    model: "qwen3.5:9b",
    messages: history,
    think: false,
    stream: true,
    options: { temperature: 0.7, num_predict: 2000 },
  });

  // TODO 3: create an empty string, e.g. let fullReply = ""
  let fullReply = "";
  process.stdout.write("AI > ");

  // TODO 4: for await over the stream: print each piece AND add it to fullReply
  for await (const part of stream) {
    process.stdout.write(part.message.content);
    fullReply += part.message.content;

    // TODO 5: on the done chunk, print the token counts    if (part.done)
    if (part.done) {
      console.log(
        `\n(${part.prompt_eval_count} in | ${part.eval_count} out | ${part.done_reason})\n`,
      );
    }
  }

  // TODO 6: after the loop, push { role: "assistant", content: fullReply } onto history
  history.push({ role: "assistant", content: fullReply });
}
rl.close();
