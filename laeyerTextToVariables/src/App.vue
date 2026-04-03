<template>
  <div class="p-4">
    <h2 class="title">Structure to Modes</h2>
    <section class="step-section">
      <button @click="requestExtract" class="btn-primary">구조 분석 및 추출 (cell-header/Body)</button>
    </section>

    <div v-if="extractedPairs.length > 0" class="mt-4">
      <button @click="translateTexts" :disabled="isTranslating" class="btn-next mb-4">
        {{ isTranslating ? '번역 중...' : '자동 번역 (Key 생성)' }}
      </button>

      <div class="config-box mb-4">
        <div class="flex justify-between items-center mb-2">
          <label class="text-xs w-20 mb-0">대상 콜렉션</label>
          <button @click="refreshCollections" class="btn-refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            목록 갱신
          </button>
        </div>

        <select v-model="selectedCollectionId" class="input-field">
          <option value="new">+ 새 콜렉션 만들기</option>
          <option v-for="col in collections" :key="col.id" :value="col.id">
            {{ col.name }}
          </option>
        </select>
        <input v-if="selectedCollectionId === 'new'" v-model="newCollectionName" class="input-field mt-2" placeholder="새 이름 (예: Content_Library)" />
      </div>

      <div class="table-container">
        <table>
          <thead>
          <tr>
            <th>Header (title)</th>
            <th>Body (contents)</th>
            <th>English (Key)</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(pair, idx) in extractedPairs" :key="idx" >
            <td class="cell-text" :title="pair.header">{{ pair.header }}</td>
            <td class="cell-text" :title="pair.body">{{ pair.body }}</td>
            <td><input v-model="translatedTexts[pair.header]" class="edit-input" placeholder="Key 명칭" /></td>
          </tr>
          </tbody>
        </table>
      </div>

      <button @click="registerWithModes" class="btn-variable mt-4">멀티 모드 변수 등록 및 연결</button>
      <div v-if="autoBoundCount > 0" class="my-4 p-3 bg-green-50 border border-green-100 rounded-lg animate-in fade-in">
        <p class="text-xs text-green-700">
          ♻️ 콜렉션 내 <strong>{{ autoBoundCount }}개</strong>의 기존 변수를 찾아 재사용했습니다.
        </p>
      </div>

      <button @click="resetAll" class="text-red-500 underline mt-4 text-[11px] block w-full text-center">전체 초기화</button>
    </div>

    <div v-else class="empty-state">
      프레임을 선택하고 추출 버튼을 눌러주세요.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const extractedPairs = ref([]);
const translatedTexts = ref({});
const collections = ref([]);
const selectedCollectionId = ref('new');
const newCollectionName = ref('Content_Library');
const isTranslating = ref(false);
const autoBoundCount = ref(0);

// 💡 콜렉션 목록 요청 함수
const refreshCollections = () => {
  parent.postMessage({ pluginMessage: { type: 'get-collections' } }, '*');
};

const resetAll = () => {
  extractedPairs.value = [];
  translatedTexts.value = {};
  autoBoundCount.value = 0;
  // 💡 초기화 시 목록 다시 불러오기
  refreshCollections();
};

const requestExtract = () => {
  autoBoundCount.value = 0;
  parent.postMessage({ pluginMessage: { type: 'extract-text' } }, '*');
};

