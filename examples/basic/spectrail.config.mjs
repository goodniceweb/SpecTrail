// A small sample project: two specs, one active change, one idea, and a dictionary.
// The pen plugin is off: the sample has no .pen files.
// Run it from the repo root: `npm run example:dev`.
import { defineConfig, preset } from 'spectrail';

export default defineConfig({
  title: 'Todo app specs',
  repo: { url: 'https://github.com/goodniceweb/spectrail', ref: 'main' },
  plugins: preset({ pen: false }),
});
