// spectrail: all packages in one install.
import { kanban } from '@spectrail/kanban';
import { pen } from '@spectrail/pen';
import { reader } from '@spectrail/reader';
import { vocabulary } from '@spectrail/vocabulary';

export { defineConfig } from '@spectrail/core';
export { kanban, pen, reader, vocabulary };

// preset(options) -> all plugins. Give the options of one plugin under its
// name, or `false` to leave it out: preset({ pen: { uiSpecs: ['ui/**'] }, kanban: false }).
export function preset(options = {}) {
  const all = { reader, pen, vocabulary, kanban };
  return Object.entries(all)
    .filter(([name]) => options[name] !== false)
    .map(([name, make]) => make(options[name] || {}));
}