const translateTexts = async () => {
  // 이미 번역 중이면 중단
  if (isTranslating.value || extractedPairs.value.length === 0) return;

  isTranslating.value = true;

  for (const pair of extractedPairs.value) {
    // 💡 이미 번역된 값이 있다면 다시 요청하지 않고 스킵 (선택 사항)
    if (translatedTexts.value[pair.header] && translatedTexts.value[pair.header] !== '') {
      continue;
    }

    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(pair.header)}&langpair=ko|en`);
      const data = await res.json();
      const translated = data.responseData.translatedText.replace(/\.$/, '').trim();
      translatedTexts.value[pair.header] = translated;
    } catch (e) {
      console.error("번역 에러:", e);
      translatedTexts.value[pair.header] = pair.header; // 실패 시 원문 유지
    }
  }
  isTranslating.value = false;
};

const registerWithModes = () => {
  const payload = extractedPairs.value.map(p => ({
    header: p.header,
    body: p.body,
    english: translatedTexts.value[p.header] || p.header
  }));

  parent.postMessage({
    pluginMessage: {
      type: 'register-variables',
      data: payload,
      collectionId: selectedCollectionId.value,
      newCollectionName: newCollectionName.value
    }
  }, '*');
};

const handleMessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'text-extracted') {
    // 1. 데이터 저장
    extractedPairs.value = msg.pairs;

    // 2. 번역 맵 초기화 (기존 데이터 유지하며 새 데이터 추가)
    msg.pairs.forEach(p => {
      if (!translatedTexts.value[p.header]) {
        translatedTexts.value[p.header] = '';
      }
    });

    // 💡 3. 데이터가 있으면 자동으로 번역 로직 실행
    if (msg.pairs.length > 0) {
      translateTexts();
    }

    // 추출 성공 시에도 콜렉션 목록 한 번 더 갱신
    refreshCollections();
  }
  else if (msg.type === 'collections-list') {
    // 💡 피그마에서 받은 목록을 변수에 저장
    collections.value = msg.data;
  }
  else if (msg.type === 'variables-registered') {
    autoBoundCount.value = msg.successCount;
    refreshCollections(); // 등록 후 목록 갱신 (새 콜렉션 생성 대응)
  }
};

onMounted(() => {
  window.addEventListener('message', handleMessage);
  // 💡 플러그인 실행 시 즉시 호출
  refreshCollections();
});
</script>

<style scoped>
.btn-refresh {
  background: none; border: none; color: #18A0FB; font-size: 10px; font-weight: bold;
  display: flex; align-items: center; gap: 4px; cursor: pointer; padding: 2px 4px; width:auto
}
.btn-refresh:hover { color: #0d8de3; }
.cell-text { font-size: 11px; color: #666; max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
.p-4 { padding: 20px; font-family: 'Inter', sans-serif; color: #333; }
.title { font-size: 18px; font-weight: 800; margin-bottom: 20px; letter-spacing: -0.5px; }
.step-section { margin-bottom: 24px; }
.step-header { display: flex; align-items: center; margin-bottom: 10px; }
.step-badge { background: #333; color: white; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 10px; font-weight: bold; margin-right: 8px; }
.step-title { font-size: 13px; font-weight: 600; color: #555; }
button { width: 100%; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; padding: 12px; }
.btn-primary { background: #18A0FB; color: white; }
.btn-next { background: #1BC47D; color: white; }
.btn-next:disabled { background: #ccc; cursor: not-allowed; }
.btn-variable { background: #9747FF; color: white; box-shadow: 0 4px 10px rgba(151, 71, 255, 0.2); }
.config-box { background: #f5f5f5; padding: 12px; border-radius: 8px; }
.input-field { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; box-sizing: border-box; background: #fff; color:#000; }
.edit-input { width: 100%; padding: 6px; border: 1px solid #18A0FB; border-radius: 4px; font-size: 12px; outline: none; background: #fff; color:#000}
.table-container { border: 1px solid #eee; border-radius: 6px; overflow: hidden; }
.table-info { font-size: 10px; color: #999; padding: 8px; background: #fafafa; border-bottom: 1px solid #eee; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th { background: #f9f9f9; padding: 8px; font-size: 11px; text-align: left; color: #777; border-bottom: 1px solid #eee; }
td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: middle; }
.cell-korean { font-size: 11px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-state { text-align: center; color: #aaa; font-size: 12px; margin-top: 40px; border: 1px dashed #ccc; padding: 20px; border-radius: 10px; }
</style>