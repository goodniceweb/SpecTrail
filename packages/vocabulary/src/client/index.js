// Browser code of the vocabulary plugin. The core calls this from enhanceApp.
import VocabularyChecks from './VocabularyChecks.vue';

export default function enhanceApp({ app }) {
  app.component('StVocabularyChecks', VocabularyChecks);
}
