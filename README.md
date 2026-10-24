# DocMind – Lesson 1

A small TypeScript project that talks to a **local AI model** through [Ollama](https://ollama.com). Everything runs on your own computer: no API key, no cloud, no cost per message.

| File | What it does |
| --- | --- |
| `hello.ts` | One-shot test: asks the model a single question and prints the answer plus token stats. |
| `chat.ts` | Interactive terminal chatbot that remembers the whole conversation. Type `exit` to quit. |

---

## 1. Requirements

- **Node.js 20 or newer** (check with `node -v`). Get it at <https://nodejs.org>.
- **Ollama** (the program that runs the AI model locally).
- **Disk space:** about 6–7 GB for the model.
- **RAM:** 16 GB recommended for the 9B model (8 GB works only with a smaller model, see [Smaller PCs](#smaller-pcs--slow-machines)).
- A GPU is optional but makes it much faster (see [Hardware](#hardware-notes)).

## 2. Install Ollama

**macOS**
```bash
brew install ollama
```
or download the app from <https://ollama.com/download>.

**Windows**
Download and run the installer from <https://ollama.com/download>.

**Linux**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Verify it:
```bash
ollama --version
```

## 3. Start Ollama and download the model

Ollama must be **running in the background** whenever you use this project.
- The macOS/Windows desktop app starts the server automatically (look for the llama icon in the menu bar / system tray).
- Otherwise start it manually in a separate terminal and leave it open:
  ```bash
  ollama serve
  ```

Download the model this project uses (one time only, ~6 GB):
```bash
ollama pull qwen3.5:9b
```

Check it is installed:
```bash
ollama list
```

Optional quick test without any code:
```bash
ollama run qwen3.5:9b
```

## 4. Set up the project

From this folder:
```bash
npm install
```

## 5. Run it

Simple one-shot test:
```bash
npx tsx hello.ts
```

Interactive chat:
```bash
npx tsx chat.ts
```
You will see a `you >` prompt. Type a message and press Enter. After each reply it prints input tokens, output tokens and speed (tokens/sec). Type `exit` to quit.

---

## Using a different model

The model name is hard-coded as `"qwen3.5:9b"` in both `hello.ts` and `chat.ts`. To switch:

1. Pull another model: `ollama pull <model-name>` (browse them at <https://ollama.com/library>).
2. Replace `qwen3.5:9b` with that name in the `model:` field of both files.

### Smaller PCs / slow machines
If you have little RAM or no GPU, use a smaller model, for example:

| RAM | Suggested model size |
| --- | --- |
| 8 GB | 3–4B parameters (e.g. `qwen3:4b`, `llama3.2:3b`) |
| 16 GB | up to 9B (this project's default) |
| 32 GB+ | 14B–30B |

Check exact tags on the Ollama library page, as available models change.

## Hardware notes

- **Apple Silicon Macs (M1/M2/M3/M4):** work great out of the box, the GPU is used automatically.
- **NVIDIA GPU (Windows/Linux):** install up-to-date NVIDIA drivers; Ollama will use the GPU automatically. 8 GB+ VRAM is ideal for a 9B model.
- **AMD GPU:** supported on many cards, see the Ollama docs.
- **CPU only:** works on any PC, but responses are slow (a few tokens per second).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `fetch failed` / `ECONNREFUSED 127.0.0.1:11434` | Ollama is not running. Start the app or run `ollama serve`. |
| `model "qwen3.5:9b" not found` | Run `ollama pull qwen3.5:9b`. |
| Very slow replies or system freezes | Not enough RAM/VRAM. Use a smaller model. |
| `tsx: command not found` | Run `npm install` first, then use `npx tsx ...`. |
| Port 11434 already in use | Ollama is already running, so you don't need to start it again. |

## Tweakable settings (in `chat.ts`)

- `think` – `true` lets the model reason step by step before answering (slower, uses more tokens); `false` answers directly.
- `temperature` – `0.2` for accurate, repeatable answers; `0.8+` for creative output.
- `num_predict` – maximum number of tokens in a reply (about ¾ of a word each).
- The `system` message at the top of `history` sets the assistant's personality.
