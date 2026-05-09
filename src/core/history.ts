export class CommandHistory {
  private readonly items: string[] = [];
  private cursor = 0;

  add(command: string): void {
    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }
    if (this.items[this.items.length - 1] !== trimmed) {
      this.items.push(trimmed);
    }
    this.cursor = this.items.length;
  }

  previous(prefix: string): string | undefined {
    for (let i = this.cursor - 1; i >= 0; i -= 1) {
      if (!prefix || this.items[i].startsWith(prefix)) {
        this.cursor = i;
        return this.items[i];
      }
    }
    return undefined;
  }

  next(prefix: string): string | undefined {
    for (let i = this.cursor + 1; i < this.items.length; i += 1) {
      if (!prefix || this.items[i].startsWith(prefix)) {
        this.cursor = i;
        return this.items[i];
      }
    }
    this.cursor = this.items.length;
    return '';
  }
}
