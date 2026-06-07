import { TraceEvent, AppEvent } from '../types';

type EventCallback = (event: AppEvent) => void;

class EventBus {
  private listeners: Map<AppEvent['type'], EventCallback[]> = new Map();

  subscribe(type: AppEvent['type'], callback: EventCallback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)?.push(callback);
    return () => {
      const callbacks = this.listeners.get(type);
      if (callbacks) {
        this.listeners.set(type, callbacks.filter(cb => cb !== callback));
      }
    };
  }

  emit(event: AppEvent) {
    this.listeners.get(event.type)?.forEach(callback => callback(event));
  }
}

export const eventBus = new EventBus();
