figma.showUI(__html__, { width: 350, height: 500 });

// 1. UI에 필요한 초기 데이터(선택된 컴포넌트, 변수 콜렉션 목록) 전달
async function sendInitData() {
    const selection = figma.currentPage.selection[0];
    let compData = null;

    // 💡 COMPONENT, INSTANCE 외에 FRAME, GROUP도 허용
    const allowedTypes = ['COMPONENT', 'INSTANCE', 'FRAME', 'GROUP'];

    if (selection && allowedTypes.includes(selection.type)) {
        // 모든 텍스트 레이어 추출
        const textNodes = selection.findAll(n => n.type === 'TEXT');
        const textNames = [...new Set(textNodes.map(n => n.name))];
        compData = {
            id: selection.id,
            name: selection.name,
            textLayers: textNames,
            type: selection.type
        };
    }

    const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const colData = localCollections.map(c => ({
        id: c.id,
        name: c.name,
        variableCount: c.variableIds.length,
        modes: c.modes.map(m => ({ modeId: m.modeId, name: m.name }))
    }));

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

        if (!selection) return figma.notify("대상을 선택해주세요.");

        const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
        const variableIds = collection.variableIds;
        const generatedNodes = [];
        let currentY = selection.x + selection.height + 20;

        // 💡 변수 개수만큼 반복 생성
        for (let i = 0; i < variableIds.length; i++) {
            const variableId = variableIds[i];
            const variable = await figma.variables.getVariableByIdAsync(variableId);

            // 1. 노드 복제
            let newNode = selection.type === 'COMPONENT' ? selection.createInstance() : selection.clone();
            newNode.y = currentY;
            newNode.x = selection.x;
            currentY += newNode.height + 16;

            // 2. 🌟 핵심: 이 노드가 사용할 '모드'를 명시적으로 설정
            // UI에서 선택한 모드(mapping.modeId)를 이 노드 전체에 적용합니다.
            // (각 복제본마다 다른 모드를 적용해야 하므로 루프 안에서 처리)
            for (const mapping of mappings) {
                try {
                    // 해당 콜렉션에 대해 특정 모드를 강제로 할당합니다.
                    newNode.setExplicitVariableMode(collectionId, mapping.modeId);
                } catch (e) {
                    console.error("모드 설정 실패:", e);
                }
            }

            // 3. 내부 텍스트 레이어에 변수 바인딩
            const allTextNodes = newNode.findAll(n => n.type === "TEXT");
            for (const mapping of mappings) {
                const targetNodes = allTextNodes.filter(n => n.name === mapping.layerName);

                for (const node of targetNodes) {
                    try {
                        // 폰트 로드는 바인딩 시에도 안전을 위해 필요할 수 있습니다.
                        await figma.loadFontAsync(node.fontName);

                        // 🌟 텍스트 값 자체를 바꾸는 게 아니라 '변수'를 연결합니다.
                        // 이제 이 레이어는 자동으로 부모(newNode)에 설정된 모드 값을 보여줍니다.
                        node.setBoundVariable('characters', variable.id);

                    } catch (err) {
                        console.error("바인딩 에러:", err);
                    }
                }
            }

            figma.currentPage.appendChild(newNode);
            generatedNodes.push(newNode);
        }

        figma.currentPage.selection = generatedNodes;
        figma.viewport.scrollAndZoomIntoView(generatedNodes);
        figma.notify(`✅ ${variableIds.length}개 변수 연결 및 생성 완료!`);
    }
};