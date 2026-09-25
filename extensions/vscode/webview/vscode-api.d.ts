interface VsCodeApi<State = unknown> {
  getState(): State | undefined;
  setState(state: State): State;
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi<State = unknown>(): VsCodeApi<State>;
