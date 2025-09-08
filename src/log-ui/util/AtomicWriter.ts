export class AtomicWriter {
  private q: Array<{ stream: NodeJS.WriteStream; chunks: string[] }> = [];
  private busy = false;

  enqueue(stream: NodeJS.WriteStream, chunks: string | string[]) {
    this.q.push({ stream, chunks: Array.isArray(chunks) ? chunks : [chunks] });
    queueMicrotask(() => this.drain());
  }

  private async writeOnce(stream: NodeJS.WriteStream, chunk: string) {
    await new Promise<void>((res) =>
      stream.write(chunk) ? res() : stream.once("drain", () => res())
    );
  }

  private async drain() {
    if (this.busy) return;
    this.busy = true;
    while (this.q.length) {
      const { stream, chunks } = this.q.shift()!;
      for (const c of chunks) await this.writeOnce(stream, c);
    }
    this.busy = false;
  }

  async flush() {
    while (this.q.length) await this.drain();
  }
}
