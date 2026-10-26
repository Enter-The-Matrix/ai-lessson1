// The Ollama client: lets our code talk to the models running on this Mac
import ollama from "ollama";
// Our closeness-score function (from similarity.ts)
import { cosineSimilarity } from "./similarity.ts";

// 4 test sentences: 0 and 1 mean the same thing with different words,
// 2 and 3 are about completely different topics
const sentences = [
  "The cat sat on the mat.",
  "A kitten is resting on a rug.",
  "Stock prices fell sharply today.",
  "How do I reset my password?",
];

// EMBED: send all 4 sentences to nomic-embed-text in ONE request.
// It sends back one address (embedding) per sentence, in the same order.
// res.embeddings[0] is the address of sentence 0, res.embeddings[1] of sentence 1, and so on.
const res = await ollama.embed({ model: "nomic-embed-text", input: sentences });

// How many addresses we got back (4), and how many numbers are in each address (768)
console.log(
  "vectors:",
  res.embeddings.length,
  "| numbers in each:",
  res.embeddings[0].length,
);

// A peek at the first 5 of the 768 numbers. They mean nothing by eye,
// they only matter when we compare two addresses.
console.log("first 5 numbers of sentence 0:", res.embeddings[0].slice(0, 5));

// Prints ALL 768 numbers (normal console.log stops after 100)
// console.log(JSON.stringify(res.embeddings[0]));

// TODO 4: COMPARE the address of sentence 0 (cat) with each of the others.
// Higher score = closer in meaning.
// Expect: kitten highest, stock prices and password lower.

// cat vs kitten: same meaning, different words, so this should be the HIGHEST
console.log(
  "similarity of sentence 0 with sentence 1:",
  cosineSimilarity(res.embeddings[0], res.embeddings[1]),
);
// cat vs stock prices: unrelated, so this should be lower
console.log(
  "similarity of sentence 0 with sentence 2:",
  cosineSimilarity(res.embeddings[0], res.embeddings[2]),
);
// cat vs password reset: unrelated, so this should be lower
console.log(
  "similarity of sentence 0 with sentence 3:",
  cosineSimilarity(res.embeddings[0], res.embeddings[3]),
);