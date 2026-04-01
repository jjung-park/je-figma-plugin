// code.js

function toCamelCase(str) {
    return str.toLowerCase().replace(/[^a-zA-Z0-9 ]/g, "").split(' ').filter(w => w.length > 0)
        .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
    // 💡 1. 콜렉션 목록 요청 처리
    if (msg.type === 'get-collections') {
        const list = figma.variables.getLocalVariableCollections().map(c => ({
            id: c.id,
            name: c.name
        }));
        figma.ui.postMessage({ type: 'collections-list', data: list });
        return; // 처리 후 리턴
    }

    // 2. 추출 로직 (이전 구조 유지)
    if (msg.type === 'extract-text') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.notify("❌ 프레임을 선택해주세요.");
            return;
        }

        const resultMap = new Map();
        selection.forEach(root => {
            const headers = root.findAll ? root.findAll(n => n.name.toLowerCase() === "cell-header") : [];
            const bodies = root.findAll ? root.findAll(n => n.name.toLowerCase() === "cell-body") : [];

            headers.forEach((hNode, index) => {
                const hTextNode = hNode.type === "TEXT" ? hNode : (hNode.findAll ? hNode.findAll(n => n.type === "TEXT")[0] : null);
                if (!hTextNode) return;

                const hText = hTextNode.characters.trim();
                const bNode = bodies[index];
                let bText = "";
                if (bNode) {
                    const bTextNode = bNode.type === "TEXT" ? bNode : (bNode.findAll ? bNode.findAll(n => n.type === "TEXT")[0] : null);
                    bText = bTextNode ? bTextNode.characters.trim() : "";
                }
                if (hText) resultMap.set(hText, { header: hText, body: bText });
            });
        });

        const pairs = Array.from(resultMap.values());
        if (pairs.length === 0) figma.notify("⚠️ 레이어 이름을 확인해주세요 (cell-header, cell-body)");

        figma.ui.postMessage({ type: 'text-extracted', pairs: pairs });
    }
    if (msg.type === 'register-variables') {
        const { data, collectionId, newCollectionName } = msg;
        let col = figma.variables.getLocalVariableCollections().find(c => c.id === collectionId);

        if (!col) {
            const existing = figma.variables.getLocalVariableCollections().find(c => c.name === newCollectionName);
            col = existing || figma.variables.createVariableCollection(newCollectionName || "Translations");
        }

        // 모드 설정
        if (col.modes.length < 2) {
            col.renameMode(col.modes[0].modeId, "title");
            col.addMode("contents");
        }

        const modeTitleId = col.modes[0].modeId;
        const modeContentsId = col.modes[1].modeId;

        // 💡 기존 변수 맵 생성 (중복 체크용)
        const localVars = figma.variables.getLocalVariables("STRING").filter(v => v.variableCollectionId === col.id);
        const valueToVarIdMap = new Map();
        localVars.forEach(v => {
            const val = v.valuesByMode[modeTitleId];
            if (typeof val === 'string') valueToVarIdMap.set(val.trim(), v.id);
        });

        let duplicateVarCount = 0; // 💡 중복 변수 개수 카운트
        let boundLayerCount = 0;   // (참고용) 연결된 레이어 수

        for (const item of data) {
            const varName = toCamelCase(item.english);
            const trimmedHeader = item.header.trim();
            let targetVar;

            // 💡 중복 체크: 이미 콜렉션에 같은 값이 있는지 확인
            if (valueToVarIdMap.has(trimmedHeader)) {
                const varId = valueToVarIdMap.get(trimmedHeader);
                targetVar = figma.variables.getVariableById(varId);
                duplicateVarCount++; // 💡 중복된 변수를 찾았으므로 카운트 증가
            } else {
                // 새로 생성
                targetVar = localVars.find(v => v.name === varName) || figma.variables.createVariable(varName, col.id, "STRING");
                targetVar.setValueForMode(modeTitleId, trimmedHeader);
                targetVar.setValueForMode(modeContentsId, item.body);
                // 새로 만든 변수는 맵에 추가 (이번 루프 내 중복 방지)
                valueToVarIdMap.set(trimmedHeader, targetVar.id);
            }

            // 레이어 바인딩 (선택 영역 내 탐색)
            const selection = figma.currentPage.selection;
            selection.forEach(root => {
                const allNodes = root.findAll ? root.findAll(n => n.name.toLowerCase() === "cell-header" || n.name.toLowerCase() === "cell-body") : [];
                allNodes.forEach(node => {
                    const tNode = node.type === "TEXT" ? node : (node.findAll ? node.findAll(n => n.type === "TEXT")[0] : null);
                    if (!tNode) return;

                    if (node.name.toLowerCase() === "cell-header" && tNode.characters.trim() === item.header) {
                        tNode.setBoundVariable('characters', targetVar.id);
                        boundLayerCount++;
                    } else if (node.name.toLowerCase() === "cell-body" && tNode.characters.trim() === item.body) {
                        tNode.setBoundVariable('characters', targetVar.id);
                        boundLayerCount++;
                    }
                });
            });
        }

        figma.notify(`✅ 완료: 중복 변수 ${duplicateVarCount}개 재사용 / ${boundLayerCount}개 레이어 연결`);
        // 💡 UI로 '중복 변수 개수'를 보냄
        figma.ui.postMessage({ type: 'variables-registered', successCount: duplicateVarCount });
    }
};