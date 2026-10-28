/* =============================================================================
 *  LOCAL AI CHAT SERVER  (Node + Socket.IO + Ollama)
 * =============================================================================
 *
 *  WHAT THIS FILE DOES
 *  -------------------
 *  1. Serves index.html to the browser.
 *  2. Opens a live WebSocket-style connection (Socket.IO) with each browser tab.
 *  3. When the tab sends a question, it forwards the WHOLE conversation to a
 *     local AI model running in Ollama, and streams the answer back word-by-word.
 *
 *  AI GLOSSARY (read this once, then the comments below will make sense)
 *  ---------------------------------------------------------------------
 *  OLLAMA        A program that downloads and runs open-source LLMs on your own
 *                machine. It runs a local HTTP server (default
 *                http://localhost:11434). The `ollama` npm package is just a
 *                thin client that calls that server for you.
 *
 *  LLM           Large Language Model. A neural network that, given some text,
 *                predicts the next piece of text. That's all "chat" really is:
 *                predict the next token, append it, repeat.
 *
 *  MODEL TAG     "qwen3.5:9b" = model family "qwen3.5" (made by Alibaba),
 *                variant "9b" = ~9 billion parameters (the numbers learned in
 *                training). Bigger = smarter but slower and more RAM/VRAM.
 *                You download it once with:  ollama pull qwen3.5:9b
 *
 *  TOKEN         The unit an LLM reads/writes. Roughly ¾ of an English word
 *                ("unbelievable" might be 3 tokens: "un", "believ", "able").
 *                Speed, limits and cost are all measured in tokens.
 *
 *  INFERENCE /   Running the model to produce output (as opposed to training).
 *  GENERATION    "Generating" = the model spitting out tokens one at a time.
 *
 *  STATELESS     The model has NO memory between calls. If you want it to
 *                "remember" the conversation, YOU must send all previous
 *                messages every single time. That's what `history` is for.
 *
 *  MESSAGE /     Chat models take a list of messages, each with a ROLE:
 *  ROLE            - "system"    : hidden instructions that set behaviour/personality
 *                  - "user"      : what the human typed
 *                  - "assistant" : what the model replied previously
 *                  (there's also "tool" for function calling — not used here)
 *
 *  SYSTEM PROMPT The "system" message. The model treats it as the rules of the
 *                game. Change it to change the bot's personality.
 *
 *  CONTEXT       The max number of tokens the model can "see" at once (system
 *  WINDOW        + whole history + the answer it is writing). If history grows
 *                past it, the oldest stuff gets cut off. Ollama option: num_ctx.
 *
 *  STREAMING     Instead of waiting for the full answer, receive it in small
 *                pieces ("chunks") as each token is generated. Feels instant.
 *
 *  CHUNK         One piece of a streamed response. Usually 1 token of text,
 *                plus metadata. The LAST chunk has done: true and the stats.
 *
 *  THINKING /    Some models (qwen3.x, deepseek-r1, ...) can "reason out loud"
 *  REASONING     before answering. Ollama returns that separately in
 *                message.thinking, and the real answer in message.content.
 *                Better answers on hard questions, but slower.
 *
 *  TEMPERATURE   Randomness dial. 0 = always picks the most likely token
 *                (deterministic, robotic). ~0.7 = balanced. >1 = creative/chaotic.
 *
 *  num_predict   Max tokens the model is allowed to generate for ONE reply.
 *                It stops when it hits this, even mid-sentence. -1 = no limit.
 *
 *  eval_count    In the final chunk: how many tokens the model generated.
 *  prompt_eval_  In the final chunk: how many tokens of INPUT it had to read
 *  count         (system + history). Grows every turn because history grows.
 *
 *  TTFT          Time To First Token. Time from "send request" to "first piece
 *                of answer arrives". This is what users feel as lag. It
 *                includes model loading (first request is slow!) + reading the
 *                prompt + (if thinking is on) all the thinking time.
 *
 *  ABORT         Cancelling a running generation so the GPU/CPU stops working
 *                on an answer nobody will read.
 * ============================================================================= */

import { createServer } from "node:http"; // Node's built-in plain HTTP server
import { readFileSync } from "node:fs"; // read files from disk (synchronously)
import { Server } from "socket.io"; // real-time two-way browser <-> server messaging
import ollama, { type Message } from "ollama";
//     ^ default export: a ready-made client pointed at http://localhost:11434
//                  ^ `Message` is the TypeScript type { role, content, ... }

