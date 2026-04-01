// code.js

function toCamelCase(str) {
    return str.toLowerCase().replace(/[^a-zA-Z0-9 ]/g, "").split(' ').filter(w => w.length > 0)
        .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {

    if (msg.type === 'notify') {
        figma.notify(msg.message);
        return;
    }

    if (msg.type === 'get-collections') {
        const list = figma.variables.getLocalVariableCollections().map(c => ({id: c.id, name: c.name}));
        figma.ui.postMessage({type: 'collections-list', data: list});
    }

    if (msg.type === 'extract-text') {
        const selection = figma.currentPage.selection;
        const textSet = new Set();

        // 재귀적으로 모든 텍스트 추출
        const processNode = (node) => {
            if (node.type === "TEXT") {
                const txt = node.characters.trim();
                if (txt) textSet.add(txt);
            } else if ("children" in node) {
                for (const child of node.children) processNode(child);
            }
        };

        selection.forEach(processNode);
        figma.ui.postMessage({type: 'text-extracted', texts: Array.from(textSet)});
    }

    if (msg.type === 'register-variables') {
        const {data, collectionId, newCollectionName} = msg;
        let collection;

        // 1. 콜렉션 확보
        collection = figma.variables.getLocalVariableCollections().find(c => c.id === collectionId);
        if (!collection) {
            const existing = figma.variables.getLocalVariableCollections().find(c => c.name === newCollectionName);
            collection = existing || figma.variables.createVariableCollection(newCollectionName || "Translations");
        }

        const modeId = collection.modes[0].modeId;

        // 2. 값(Value) 중복 체크를 위한 기존 변수 맵 생성
        const localVars = figma.variables.getLocalVariables("STRING").filter(v => v.variableCollectionId === collection.id);
        const valueToVarIdMap = new Map();
        localVars.forEach(v => {
            const val = v.valuesByMode[modeId];
            if (typeof val === 'string') valueToVarIdMap.set(val.trim(), v.id);
        });

        let boundCount = 0;
        let createdCount = 0;

        // 3. 데이터 루프 실행
        for (const [korean, english] of Object.entries(data)) {
            const varName = toCamelCase(english) || `var_${Date.now()}`;
            const trimmedKorean = korean.trim();

            // 💡 조건 1 & 2 적용: 동일한 컬렉션에 동일한 값이 있는지 확인
            if (valueToVarIdMap.has(trimmedKorean)) {
                // [A] 이미 값이 존재함 -> 이 경우에만 "연결" 로직 실행
                const targetVarId = valueToVarIdMap.get(trimmedKorean);

                const selection = figma.currentPage.selection;
                const bindToNodes = (nodes) => {
                    for (const node of nodes) {
                        if (node.type === "TEXT" && node.characters.trim() === trimmedKorean) {
                            node.setBoundVariable('characters', targetVarId);
                            boundCount++;
                        } else if ("children" in node) {
                            bindToNodes(node.children);
                        }
                    }
                };
                bindToNodes(selection);

            } else {
                // [B] 중복되지 않는 새로운 값 -> "등록"만 하고 "연결"은 하지 않음
                let variable = localVars.find(v => v.name === varName);
                if (!variable) {
                    variable = figma.variables.createVariable(varName, collection.id, "STRING");
                }
                variable.setValueForMode(modeId, trimmedKorean);
                createdCount++;

                // 새로 만든 것은 맵에 넣지 않음 (이번 실행 중에 중복 연결되는 것 방지)
            }
        }

        figma.notify(`✅ 완료: 신규 ${createdCount}개 등록 / 기존 ${boundCount}개 레이어 연결`);
        figma.ui.postMessage({type: 'variables-registered', successCount: boundCount});
    }
}