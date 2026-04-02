<template>
  <div class="p-4 space-y-4 text-sm">
    <h2 class="font-bold text-lg">프로퍼티 바인딩 생성기</h2>

    <div class="p-3 bg-gray-100 rounded border">
      <div v-if="component">
        <p class="text-blue-600 font-bold">대상: {{ component.name }}</p>
        <p class="text-xs text-gray-500">탐색된 프로퍼티: {{ component.properties?.length || 0 }}개</p>
      </div>
      <p v-else class="text-red-500 font-bold">
        텍스트 프로퍼티가 있는 요소를 선택해주세요.
      </p>
    </div>

    <div v-if="collections.length > 0" class="space-y-1">
      <label class="font-bold">1. 변수 콜렉션 선택</label>
      <select v-model="selectedCollectionId" class="w-full border p-2 rounded">
        <option disabled value="">콜렉션을 선택하세요</option>
        <option v-for="col in collections" :key="col.id" :value="col.id">
          {{ col.name }} ({{ col.variableCount }}개)
        </option>
      </select>
    </div>

    <div v-if="selectedCollectionId && component && component.properties?.length > 0" class="space-y-2 border-t pt-4">
      <label class="font-bold">2. 프로퍼티 ↔ 변수 모드 맵핑</label>

      <div v-for="(map, idx) in mappings" :key="idx" class="flex gap-2 items-center">
        <select v-model="map.propertyName" class="border p-2 rounded flex-1">
          <option disabled value="">프로퍼티 선택</option>
          <option v-for="prop in component.properties" :key="prop" :value="prop">
            {{ prop.split('#')[0] }}
          </option>
        </select>

        <span>↔</span>

        <select v-model="map.modeId" class="border p-2 rounded flex-1">
          <option disabled value="">모드 선택</option>
          <option v-for="mode in currentModes" :key="mode.modeId" :value="mode.modeId">
            {{ mode.name }}
          </option>
        </select>

        <button @click="removeMapping(idx)" class="text-red-500 px-2">✕</button>
      </div>

      <button @click="addMapping" class="text-blue-500 text-xs font-bold">+ 맵핑 추가</button>
    </div>

    <button
        v-if="selectedCollectionId && component"
        @click="generate"
        class="w-full bg-black text-white p-3 rounded font-bold mt-4 disabled:bg-gray-300"
        :disabled="!isReadyToGenerate"
    >
      {{ currentVariableCount }}개 자동 생성 및 바인딩
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const component = ref(null);
const collections = ref([]);
const selectedCollectionId = ref('');
const mappings = ref([{ propertyName: '', modeId: '' }]);

const currentCollection = computed(() => collections.value.find(c => c.id === selectedCollectionId.value));
const currentModes = computed(() => currentCollection.value ? currentCollection.value.modes : []);
const currentVariableCount = computed(() => currentCollection.value ? currentCollection.value.variableCount : 0);
const isReadyToGenerate = computed(() => mappings.value.some(m => m.propertyName && m.modeId));

const addMapping = () => mappings.value.push({ propertyName: '', modeId: '' });
const removeMapping = (idx) => mappings.value.splice(idx, 1);

onMounted(() => {
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg.type === 'init-data') {
      // 💡 데이터 할당 전 기존 선택 정보 초기화 방지 로직
      component.value = msg.component;
      collections.value = msg.collections;

      if (collections.value.length === 1 && !selectedCollectionId.value) {
        selectedCollectionId.value = collections.value[0].id;
      }
    }
  };
});

const generate = () => {
  const cleanMappings = mappings.value
      .filter(m => m.propertyName && m.modeId)
      .map(m => ({ propertyName: m.propertyName, modeId: m.modeId }));

  parent.postMessage({
    pluginMessage: {
      type: 'generate',
      data: {
        collectionId: selectedCollectionId.value,
        mappings: cleanMappings
      }
    }
  }, '*');
};
</script>