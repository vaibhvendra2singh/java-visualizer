import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';

// Effect to trigger high-priority highlighted line update
export const setHighlightLine = StateEffect.define<number>();

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    // Map existing decorations through document changes
    decorations = decorations.map(tr.changes);
    
    for (const effect of tr.effects) {
      if (effect.is(setHighlightLine)) {
        const lineNum = effect.value;
        if (lineNum <= 0) {
          decorations = Decoration.none;
        } else {
          try {
            // Look up the start/end byte positions of the line
            const line = tr.state.doc.line(lineNum);
            const lineDecoration = Decoration.line({
              class: 'cm-highlight-line'
            });
            decorations = Decoration.set([lineDecoration.range(line.from)]);
          } catch (e) {
            // Line index might be out of range for the current doc state
            decorations = Decoration.none;
          }
        }
      }
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field)
});

export const lineHighlightExtension = [highlightField];
export { EditorView };
