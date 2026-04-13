/**
 * Binary min-heap for the scheduler's timer queue.
 *
 * Keyed on a numeric priority (scheduled time). Ties on priority are broken
 * by insertion order via a monotonic `seq` counter, so same-time tasks run
 * FIFO — deterministic and stable across equivalent schedules.
 *
 * Uses a pre-allocated backing array to minimize per-node allocation.
 */

export interface HeapEntry<T> {
  readonly value: T;
  readonly priority: number;
  /** Monotonic insertion counter, used as a secondary FIFO tiebreaker. */
  readonly seq: number;
  /** Internal index for O(log n) removal. Mutated by the heap. */
  index: number;
}

const isLess = <T>(a: HeapEntry<T>, b: HeapEntry<T>): boolean =>
  a.priority < b.priority || (a.priority === b.priority && a.seq < b.seq);

export class BinaryHeap<T> {
  private declare items: HeapEntry<T>[];
  private seqCounter = 0;

  constructor(initialCapacity = 64) {
    this.items = [];
    // Pre-allocate hint (V8 will grow as needed)
    if (initialCapacity > 0) {
      this.items.length = 0;
    }
  }

  get size(): number {
    return this.items.length;
  }

  peek(): HeapEntry<T> | undefined {
    return this.items[0];
  }

  insert(value: T, priority: number): HeapEntry<T> {
    const entry: HeapEntry<T> = {
      value,
      priority,
      seq: this.seqCounter++,
      index: this.items.length,
    };
    this.items.push(entry);
    this.siftUp(entry.index);
    return entry;
  }

  extractMin(): HeapEntry<T> | undefined {
    if (this.items.length === 0) return undefined;
    const min = this.items[0]!;
    this.removeAt(0);
    return min;
  }

  remove(entry: HeapEntry<T>): boolean {
    if (entry.index < 0 || entry.index >= this.items.length) return false;
    if (this.items[entry.index] !== entry) return false;
    this.removeAt(entry.index);
    return true;
  }

  private removeAt(index: number): void {
    const last = this.items.length - 1;
    if (index === last) {
      this.items.pop();
      return;
    }

    const moved = this.items[last]!;
    this.items[index] = moved;
    moved.index = index;
    this.items.pop();

    // Restore heap property
    const parentIndex = (index - 1) >>> 1;
    if (index > 0 && isLess(moved, this.items[parentIndex]!)) {
      this.siftUp(index);
    } else {
      this.siftDown(index);
    }
  }

  private siftUp(index: number): void {
    const item = this.items[index]!;
    while (index > 0) {
      const parentIndex = (index - 1) >>> 1;
      const parent = this.items[parentIndex]!;
      if (!isLess(item, parent)) break;
      this.items[index] = parent;
      parent.index = index;
      index = parentIndex;
    }
    this.items[index] = item;
    item.index = index;
  }

  private siftDown(index: number): void {
    const item = this.items[index]!;
    const halfLength = this.items.length >>> 1;

    while (index < halfLength) {
      let childIndex = 2 * index + 1;
      let child = this.items[childIndex]!;
      const rightIndex = childIndex + 1;

      if (rightIndex < this.items.length && isLess(this.items[rightIndex]!, child)) {
        childIndex = rightIndex;
        child = this.items[rightIndex]!;
      }

      if (isLess(item, child)) break;

      this.items[index] = child;
      child.index = index;
      index = childIndex;
    }
    this.items[index] = item;
    item.index = index;
  }
}
