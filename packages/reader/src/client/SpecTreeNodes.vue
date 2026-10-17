<script setup>
// One level of the spec tree. The spec in focus also lists its requirements.
import SpecTreeNodes from './SpecTreeNodes.vue';

defineProps({
  nodes: { type: Array, required: true },
  base: { type: String, required: true },
  current: { type: String, default: '' },
  reqs: { type: Array, default: () => [] },
});
</script>

<template>
  <ul class="st-tree">
    <li v-for="n in nodes" :key="n.path">
      <a
        :href="`${base}${n.path}/`"
        :class="{ active: n.path === current, folder: !n.cap, open: current.startsWith(`${n.path}/`) }"
      >{{ n.name }}</a>
      <ul v-if="n.path === current && reqs.length" class="st-tree-reqs">
        <li v-for="[slug, name] in reqs" :key="slug"><a :href="`#${slug}`">{{ name }}</a></li>
      </ul>
      <SpecTreeNodes v-if="n.children.length" :nodes="n.children" :base="base" :current="current" :reqs="reqs" />
    </li>
  </ul>
</template>
