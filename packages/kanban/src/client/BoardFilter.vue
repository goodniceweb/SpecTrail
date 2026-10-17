<script setup>
// The filter of the Done column. The browser keeps the choice for each viewer.
import { onMounted, ref, watch } from 'vue';

const KEY = 'spectrail.board.done';
const MODES = [
  ['all', 'All'],
  ['month', 'Last month'],
  ['week', 'Last week'],
  ['hide', 'Hide'],
];
const DAYS = { month: 31, week: 7 };
const mode = ref('all');
const shown = ref(null);

function apply() {
  const board = document.querySelector('.st-board');
  if (!board) return;
  board.classList.toggle('st-hide-done', mode.value === 'hide');
  const cutoff = DAYS[mode.value]
    ? new Date(Date.now() - DAYS[mode.value] * 86400000).toISOString().slice(0, 10)
    : null;
  const cards = board.querySelectorAll('.st-kcol-done .st-kcard');
  let n = 0;
  for (const card of cards) {
    const old = !!cutoff && !!card.dataset.date && card.dataset.date < cutoff;
    card.classList.toggle('st-kold', old);
    if (!old) n += 1;
  }
  const count = board.querySelector('.st-kcol-done .st-kcount');
  if (count) count.textContent = n === cards.length ? String(n) : `${n} of ${cards.length}`;
  shown.value = n;
}

onMounted(() => {
  try {
    const saved = localStorage.getItem(KEY);
    if (MODES.some(([m]) => m === saved)) mode.value = saved;
  } catch {
    // No storage (private window): keep the default.
  }
  apply();
});

watch(mode, () => {
  try {
    localStorage.setItem(KEY, mode.value);
  } catch {
    // No storage: the choice lasts until the page closes.
  }
  apply();
});
</script>

<template>
  <div class="st-kfilter">
    <span class="st-kfilter-label">Done column:</span>
    <button
      v-for="[id, label] in MODES"
      :key="id"
      type="button"
      :class="{ active: mode === id }"
      @click="mode = id"
    >{{ label }}</button>
  </div>
</template>
