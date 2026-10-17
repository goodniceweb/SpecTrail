<script setup>
// The two check buttons. Under `spectrail dev` they call the plugin API.
// A static build has no server: the panel then shows the OpenSpec result
// that the build wrote, and says that the buttons need `spectrail dev`.
import { computed, onMounted, ref } from 'vue';

const API = '/__spectrail/api/vocabulary/check';
const STATIC = '/vocabulary-data/openspec.json';
const SCOPES = { openspec: 'the OpenSpec files', repo: 'the whole repo' };

const result = ref(null);
const source = ref(null); // 'live' | 'build'
const busy = ref(null);
const message = ref('');
const view = ref('hard'); // 'hard' | 'contextual'

async function json(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error(String(res.status));
  return res.json();
}

async function check(scope) {
  busy.value = scope;
  message.value = '';
  try {
    result.value = await json(`${API}?scope=${scope}`);
    source.value = 'live';
  } catch {
    message.value = 'The check buttons work only under `spectrail dev`. This page shows the result from the last build.';
  } finally {
    busy.value = null;
  }
}

onMounted(async () => {
  try {
    result.value = await json(STATIC);
    source.value = 'build';
  } catch {
    // No build result yet.
  }
});

const ctxTotal = computed(() => (result.value?.contextual || []).reduce((n, w) => n + w.count, 0));

// The banned hits, grouped by file.
const byFile = computed(() => {
  const groups = new Map();
  for (const h of result.value?.hard || []) {
    if (!groups.has(h.file)) groups.set(h.file, []);
    groups.get(h.file).push(h);
  }
  return [...groups.entries()].map(([file, items]) => ({ file, items }));
});

const when = computed(() => (result.value?.at ? new Date(result.value.at).toLocaleString() : ''));
</script>

<template>
  <div class="st-vchecks">
    <div class="st-vbuttons">
      <button type="button" :disabled="!!busy" @click="check('openspec')">
        {{ busy === 'openspec' ? 'Checking…' : 'Check the OpenSpec files' }}
      </button>
      <button type="button" :disabled="!!busy" @click="check('repo')">
        {{ busy === 'repo' ? 'Checking…' : 'Check the whole repo' }}
      </button>
    </div>
    <p v-if="message" class="st-vmessage">{{ message }}</p>

    <template v-if="result && !result.error">
      <p class="st-vsummary">
        {{ SCOPES[result.scope] }}: {{ result.files }} files,
        <strong>{{ result.hard.length }} banned</strong>, {{ ctxTotal }} to check the sense.
        <span class="st-vwhen">{{ source === 'build' ? 'From the last build' : 'Checked' }}, {{ when }}.</span>
      </p>
      <div class="st-vtabs">
        <button type="button" :class="{ active: view === 'hard' }" @click="view = 'hard'">Banned ({{ result.hard.length }})</button>
        <button type="button" :class="{ active: view === 'contextual' }" @click="view = 'contextual'">Check the sense ({{ ctxTotal }})</button>
      </div>

      <div v-if="view === 'hard'" class="st-vresults">
        <p v-if="!byFile.length" class="st-vnone">No banned words.</p>
        <details v-for="g in byFile" :key="g.file" open class="st-vgroup">
          <summary><code>{{ g.file }}</code> <span class="st-vcount">{{ g.items.length }}</span></summary>
          <ul>
            <li v-for="h in g.items" :key="`${h.line}:${h.col}`">
              <a v-if="h.url" :href="h.url" target="_blank" rel="noreferrer" class="st-vline">L{{ h.line }}</a>
              <span v-else class="st-vline">L{{ h.line }}</span>
              <span class="st-vexcerpt">{{ h.excerpt.before }}<mark>{{ h.excerpt.match }}</mark>{{ h.excerpt.after }}</span>
              <span v-if="h.instead.length" class="st-vinstead">→ {{ h.instead.join(' / ') }}</span>
            </li>
          </ul>
        </details>
      </div>

      <div v-else class="st-vresults">
        <p class="st-vhint">These words are banned in one sense only. Open a word to see where it occurs, and check the sense of each case.</p>
        <details v-for="w in result.contextual" :key="w.word" class="st-vgroup">
          <summary>
            <strong>{{ w.word }}</strong> <span class="st-vcount">{{ w.count }}</span>
            <span class="st-vlimit">{{ w.limits.join('; ') }}</span>
          </summary>
          <ul>
            <li v-for="h in w.items" :key="`${h.file}:${h.line}:${h.col}`">
              <a v-if="h.url" :href="h.url" target="_blank" rel="noreferrer" class="st-vline">{{ h.file }}:{{ h.line }}</a>
              <span v-else class="st-vline">{{ h.file }}:{{ h.line }}</span>
              <span class="st-vexcerpt">{{ h.excerpt.before }}<mark>{{ h.excerpt.match }}</mark>{{ h.excerpt.after }}</span>
            </li>
            <li v-if="w.count > w.items.length" class="st-vmore">… and {{ w.count - w.items.length }} more</li>
          </ul>
        </details>
      </div>
    </template>
    <p v-else-if="result && result.error" class="st-vmessage">{{ result.error }}</p>
  </div>
</template>
