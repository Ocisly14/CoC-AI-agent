import type { CoCDatabase } from "../coc_multiagents_system/agents/memory/database/schema.js";

export type KnowledgeRecord = {
  id: string;
  source: string;
  text: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
  chunkIndex?: number;
  createdAt?: string;
};

type Row = {
  id: string;
  source: string;
  text: string;
  metadata: string | null;
  embedding: string;
  chunk_index: number | null;
  created_at: string;
};

export class KnowledgeStore {
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

  upsert(record: KnowledgeRecord): void {
    const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO rag_knowledge (id, source, text, metadata, embedding, chunk_index, created_at)
            VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        `);

    stmt.run(
      record.id,
      record.source,
      record.text,
      record.metadata ? JSON.stringify(record.metadata) : null,
      JSON.stringify(record.embedding),
      record.chunkIndex ?? null,
      record.createdAt ?? null
    );
  }

  removeBySource(source: string): void {
    this.db.prepare(`DELETE FROM rag_knowledge WHERE source = ?`).run(source);
  }

  listAll(): KnowledgeRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, source, text, metadata, embedding, chunk_index, created_at FROM rag_knowledge`
      )
      .all() as Row[];

    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      text: row.text,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      embedding: JSON.parse(row.embedding) as number[],
      chunkIndex: row.chunk_index ?? undefined,
      createdAt: row.created_at,
    }));
  }

  /**
   * Check if a source already exists in the knowledge store
   */
  hasSource(source: string): boolean {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM rag_knowledge WHERE source = ?`)
      .get(source) as { count: number };
    return (row?.count ?? 0) > 0;
  }

  /**
   * Get the latest processing time for a source (from metadata or created_at)
   */
  getSourceProcessedTime(source: string): Date | null {
    const row = this.db
      .prepare(
        `SELECT metadata, created_at FROM rag_knowledge WHERE source = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(source) as { metadata: string | null; created_at: string } | undefined;

    if (!row) return null;

    // Try to get file mtime from metadata first
    if (row.metadata) {
      try {
        const metadata = JSON.parse(row.metadata) as Record<string, unknown>;
        if (metadata.fileMtime && typeof metadata.fileMtime === "string") {
          return new Date(metadata.fileMtime);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Fall back to created_at
    return row.created_at ? new Date(row.created_at) : null;
  }
}
