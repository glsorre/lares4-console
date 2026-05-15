import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { initI18nSync } from '../../src/i18n/index.js';

if (!('window' in globalThis) || globalThis.window === undefined) {
  GlobalRegistrator.register();
}

initI18nSync('en');

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

if (!('DOMRect' in globalThis)) {
  class DOMRectStub {
    x = 0; y = 0; width = 0; height = 0;
    top = 0; left = 0; right = 0; bottom = 0;
    toJSON() { return {}; }
  }
  (globalThis as unknown as { DOMRect: unknown }).DOMRect = DOMRectStub;
}
