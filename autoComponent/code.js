figma.showUI(__html__, { width: 350, height: 500 });

// 1. UI에 필요한 초기 데이터(선택된 컴포넌트, 변수 콜렉션 목록) 전달
async function sendInitData() {
    const selection = figma.currentPage.selection[0];
    let compData = null;

    // 컴포넌트나 인스턴스가 선택되었을 때만 정보 추출
    if (selection && (selection.type === 'COMPONENT' || selection.type === 'INSTANCE')) {
        // 내부의 모든 텍스트 레이어를 찾아서 이름만 추출 (중복 제거)
        const textNodes = selection.findAllWithCriteria({ types: ['TEXT'] });
        const textNames = [...new Set(textNodes.map(n => n.name))];
        compData = { id: selection.id, name: selection.name, textLayers: textNames };
    }

    // 로컬 변수 콜렉션 및 모드 정보 추출
    const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const colData = localCollections.map(c => ({
        id: c.id,
        name: c.name,
        variableCount: c.variableIds.length,
        modes: c.modes.map(m => ({ modeId: m.modeId, name: m.name }))
    }));

    // 순수한 데이터만 UI로 전송
    figma.ui.postMessage({
        type: 'init-data',
        component: compData,
        collections: colData
    });
}

// 캔버스 선택이 바뀔 때마다 데이터 갱신
figma.on("selectionchange", sendInitData);
// 플러그인 켰을 때 즉시 한 번 실행
sendInitData();


// 2. UI로부터 '생성' 명령을 받았을 때의 처리
figma.ui.onmessage = async (msg) => {
    if (msg.type === 'generate') {
        const { collectionId, mappings } = msg.data;
        const selection = figma.currentPage.selection[0];

        if (!selection) return figma.notify("컴포넌트를 다시 선택해주세요.");

        const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
        const variableIds = collection.variableIds;

        const generatedNodes = [];
        let currentY = selection.y + selection.height + 20;

        // 💡 루프 시작
        for (let i = 0; i < variableIds.length; i++) {
            const variable = await figma.variables.getVariableByIdAsync(variableIds[i]);

            // 1. 복제본 생성
            const clone = selection.type === 'COMPONENT' ? selection.createInstance() : selection.clone();
            clone.y = currentY;
            clone.x = selection.x;
            currentY += clone.height + 16;

            // 2. ⚠️ 중요: 복제된 'clone' 내부에서 텍스트 노드를 매번 새로 검색합니다.
            const textNodesInClone = clone.findAll(n => n.type === "TEXT");

            for (const mapping of mappings) {
                // 이름이 일치하는 타겟 레이어 찾기
                const targetNodes = textNodesInClone.filter(n => n.name === mapping.layerName);

                for (const node of targetNodes) {
                    try {
                        // 3. 폰트 로드 (에러 방지를 위해 node 자체의 fontName을 직접 참조)
                        await figma.loadFontAsync(node.fontName);

                        const value = variable.valuesByMode[mapping.modeId];
                        if (value !== undefined) {
                            node.characters = String(value);
                        }
                    } catch (err) {
                        console.error("폰트 로드 또는 텍스트 변경 중 에러:", err);
                    }
                }
            }

            figma.currentPage.appendChild(clone);
            generatedNodes.push(clone);
        }

        figma.currentPage.selection = generatedNodes;
        figma.viewport.scrollAndZoomIntoView(generatedNodes);
        figma.notify(`✅ ${variableIds.length}개 생성 완료!`);
    }
};