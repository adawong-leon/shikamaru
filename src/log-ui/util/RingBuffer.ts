export class RingBuffer<T extends object & { id: number }> {
  private buf: T[] = [];
  private head = 0;
  private count = 0;
  public nextId = 1;

  constructor(private readonly capacity: number) {}

  push(rec: Omit<T, "id"> & Partial<Pick<T, "id">>) {
    const withId = { id: (rec as any).id ?? this.nextId++, ...(rec as object) } as T;
    if (this.count < this.capacity) {
      this.buf[(this.head + this.count) % this.capacity] = withId;
      this.count++;
    } else {
      this.buf[this.head] = withId;
      this.head = (this.head + 1) % this.capacity;
    }
  }

  forEach(fn: (rec: T) => void) {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      fn(this.buf[idx]);
    }
  }

  forEachFromId(startId: number, fn: (rec: T) => void) {
    this.forEach((rec) => {
      if ((rec as any).id >= startId) fn(rec);
    });
  }
}
