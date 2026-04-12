import type { Disposable } from "aeon-types";

/** A no-op disposable. */
export const disposeNone: Disposable = { dispose() {} };

/** Create a Disposable from a function. */
export const disposable = (f: () => void): Disposable => ({ dispose: f });

/** Dispose all disposables in an array. */
export const disposeAll = (disposables: Disposable[]): Disposable => ({
  dispose() {
    for (let i = disposables.length - 1; i >= 0; i--) {
      disposables[i]!.dispose();
    }
  },
});

/** A settable disposable — allows replacing the inner disposable. */
export class SettableDisposable implements Disposable {
  private declare inner: Disposable | undefined;
  private declare disposed: boolean;

  constructor() {
    this.inner = undefined;
    this.disposed = false;
  }

  set(d: Disposable): void {
    if (this.disposed) {
      d.dispose();
    } else {
      this.inner = d;
    }
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      if (this.inner !== undefined) {
        this.inner.dispose();
      }
    }
  }
}
