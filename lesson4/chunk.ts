// Cuts the text into pieces of `size` characters.
// Each new piece starts `overlap` characters before the previous one ended,
// so a sentence cut at the edge of one piece is still whole in the next.

export function chunk(text: string, size = 500, overlap = 100): string[] {
  const chunks: string[] = []; // the pieces we collect
  const step = size - overlap; // how far to jump each time: 500 - 100 = 400

  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + size)); // e.g. 0 to 500, then 400 to 900
    if (start + size >= text.length) break; // reached the end, stop
  }

  return chunks;
}
