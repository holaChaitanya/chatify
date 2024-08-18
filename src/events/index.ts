type EventHandler = (...args: any[]) => void;

export class EventEmitter {
  private events: { [key: string]: EventHandler[] } = {};

  on(event: string, handler: EventHandler): void {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(handler);
  }

  off(event: string, handler: EventHandler): void {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(h => h !== handler);
  }

  emit(event: string, ...args: any[]): void {
    if (!this.events[event]) return;
    this.events[event].forEach(handler => handler(...args));
  }

  removeAllListeners(event?: string): void {
    if (event) {
      if (this.events[event]) {
        this.events[event] = [];
      }
    } else {
      for (const key in this.events) {
        if (Object.prototype.hasOwnProperty.call(this.events, key)) {
          this.events[key] = [];
        }
      }
    }
  }
}