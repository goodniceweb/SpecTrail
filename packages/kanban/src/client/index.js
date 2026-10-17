// Browser code of the kanban plugin. The core calls this from enhanceApp.
import BoardFilter from './BoardFilter.vue';

export default function enhanceApp({ app }) {
  app.component('StBoardFilter', BoardFilter);
}
