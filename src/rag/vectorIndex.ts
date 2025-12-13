/**
 * Lightweight HNSW vector index wrapper with graceful fallback.
 * Uses hnswlib-node when available; otherwise stays disabled.
 */
export class VectorIndex {
  private index: any | null = null;
  private dim = 0;
  private maxElements = 1024;
  private initialized = false;
  private failed = false;
  private idToLabel = new Map<string, number>();
  private labelToId = new Map<number, string>();

  async init(dim: number): Promise<void> {
    if (this.failed) return;
    if (this.initialized && this.dim === dim) return;

    try {
      const mod: any = await import("hnswlib-node");
      const HierarchicalNSW =
        mod.HierarchicalNSW ?? mod.default?.HierarchicalNSW;
      if (!HierarchicalNSW) {
        throw new Error("hnswlib-node missing HierarchicalNSW");
      }

      this.dim = dim;
      this.index = new HierarchicalNSW("cosine", dim);
      this.index.initIndex(this.maxElements);
      this.initialized = true;
      this.idToLabel.clear();
      this.labelToId.clear();
    } catch (error) {
      console.warn("[RAG] Vector index disabled (hnswlib-node not available)", error);
      this.failed = true;
    }
  }

  isReady(): boolean {
    return this.initialized && !!this.index && !this.failed;
  }

  reset(): void {
    this.index = null;
    this.initialized = false;
    this.failed = false;
    this.idToLabel.clear();
    this.labelToId.clear();
  }

  add(id: string, vector: number[]): void {
    if (!this.isReady()) return;
    if (vector.length !== this.dim) return;

    const label = this.idToLabel.get(id) ?? this.idToLabel.size;
    if (label >= this.maxElements) {
      this.maxElements = Math.max(this.maxElements * 2, label + 1);
      this.index.resizeIndex(this.maxElements);
    }

    this.idToLabel.set(id, label);
    this.labelToId.set(label, id);
    this.index.addPoint(vector, label);
  }

  search(vector: number[], k = 10): Array<{ id: string; similarity: number }> | null {
    if (!this.isReady() || vector.length !== this.dim) return null;
    try {
      const result = this.index.searchKnn(vector, k);
      const labels: number[] = result.neighbors ?? result;
      const distances: number[] = result.distances ?? [];

      return labels.map((label, idx) => ({
        id: this.labelToId.get(label) ?? String(label),
        similarity: distances[idx] !== undefined ? 1 - distances[idx] : 0,
      }));
    } catch (error) {
      console.warn("[RAG] Vector index search failed, falling back", error);
      return null;
    }
  }
}
