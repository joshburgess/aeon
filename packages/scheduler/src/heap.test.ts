import { describe, expect, it } from "vitest"
import { BinaryHeap } from "./heap.js"

describe("BinaryHeap", () => {
  it("inserts and extracts in priority order", () => {
    const heap = new BinaryHeap<string>()
    heap.insert("c", 30)
    heap.insert("a", 10)
    heap.insert("b", 20)

    expect(heap.extractMin()?.value).toBe("a")
    expect(heap.extractMin()?.value).toBe("b")
    expect(heap.extractMin()?.value).toBe("c")
    expect(heap.extractMin()).toBeUndefined()
  })

  it("peek returns min without removing", () => {
    const heap = new BinaryHeap<number>()
    heap.insert(3, 30)
    heap.insert(1, 10)
    heap.insert(2, 20)

    expect(heap.peek()?.value).toBe(1)
    expect(heap.size).toBe(3)
  })

  it("remove deletes a specific entry", () => {
    const heap = new BinaryHeap<string>()
    heap.insert("a", 10)
    const b = heap.insert("b", 20)
    heap.insert("c", 30)

    expect(heap.remove(b)).toBe(true)
    expect(heap.size).toBe(2)
    expect(heap.extractMin()?.value).toBe("a")
    expect(heap.extractMin()?.value).toBe("c")
  })

  it("breaks ties on duplicate priorities in FIFO insertion order", () => {
    const heap = new BinaryHeap<string>()
    heap.insert("a", 10)
    heap.insert("b", 10)
    heap.insert("c", 10)

    expect(heap.extractMin()?.value).toBe("a")
    expect(heap.extractMin()?.value).toBe("b")
    expect(heap.extractMin()?.value).toBe("c")
  })

  it("preserves FIFO order across interleaved same-priority inserts", () => {
    const heap = new BinaryHeap<string>()
    heap.insert("a1", 10)
    heap.insert("b1", 20)
    heap.insert("a2", 10)
    heap.insert("b2", 20)
    heap.insert("a3", 10)

    const order: string[] = []
    while (heap.size > 0) order.push(heap.extractMin()!.value)
    expect(order).toEqual(["a1", "a2", "a3", "b1", "b2"])
  })

  it("preserves FIFO order after remove of a middle same-priority entry", () => {
    const heap = new BinaryHeap<string>()
    heap.insert("a", 10)
    const b = heap.insert("b", 10)
    heap.insert("c", 10)
    heap.insert("d", 10)

    expect(heap.remove(b)).toBe(true)
    const order: string[] = []
    while (heap.size > 0) order.push(heap.extractMin()!.value)
    expect(order).toEqual(["a", "c", "d"])
  })

  it("maintains heap property after many operations", () => {
    const heap = new BinaryHeap<number>()
    const values = [50, 30, 70, 10, 90, 20, 60, 40, 80]
    for (const v of values) {
      heap.insert(v, v)
    }

    const extracted: number[] = []
    while (heap.size > 0) {
      extracted.push(heap.extractMin()!.value)
    }
    expect(extracted).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90])
  })

  it("handles remove of first element", () => {
    const heap = new BinaryHeap<number>()
    const a = heap.insert(1, 10)
    heap.insert(2, 20)
    heap.insert(3, 30)

    heap.remove(a)
    expect(heap.extractMin()?.value).toBe(2)
    expect(heap.extractMin()?.value).toBe(3)
  })

  it("handles remove of last element", () => {
    const heap = new BinaryHeap<number>()
    heap.insert(1, 10)
    heap.insert(2, 20)
    const c = heap.insert(3, 30)

    heap.remove(c)
    expect(heap.size).toBe(2)
    expect(heap.extractMin()?.value).toBe(1)
    expect(heap.extractMin()?.value).toBe(2)
  })

  it("stress test: 10k random inserts and extracts", () => {
    const heap = new BinaryHeap<number>()
    const n = 10_000
    const priorities: number[] = []

    for (let i = 0; i < n; i++) {
      const p = Math.random() * 1_000_000
      priorities.push(p)
      heap.insert(i, p)
    }

    priorities.sort((a, b) => a - b)
    for (let i = 0; i < n; i++) {
      const entry = heap.extractMin()!
      expect(entry.priority).toBe(priorities[i])
    }
  })
})
