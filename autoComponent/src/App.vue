<template>
  <div class="p-4 space-y-4 text-sm">
    <h2 class="font-bold text-lg">테이블 컴포넌트 자동 생성기</h2>

    <div class="p-3 bg-gray-100 rounded border">
      <p v-if="component" class="text-blue-600 font-bold">
        선택됨: {{ component.name }} ({{ component.type }})
      </p>
      <p v-else class="text-red-500">
        작업할 프레임, 그룹 또는 컴포넌트를 선택해주세요.
      </p>
    </div>

    <div v-if="collections.length > 0" class="space-y-1">
      <label class="font-bold">1. 사용할 변수 콜렉션 선택</label>
      <select v-model="selectedCollectionId" class="w-full border p-2 rounded">
        <option disabled value="">콜렉션을 선택하세요</option>
        <option v-for="col in collections" :key="col.id" :value="col.id">
          {{ col.name }} (변수 {{ col.variableCount }}개)
        </option>
      </select>
    </div>

    <div v-if="selectedCollectionId && component" class="space-y-2 border-t pt-4">
      <label class="font-bold">2. 레이어명 ↔ 변수 모드(Mode) 맵핑</label>

      <div v-for="(map, idx) in mappings" :key="idx" class="flex gap-2 items-center">
        <select v-model="map.layerName" class="border p-2 rounded flex-1">
          <option disabled value="">레이어 선택</option>
          <option v-for="layer in component.textLayers" :key="layer" :value="layer">{{ layer }}</option>
        </select>

        <span>↔</span>

        <select v-model="map.modeId" class="border p-2 rounded flex-1">
          <option disabled value="">모드 선택</option>
          <option v-for="mode in currentModes" :key="mode.modeId" :value="mode.modeId">{{ mode.name }}</option>
        </select>

        <button @click="removeMapping(idx)" class="text-red-500 px-2 font-bold">X</button>
      </div>

      <button @click="addMapping" class="text-blue-500 text-xs font-bold">+ 맵핑 추가</button>
    </div>

    <button
        v-if="selectedCollectionId && component"
        @click="generate"
        class="w-full bg-black text-white p-3 rounded font-bold mt-4 hover:bg-gray-800"
    >
      {{ currentVariableCount }}개 컴포넌트 자동 생성하기
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const component = ref(null);
const collections = ref([]);
const selectedCollectionId = ref('');
const mappings = ref([{ layerName: '', modeId: '' }]);

// 현재 선택된 콜렉션의 데이터 계산
const currentCollection = computed(() => collections.value.find(c => c.id === selectedCollectionId.value));
const currentModes = computed(() => currentCollection.value ? currentCollection.value.modes : []);
const currentVariableCount = computed(() => currentCollection.value ? currentCollection.value.variableCount : 0);

const addMapping = () => mappings.value.push({ layerName: '', modeId: '' });
const removeMapping = (idx) => mappings.value.splice(idx, 1);

// 피그마 로직에서 데이터 받아오기
onMounted(() => {
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (msg.type === 'init-data') {
      component.value = msg.component;
      collections.value = msg.collections;

      // 콜렉션이 하나뿐이면 자동 선택
      if (collections.value.length === 1 && !selectedCollectionId.value) {
        selectedCollectionId.value = collections.value[0].id;
      }
    }
  };
});

// 피그마로 생성 명령 보내기
const generate = () => {
  // 💡 [DataCloneError 완벽 방지]
  // Vue Proxy 객체를 걷어내고, 빈 값이 있는 맵핑은 걸러서 순수 배열만 보냅니다.
  const cleanMappings = mappings.value
      .filter(m => m.layerName && m.modeId)
      .map(m => ({ layerName: m.layerName, modeId: m.modeId }));

  if (cleanMappings.length === 0) {
    alert("최소 1개 이상의 맵핑을 설정해주세요.");
    return;
  }

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