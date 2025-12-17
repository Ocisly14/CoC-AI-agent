import type { CoCDatabase } from "../coc_multiagents_system/agents/memory/database/schema.js";
import type { KnowledgeRecord } from "./knowledgeStore.js";

type SearchParams = {
  embedding: number[];
  match_threshold?: number;
  match_count?: number;
};

export class RagDatabaseAdapter {
  private db;

  constructor(cocDB: CoCDatabase) {
    this.db = cocDB.getDatabase();
    this.ensureSchema();
  }

  private ensureSchema() {
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS rag_knowledge (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                text TEXT NOT NULL,
                metadata TEXT,
                embedding TEXT NOT NULL,
                chunk_index INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_rag_knowledge_source ON rag_knowledge(source);
        `);
  }

  async createKnowledge(record: KnowledgeRecord): Promise<void> {
    this.db
      .prepare(
        `
                INSERT OR REPLACE INTO rag_knowledge (
                    id, source, text, metadata, embedding, chunk_index, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
            `
      )
      .run(
        record.id,
        record.source,
        record.text,
        record.metadata ? JSON.stringify(record.metadata) : null,
        JSON.stringify(record.embedding),
        record.chunkIndex ?? null,
        record.createdAt ?? null
      );
  }

  async getKnowledge(): Promise<KnowledgeRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT id, source, text, metadata, embedding, chunk_index, created_at FROM rag_knowledge`
      )
      .all() as any[];

    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      text: row.text,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      embedding: JSON.parse(row.embedding) as number[],
      chunkIndex: row.chunk_index ?? undefined,
      createdAt: row.created_at ?? undefined,
    }));
  }

  async removeKnowledge(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM rag_knowledge WHERE id = ?`).run(id);
  }

  async clearKnowledge(): Promise<void> {
    this.db.prepare(`DELETE FROM rag_knowledge`).run();
  }

  /**
   * Vector similarity prefilter using brute-force cosine similarity,
   * mirroring senti-agent's databaseAdapter.searchKnowledge contract.
   */
  async searchKnowledge(params: SearchParams): Promise<
    Array<
      KnowledgeRecord & {
        similarity: number;
        score?: number;
      }
    >
  > {
    const { embedding, match_threshold = 0.6, match_count = 16 } = params;
    const all = await this.getKnowledge();

    const scored = all
      .map((record) => {
        const similarity = this.cosineSimilarity(embedding, record.embedding);
        return { ...record, similarity };
      })
      .filter((row) => row.similarity >= match_threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, match_count);

    return scored;
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
}
