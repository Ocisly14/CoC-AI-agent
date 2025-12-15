/**
 * Shared text utilities for RAG ingestion and retrieval.
 */

export function preprocessText(content: string): string {
  if (!content || typeof content !== "string") return "";

  return (
    content
      // Remove fenced code blocks
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code
      .replace(/`.*?`/g, "")
      // Strip markdown headers
      .replace(/#{1,6}\s*(.*)/g, "$1")
      // Strip images but keep alt text
      .replace(/!\[(.*?)\]\(.*?\)/g, "$1")
      // Strip links but keep text
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      // Simplify URLs
      .replace(/(https?:\/\/)?(www\.)?([^\s]+\.[^\s]+)/g, "$3")
      // Strip html/discord mentions
      .replace(/<@[!&]?\d+>/g, "")
      .replace(/<[^>]*>/g, "")
      // Strip comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .toLowerCase()
  );
}

export function splitText(
  content: string,
  chunkSize = 200,
  bleed = 20
): string[] {
  if (!content) return [];

  const chunkChars = chunkSize * 4; // rough token->char approximation
  const bleedChars = bleed * 4;

  if (content.length <= chunkChars) return [content];

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkChars, content.length);
    chunks.push(content.slice(start, end));

    const nextStart = start + (chunkChars - bleedChars);
    if (nextStart <= start) break;
    start = nextStart;
  }

  return chunks;
}
