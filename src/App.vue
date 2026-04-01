<template>
  <div class="p-4">
    <div class="grid gap-2 mb-4">
      <h2 class="title">Text to Variables</h2>
    </div>

    <section class="step-section">
      <div class="step-header">
        <span class="step-badge">1</span>
        <span class="step-title">텍스트 추출</span>
      </div>
      <button @click="requestExtract" class="btn-primary">
        선택한 프레임에서 추출하기
      </button>
    </section>

    <div v-if="extractedTexts.length > 0" class="mt-4">
      <section class="step-section">
        <div class="step-header">
          <span class="step-badge">2</span>
          <span class="step-title">영문 번역</span>
        </div>
        <button
            @click="translateTexts"
            :disabled="isTranslating"
            class="btn-next"
        >
          {{ isTranslating ? '번역 엔진 가동 중...' : '자동 번역 실행' }}
        </button>
      </section>

      <section v-if="Object.keys(translatedTexts).length > 0" class="step-section mt-4">
        <div class="flex justify-between items-center w-full mb-2">
          <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">대상 콜렉션</label>
          <button
              @click="refreshCollections"
              class="text-[10px] text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors"
          >
            목록 갱신
          </button>
        </div>

        <div class="config-box">
          <select v-model="selectedCollectionId" class="input-field">
            <option value="new">+ 새 콜렉션 만들기</option>
            <option v-for="col in collections" :key="col.id" :value="col.id">
              {{ col.name }}
            </option>
          </select>

          <input
              v-if="selectedCollectionId === 'new'"
              v-model="newCollectionName"
              placeholder="새 콜렉션 이름 (예: Labels)"
              class="input-field mt-2"
          />
        </div>

        <div class="table-container mt-4">
          <div class="table-info flex justify-between items-center py-3">
            <p>추출 텍스트 갯수 : {{extractedTexts.length}}</p>
            <p>💡 영어 칸을 클릭하여 직접 수정할 수 있습니다.</p>
          </div>

          <table>
            <thead>
            <tr>
              <th width="40%">한글 (Value)</th>
              <th width="60%">영어 (Key / camelCase)</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(text, index) in extractedTexts" :key="index">
              <td class="cell-korean">{{ text }}</td>
              <td class="cell-input">
                <input
                    v-model="translatedTexts[text]"
                    class="edit-input"
                    placeholder="번역 대기..."
                />
              </td>
            </tr>
            </tbody>
          </table>
        </div>

        <button @click="registerVariables" class="btn-variable mt-4">
          피그마 변수로 최종 등록 및 연결
        </button>
        <div v-if="autoBoundCount > 0" class="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2 mt-4">
          <div class="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
          <div>
            <p class="text-[11px] font-bold text-blue-800 uppercase tracking-tight">Smart Linking Complete</p>
            <p class="text-xs text-blue-700 leading-tight">
              <strong>{{ autoBoundCount }}개</strong>의 레이어가 변수와 연결되었습니다.
            </p>
          </div>
        </div>
      </section>
      <button class="text-red-500 rounded underline my-6 text-xs" @click="resetAll">
        초기화
      </button>
    </div>

    <div v-else class="empty-state">
      프레임을 선택하고 추출 버튼을 눌러주세요.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const extractedTexts = ref([])
const translatedTexts = ref({})
const isTranslating = ref(false)
const collections = ref([])
const selectedCollectionId = ref('new')
const newCollectionName = ref('Translations')
const autoBoundCount = ref(0) // 연결된 개수 상태

const resetAll = () => {
  extractedTexts.value = [];
  translatedTexts.value = {};
  isTranslating.value = false;
  selectedCollectionId.value = 'new';
  newCollectionName.value = 'Translations';
  autoBoundCount.value = 0; // 배너 초기화
  parent.postMessage({ pluginMessage: { type: 'notify', message: '플러그인이 초기화되었습니다.' } }, '*');
};

const requestExtract = () => {
  autoBoundCount.value = 0; // 새 추출 시 이전 배너 숨김
  parent.postMessage({ pluginMessage: { type: 'extract-text' } }, '*');
};

const translateTexts = async () => {
  if (extractedTexts.value.length === 0) return;
  isTranslating.value = true;
  const newTranslations = { ...translatedTexts.value };

  for (const text of extractedTexts.value) {
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|en`);
      const data = await response.json();
      let translated = data.responseData.translatedText;
      newTranslations[text] = translated.replace(/\.$/, '').trim();
    } catch (e) {
      console.error("번역 실패:", e);
      newTranslations[text] = newTranslations[text] || "";
    }
  }
  translatedTexts.value = newTranslations;
  isTranslating.value = false;
};

const refreshCollections = () => {
  parent.postMessage({ pluginMessage: { type: 'get-collections' } }, '*');
}

const registerVariables = () => {
  // Proxy 제거를 위해 일반 객체로 변환
  const pureData = JSON.parse(JSON.stringify(translatedTexts.value));

  parent.postMessage({
    pluginMessage: {
      type: 'register-variables',
      data: pureData,
      collectionId: selectedCollectionId.value,
      newCollectionName: newCollectionName.value
    }
  }, '*');

  setTimeout(refreshCollections, 500);
}

const handleMessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'text-extracted') {
    extractedTexts.value = [...msg.texts];
    const newMap = {};
    msg.texts.forEach(t => { newMap[t] = translatedTexts.value[t] || ''; });
    translatedTexts.value = newMap;
    if (msg.texts.length > 0) translateTexts();
    refreshCollections();
  }
  else if (msg.type === 'collections-list') {
    collections.value = msg.data;
  }
  else if (msg.type === 'variables-registered') {
    // 💡 등록 완료 후 피그마에서 보내온 연결 개수를 배너에 적용
    autoBoundCount.value = msg.successCount || 0;
  }
}

onMounted(() => {
  window.addEventListener('message', handleMessage);
  refreshCollections();
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage);
})
</script>

<style scoped>
/* 기존 스타일 그대로 유지 */
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