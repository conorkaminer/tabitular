// Keep independent snapshots so later edits cannot mutate undo/redo entries.
export class EditHistory {
  constructor(limit = 100) { this.limit = limit; this.reset(); }
  reset(state = null) {
    this.past = []; this.future = [];
    this.current = state === null ? null : structuredClone(state);
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  record(state) {
    if (this.current === null) { this.reset(state); return; }
    if (JSON.stringify(state.draft) === JSON.stringify(this.current.draft) &&
        JSON.stringify(state.bankChoices) === JSON.stringify(this.current.bankChoices)) return;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = structuredClone(state);
    this.future = [];
  }
  undo() {
    if (!this.canUndo) return null;
    this.future.push(this.current);
    this.current = this.past.pop();
    return structuredClone(this.current);
  }
  redo() {
    if (!this.canRedo) return null;
    this.past.push(this.current);
    this.current = this.future.pop();
    return structuredClone(this.current);
  }
  context(state) {
    if (this.current) for (const key of ['selected', 'editMeasure', 'resolution', 'muted', 'solo', 'gains'])
      this.current[key] = structuredClone(state[key]);
  }
}