/* -----------------------------------------------------------------------------
 *  HTTP SERVER
 *  Any request (/, /favicon.ico, whatever) just gets index.html back.
 *  Socket.IO piggybacks on this same server/port for its live connection.
 * --------------------------------------------------------------------------- */
const httpServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(readFileSync("./index.html"));
});

// Attach Socket.IO to the HTTP server. Browser loads /socket.io/socket.io.js
// automatically from here.
const io = new Server(httpServer);

/* -----------------------------------------------------------------------------
 *  "connection" fires once per browser tab that connects.
 *  Everything declared inside this callback is PRIVATE to that one tab,
 *  so two tabs = two separate conversations.
 * --------------------------------------------------------------------------- */
io.on("connection", (socket) => {
  // ---------------------------------------------------------------------------
  //  CONVERSATION MEMORY for this tab.
  //  Because the model is STATELESS, we keep the full chat here and resend it
  //  on every question. It starts with just the SYSTEM PROMPT.
  // ---------------------------------------------------------------------------
  const history: Message[] = [
    { role: "system", content: "You are a helpful, concise assistant." },
  ];

  // ---------------------------------------------------------------------------
  //  Handle to the generation currently running (null when idle).
  //  We store it out here so the "disconnect" handler can reach it and cancel.
  //  The stream object Ollama gives back has an .abort() method.
  // ---------------------------------------------------------------------------
  let currentStream: { abort: () => void } | null = null;

  // ---------------------------------------------------------------------------
  //  FIX (double-send race): true from the moment a question arrives until its
  //  answer is fully done. Set SYNCHRONOUSLY at the very start of "ask", so a
  //  second question can't sneak in while we're still awaiting ollama.chat()
  //  (currentStream alone can't guard that, it's only set AFTER the await).
  // ---------------------------------------------------------------------------
  let busy = false;

  // ---------------------------------------------------------------------------
  //  FIX (abort gap): remembers that the tab is gone. If the tab closes while
  //  we're still waiting for ollama.chat() to return (model loading can take
  //  seconds on the first request), currentStream is still null so there's
  //  nothing to abort yet. The "ask" handler checks this flag right after the
  //  await and aborts the stream itself.
  // ---------------------------------------------------------------------------
  let disconnected = false;

  // ---------------------------------------------------------------------------
  //  Tab closed / refreshed / lost network  ->  stop the model.
  //  Without this, Ollama would keep burning GPU/CPU finishing an answer
  //  that nobody will ever see.
  //  ?. = "only call abort() if currentStream isn't null"
  // ---------------------------------------------------------------------------
  socket.on("disconnect", () => {
    console.log("\n❌ browser tab closed");
    disconnected = true; // covers the window before the stream exists
    currentStream?.abort(); // covers a stream that's already running
  });

  // ---------------------------------------------------------------------------
  //  "ask" = custom event the browser emits with the user's question text.
  // ---------------------------------------------------------------------------
  socket.on("ask", async (question: string) => {
    // FIX (double-send race): one generation at a time per tab.
    // Two at once would both push into the same `history` and the
    // user/assistant turns would get interleaved and scrambled.
    if (busy) {
      socket.emit(
        "busy",
        "Still answering the previous question, please wait.",
      );
      return;
    }
    busy = true;

    // performance.now() = high-precision milliseconds, used to measure TTFT
    const start = performance.now();
    let firstTokenAt = 0; // 0 means "no answer token received yet"

    // 1) Add the user's question to memory as a "user" ROLE message.
    //    Keep a reference to this exact object so we can remove it again
    //    if the answer never completes (see the catch block).
    const userMsg: Message = { role: "user", content: question };
    history.push(userMsg);

    // FIX (orphan user message): if the answer is aborted or errors out, take
    // the question back out of history. Otherwise the next turn would contain
    // two "user" messages in a row with no "assistant" reply between them,
    // which confuses the model (it may try to answer both, or the old one).
    const rollbackUserMsg = () => {
      if (history[history.length - 1] === userMsg) history.pop();
    };

    // Everything from here on is inside try/finally so `busy` is ALWAYS reset,
    // even if ollama.chat() itself throws (Ollama not running, model missing...).
    try {
      // 2) Call the model.
      //    ollama.chat() = the CHAT endpoint (POST /api/chat). It takes a list
      //    of role-tagged messages (vs ollama.generate() which takes one raw
      //    prompt string).
      //    With stream: true it returns an async iterator of CHUNKS instead of
      //    one finished answer. `await` here only waits for the connection to
      //    open, NOT for the whole answer.
      const stream = await ollama.chat({
        model: "qwen3.5:9b", // which downloaded model to run (must be pulled first)
        messages: history, // FULL conversation: system + every user/assistant turn
        think: false, // false = skip REASONING, answer directly (faster, lower TTFT).
        //               true  = model reasons first; chunks carry message.thinking
        //                       first, then message.content. Needs a bigger num_predict.
        stream: true, // give me tokens as they're generated, not all at the end
        options: {
          // "options" = low-level sampling / runtime knobs passed to the model
          temperature: 0.7, // randomness: 0 = deterministic, ~0.7 = natural, 1+ = wild
          num_predict: 2000, // hard cap on tokens generated for THIS reply
          //                    (thinking tokens count toward it too when think: true)
          // num_ctx: 8192,   // (optional) CONTEXT WINDOW size in tokens. Default is
          //                    smaller than many models support; raise it for long chats.
        },
      });
      currentStream = stream; // remember it so "disconnect" can abort it

      // FIX (abort gap): the tab may have closed WHILE we were awaiting above.
      // The disconnect handler couldn't abort (currentStream was still null),
      // so do it here. The for-await below will then throw AbortError and
      // land in the catch block like any other abort.
      if (disconnected) stream.abort();

      let fullReply = ""; // we glue all answer chunks together here for memory

      // -----------------------------------------------------------------------
      //  Read chunks one by one AS the model produces them.
      //  `part` looks roughly like:
      //    { model, created_at,
      //      message: { role: "assistant", content: "Hel", thinking?: "..." },
      //      done: false }
      //  The LAST chunk has done: true plus stats (eval_count, durations...).
      //  abort() makes this loop THROW an AbortError -> caught below.
      // -----------------------------------------------------------------------
      for await (const part of stream) {
        process.stdout.write("."); // DEBUG: one dot in the terminal per chunk

        // --- THINKING chunks (only appear when think: true) -------------------
        // The model's internal reasoning. We show it in the UI on a separate
        // "thinking" event, but NEVER save it to history — it would waste
        // CONTEXT WINDOW tokens and models aren't meant to see old reasoning.
        if (part.message.thinking) {
          socket.emit("thinking", part.message.thinking);
        }

        // --- ANSWER chunks ----------------------------------------------------
        if (part.message.content) {
          // TTFT: record the moment the first ANSWER token arrives
          // (not the first thinking token — the user is waiting for the answer).
          if (!firstTokenAt) firstTokenAt = performance.now();

          // Push this piece to the browser immediately (that's the "typing" effect)
          socket.emit("token", part.message.content);
          // ...and keep a copy so we can store the complete reply afterwards
          fullReply += part.message.content;
        }

        // --- FINAL chunk ------------------------------------------------------
        // done: true means generation finished (hit end-of-answer or num_predict).
        if (part.done) {
          socket.emit("done", {
            tokens: part.eval_count, // number of tokens the model GENERATED
            ttft: Math.round(firstTokenAt - start), // ms until first answer token
            // other useful stats on this chunk if you want them:
            //   part.prompt_eval_count -> input tokens read (grows each turn)
            //   part.eval_duration     -> generation time in NANOseconds
            //   tokens/sec = eval_count / (eval_duration / 1e9)
            //   part.load_duration     -> time spent loading model into memory
            //   part.done_reason       -> "stop" (finished) or "length" (hit num_predict)
          });
        }
      }

      // 3) Generation finished normally -> save the ANSWER (not the thinking)
      //    as an "assistant" ROLE message, so next question has full context.
      history.push({ role: "assistant", content: fullReply });
    } catch (err) {
      // FIX (orphan user message): answer never completed, so un-save the question.
      rollbackUserMsg();

      if (err instanceof Error && err.name === "AbortError") {
        // We cancelled it on purpose (tab closed) — not a real error.
        console.log("\n🛑 generation stopped");
      } else {
        // Real problem: Ollama not running, model not pulled, out of memory, etc.
        // Now also catches errors from ollama.chat() itself (before, those
        // were an unhandled promise rejection outside any try/catch).
        console.error("\nOllama error:", err);
        socket.emit("token", "\n[Error talking to the model]");
      }
    } finally {
      // Runs whether it succeeded, was aborted, or errored.
      currentStream = null; // no stream running
      busy = false; // ready for the next question
    }
  });
});

// Start listening. Open this URL in the browser.
httpServer.listen(3000, () => console.log("Open http://localhost:3000"));
