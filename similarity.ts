// this function calculates the cosine similarity between two vectors.
// About 1 = same meaning, 0.5-0.7 related, about 0 = unrelated.
export function cosineSimilarity(a: number[], b: number[]): number {
  let together = 0; // how much the two arrows point the same way
  let sizeA = 0;    // how long arrow a is
  let sizeB = 0;    // how long arrow b is
  for (let i = 0; i < a.length; i++) {
    together += a[i] * b[i];
    sizeA += a[i] * a[i];
    sizeB += b[i] * b[i];
  }
  // divide out the lengths, so only the DIRECTION counts
  return together / (Math.sqrt(sizeA) * Math.sqrt(sizeB));
}