<script setup>
// The spec tree in the right sidebar. It renders only on pages whose front
// matter has `stSpecTree: true` (the reader pages), which set `outline: false`.
import { computed } from 'vue';
import { useData } from 'vitepress';
import SpecTreeNodes from './SpecTreeNodes.vue';

const { theme, frontmatter } = useData();
const data = computed(() => theme.value.spectrail?.reader);
const show = computed(() => !!frontmatter.value.stSpecTree && !!data.value);
const current = computed(() => frontmatter.value.stSpec || '');
const reqs = computed(() => frontmatter.value.stReqs || []);
</script>

<template>
  <nav v-if="show" class="st-spec-tree" aria-label="Specs">
    <a class="st-tree-title" :class="{ active: current === '' }" :href="data.base">Specs</a>
    <SpecTreeNodes :nodes="data.tree" :base="data.base" :current="current" :reqs="reqs" />
  </nav>
</template>
