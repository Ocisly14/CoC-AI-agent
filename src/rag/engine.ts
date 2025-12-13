import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { EmbeddingClient } from "./embedding.js";
import { KnowledgeStore, type KnowledgeRecord } from "./knowledgeStore.js";
import { preprocessText, splitText } from "./text.js";
import type { CoCDatabase } from "../coc_multiagents_system/agents/memory/database/schema.js";
import { ModelProviderName } from "../models/types.js";
import { RagDatabaseAdapter } from "./databaseAdapter.js";

export type KnowledgeHit = KnowledgeRecord & { similarity: number };

export class RAGEngine {
  private store: KnowledgeStore;
  private embedder: EmbeddingClient;
  private adapter: RagDatabaseAdapter;
  private knowledgeDir: string;
  private readonly defaultThreshold = 0.85;

  constructor(db: CoCDatabase, knowledgeDir?: string) {
    this.store = new KnowledgeStore(db);
    this.embedder = new EmbeddingClient(ModelProviderName.OPENAI);
    this.adapter = new RagDatabaseAdapter(db);
    this.knowledgeDir =
      knowledgeDir || path.join(process.cwd(), "data", "knowledge");
  }

  /**
   * Ingest all supported documents under a directory (recursively).
   */
  async ingestFromDirectory(): Promise<void> {
    if (!fs.existsSync(this.knowledgeDir)) {
      fs.mkdirSync(this.knowledgeDir, { recursive: true });
      return;
    }

    const files = this.walkFiles(this.knowledgeDir).filter((file) =>
      [".txt", ".md", ".pdf", ".docx"].includes(path.extname(file).toLowerCase())
    );

    for (const filePath of files) {
      await this.processFile(filePath);
    }

  }

  private walkFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.walkFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    return files;
  }

  private async processFile(filePath: string) {
    const raw = await this.readFile(filePath);
    const preprocessed = preprocessText(raw);
    const chunks = splitText(preprocessed, 512, 20);

    const relative = path.relative(this.knowledgeDir, filePath);
    this.store.removeBySource(relative);

    for (const [index, chunk] of chunks.entries()) {
      const embedding = await this.embedder.embed(chunk);
      const record: KnowledgeRecord = {
        id: `${relative}::${index}`,
        source: relative,
        text: chunk,
        embedding,
        chunkIndex: index,
        metadata: { type: path.extname(filePath).replace(".", "") },
      };
      this.store.upsert(record);
      await this.adapter.createKnowledge(record);
    }
  }

  private async readFile(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const buffer = fs.readFileSync(filePath);

    if (ext === ".pdf") {
      const data = await pdfParse(buffer);
      return data.text || "";
    }

    if (ext === ".docx") {
      const data = await mammoth.extractRawText({ buffer });
      return data.value || "";
    }

    return buffer.toString("utf8");
  }

  async search(query: string, context?: string, limit = 6): Promise<KnowledgeHit[]> {
    const normalizedQuery = preprocessText(
      `${context ? `${context} ` : ""}${query || ""}`
    );
    if (!normalizedQuery) return [];

    const queryEmbedding = await this.embedder.embed(normalizedQuery);
    const queryTerms = this.getQueryTerms(normalizedQuery);
    const prefiltered = await this.adapter.searchKnowledge({
      embedding: queryEmbedding,
      match_threshold: this.defaultThreshold,
      match_count: (limit || 6) * 2,
    });

    // Rerank with lexical/proximity boosts
    const scored = prefiltered
      .map((hit) => {
        let score = hit.similarity;

        const matchingTerms = queryTerms.filter((term) =>
          hit.text.includes(term)
        );

        if (matchingTerms.length > 0) {
          score *= 1 + (matchingTerms.length / queryTerms.length) * 2;
          if (this.hasProximityMatch(hit.text, matchingTerms)) {
            score *= 1.5;
          }
        } else if (!context) {
          score *= 0.3;
        }

        return {
          ...hit,
          similarity: hit.similarity,
          score,
        };
      })
      .filter((hit) => hit.score >= this.defaultThreshold);

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((hit) => ({ ...hit, similarity: hit.score }));
  }

  formatHits(hits: KnowledgeHit[]): string {
    if (!hits.length) return "No matching knowledge.";
    return hits
      .map(
        (hit) =>
          `- (${hit.source} #${hit.chunkIndex ?? 0}) ${hit.text.slice(0, 320)}`
      )
      .join("\n");
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) return 0;
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  private getQueryTerms(query: string): string[] {
    const stopWords = new Set([
      "a",
      "an",
      "and",
      "are",
      "as",
      "at",
      "be",
      "by",
      "does",
      "for",
      "from",
      "had",
      "has",
      "have",
      "he",
      "her",
      "his",
      "how",
      "hey",
      "i",
      "in",
      "is",
      "it",
      "its",
      "of",
      "on",
      "or",
      "that",
      "the",
      "this",
      "to",
      "was",
      "what",
      "when",
      "where",
      "which",
      "who",
      "will",
      "with",
      "would",
      "there",
      "their",
      "they",
      "your",
      "you",
    ]);

    return query
      .toLowerCase()
      .split(" ")
      .filter((term) => term.length > 2)
      .filter((term) => !stopWords.has(term));
  }

  private hasProximityMatch(text: string, terms: string[]): boolean {
    if (!text || !terms.length) return false;

    const words = text.toLowerCase().split(" ").filter((w) => w.length > 0);

    const positions = terms
      .flatMap((term) =>
        words.reduce((acc: number[], word, idx) => {
          if (word.includes(term)) acc.push(idx);
          return acc;
        }, [])
      )
      .sort((a, b) => a - b);

    if (positions.length < 2) return false;

    for (let i = 0; i < positions.length - 1; i++) {
      if (Math.abs(positions[i] - positions[i + 1]) <= 5) {
        return true;
      }
    }

    return false;
  }
}
