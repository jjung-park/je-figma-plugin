<template>
  <div class="p-4">
    <h2 class="title text-amber-50">Structure to Modes <span class="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">V2</span></h2>

    <section class="step-section">
      <button @click="requestExtract" class="btn-primary">1. 구조 분석 및 추출</button>
    </section>

    <div v-if="extractedPairs.length > 0" class="mt-4">
      <button @click="translateTexts" :disabled="isTranslating" class="btn-next mb-4">
        {{ isTranslating ? '번역 및 Key 생성 중...' : '자동 번역 (Key 생성)' }}
      </button>

      <div class="config-box mb-4">
        <div class="flex justify-between items-center mb-1">
          <label class="text-xs font-bold block">대상 콜렉션</label>
          <button @click="refreshCollections" class="refresh-btn">↻</button>
        </div>
        <select v-model="selectedCollectionId" class="input-field" @change="updatePrefixList">
          <option value="new">+ 새 콜렉션 만들기</option>
          <option v-for="col in collections" :key="col.id" :value="col.id">{{ col.name }}</option>
        </select>
        <input v-if="selectedCollectionId === 'new'" v-model="newCollectionName" class="input-field mt-1" placeholder="새 콜렉션 이름" />

        <label class="text-xs font-bold mt-3 mb-1 block">Prefix 입력(그룹 설정)</label>
        <div class="flex gap-1">
          <input v-model="newPrefix" class="input-field w-2/3" placeholder="예: Page_01" />
        </div>
        <p class="desc">중복 Header 발견 시 'common' 그룹으로 자동 이동됩니다.</p>
      </div>

      <div class="table-container">
        <table>
          <thead>
          <tr>
            <th>Header</th>
            <th>Body</th>
            <th>English (Key)</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="pair in extractedPairs" :key="pair.header">
            <td class="cell-text">{{ pair.header }}</td>
            <td class="cell-text">{{ pair.body }}</td>
            <td><input v-model="translatedTexts[pair.header]" class="edit-input" /></td>
          </tr>
          </tbody>
        </table>
      </div>

      <button @click="registerWithModes" class="btn-variable mt-4" >2. 변수 등록 및 연결</button>
      <button @click="resetAll" class="reset-link">전체 초기화</button>
    </div>

    <div v-else class="empty-state">
      프레임을 선택하고 추출 버튼을 눌러주세요.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {isEmpty} from "lodash/lang.js";

const extractedPairs = ref([]);
const translatedTexts = ref({});
const collections = ref([]);
const selectedCollectionId = ref('new');
const newCollectionName = ref('Content_Library');

// Prefix 관련 상태
const prefixType = ref('select');
const selectedPrefix = ref('');
const newPrefix = ref('');
const isTranslating = ref(false);

// 💡 [추가된 함수] 컬렉션 변경 시 Prefix 선택 상태 초기화
const updatePrefixList = () => {
  selectedPrefix.value = '';
  newPrefix.value = '';
};

// 콜렉션 목록 갱신 요청
const refreshCollections = () => parent.postMessage({ pluginMessage: { type: 'get-collections' } }, '*');
const requestExtract = () => parent.postMessage({ pluginMessage: { type: 'extract-text' } }, '*');

const registerWithModes = () => {
  const finalPrefix = prefixType.value === 'select' ? selectedPrefix.value : newPrefix.value;
  const payload = extractedPairs.value.map(p => ({
    header: p.header,
    body: p.body,
    english: translatedTexts.value[p.header] || p.header
  }));

  parent.postMessage({
    pluginMessage: {
      type: 'register-variables',
      data: payload,
      collectionId: selectedCollectionId.value !== 'new' ? selectedCollectionId.value : null,
      newCollectionName: newCollectionName.value,
      prefix: finalPrefix
    }
  }, '*');
};

const translateTexts = async () => {
  if (isTranslating.value || extractedPairs.value.length === 0) return;
  isTranslating.value = true;
  for (const pair of extractedPairs.value) {
    if (translatedTexts.value[pair.header]) continue;
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(pair.header)}&langpair=ko|en`);
      const data = await res.json();
      translatedTexts.value[pair.header] = data.responseData.translatedText.replace(/\.$/, '').trim();
    } catch (e) { translatedTexts.value[pair.header] = pair.header; }
  }
  isTranslating.value = false;
};

const resetAll = () => {
  extractedPairs.value = [];
  translatedTexts.value = {};
  selectedPrefix.value = '';
  newPrefix.value = '';
  refreshCollections();
};

onMounted(() => {
  window.onmessage = (event) => {
    const msg = event.data.pluginMessage;
    if (!msg) return;
    if (msg.type === 'text-extracted') {
      extractedPairs.value = msg.pairs;
      msg.pairs.forEach(p => { if (!translatedTexts.value[p.header]) translatedTexts.value[p.header] = ''; });
      translateTexts();
    } else if (msg.type === 'collections-list') {
      collections.value = msg.data;
    }
  };
  refreshCollections();
});
</script>

<style scoped>
.p-4 { padding: 16px; font-family: 'Inter', sans-serif; color: #333; }
.title { font-size: 16px; font-weight: 800; margin-bottom: 16px; letter-spacing: -0.5px; }
.step-section { margin-bottom: 20px; }
.btn-primary { background: #18A0FB; color: white; border: none; padding: 12px; border-radius: 6px; width: 100%; cursor: pointer; font-weight: 600; font-size: 13px; }
.btn-next { background: #1BC47D; color: white; border: none; padding: 10px; border-radius: 6px; width: 100%; cursor: pointer; font-size: 12px; font-weight: 600; }
.btn-next:disabled { background: #ccc; cursor: not-allowed; }
.btn-variable { background: #9747FF; color: white; border: none; padding: 12px; border-radius: 6px; width: 100%; cursor: pointer; font-weight: 600; font-size: 13px; margin-top: 12px; }
.config-box { background: #f8f8f8; padding: 12px; border-radius: 8px; border: 1px solid #eee; }
.input-field { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; box-sizing: border-box; background: #fff; color: #000; }
.desc { font-size: 10px; color: #888; margin-top: 4px; line-height: 1.3; }
.table-container { border: 1px solid #eee; border-radius: 4px; margin-top: 12px; max-height: 200px; overflow-y: auto; background: #fff; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { background: #f9f9f9; padding: 8px; font-weight: 700; color: #777; border-bottom: 1px solid #eee; position: sticky; top: 0; }
td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: middle; }
.cell-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100px; color: #666; }
.edit-input { width: 100%; border: 1px solid #18A0FB; border-radius: 4px; padding: 4px 6px; font-size: 11px; outline: none; }
.reset-link { color: #f44; font-size: 10px; background: none; border: none; width: 100%; margin-top: 15px; cursor: pointer; text-decoration: underline; }
.empty-state { text-align: center; color: #aaa; font-size: 12px; margin-top: 40px; border: 1px dashed #ccc; padding: 30px 20px; border-radius: 10px; }
.refresh-btn { background: none; border: none; font-size: 18px; cursor: pointer; color: #888; }
.refresh-btn:hover { color: #18a0fb; }
</style>