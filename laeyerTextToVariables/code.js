// 기존 변수명/함수명 100% 유지
function toCamelCase(str) {
    if (!str) return "var_" + Math.random().toString(36).substr(2, 5);
    return str.toLowerCase()
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .split(' ')
        .filter(w => w.length > 0)
        .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
    if (msg.type === 'get-collections') {
        try {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            const list = collections.map(c => ({ id: c.id, name: c.name }));
            figma.ui.postMessage({ type: 'collections-list', data: list });
        } catch (e) { console.error(e); }
        return;
    }

    if (msg.type === 'extract-text') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.notify("❌ 프레임을 선택해주세요.");
            return;
        }

        const resultMap = new Map();
        selection.forEach(root => {
            try {
                const headers = root.findAll ? root.findAll(n => n.name.toLowerCase().includes("cell-header")) : [];
                const bodies = root.findAll ? root.findAll(n => n.name.toLowerCase().includes("cell-body")) : [];

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
            } catch (e) { console.warn("추출 중 노드 건너뜀", e); }
        });

        const pairs = Array.from(resultMap.values());
        if (pairs.length === 0) figma.notify("⚠️ 레이어 이름을 확인해주세요 (cell-header, cell-body)");

        // 💡 안전하게 JSON 직렬화 후 전송 (UI 에러 방지)
        figma.ui.postMessage({ type: 'text-extracted', pairs: JSON.parse(JSON.stringify(pairs)) });
        return;
    }

    if (msg.type === 'register-variables') {
        const { data, collectionId, newCollectionName } = msg;
        figma.notify("🔄 바인딩 프로세스 시작...");

        try {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            let col = collections.find(c => c.id === collectionId) ||
                collections.find(c => c.name === (newCollectionName || "Translations")) ||
                figma.variables.createVariableCollection(newCollectionName || "Translations");

            if (col.modes.length < 2) {
                if (col.modes[0].name !== "title") await col.renameMode(col.modes[0].modeId, "title");
                await col.addMode("contents");
            }

            const modeTitleId = col.modes[0].modeId;
            const modeContentsId = col.modes[1].modeId;

            // 최신 변수 목록을 매번 새로 가져와서 중복 생성 방지
            const localVariables = await figma.variables.getLocalVariablesAsync("STRING");
            const currentSelection = figma.currentPage.selection;
            let boundCount = 0;

            for (const item of data) {
                const varName = toCamelCase(item.english);

                // 1. 변수 찾기 또는 생성 (중복 방지)
                let targetVar = localVariables.find(v => v.name === varName && v.variableCollectionId === col.id);

                if (!targetVar) {
                    targetVar = figma.variables.createVariable(varName, col, "STRING");
                }

                // 2. 변수 값은 항상 최신화 (이미 있어도 업데이트)
                targetVar.setValueForMode(modeTitleId, String(item.header || "").trim());
                targetVar.setValueForMode(modeContentsId, String(item.body || "").trim());

                // 3. 레이어 바인딩 로직
                for (const root of currentSelection) {
                    if (root.removed) continue;
                    let targets = [];
                    try {
                        if ("findAll" in root) {
                            targets = root.findAll(n => !n.removed && n.name && (n.name.toLowerCase().includes("cell-header") || n.name.toLowerCase().includes("cell-body")));
                        }
                    } catch (e) { continue; }

                    for (const node of targets) {
                        if (node.removed) continue;
                        try {
                            const tNode = node.type === "TEXT" ? node : (node.findAll ? node.findAll(n => n.type === "TEXT")[0] : null);
                            if (!tNode || tNode.removed) continue;

                            const isHeader = node.name.toLowerCase().includes("cell-header");
                            const nodeText = tNode.characters.trim();
                            const targetText = isHeader ? String(item.header || "").trim() : String(item.body || "").trim();

                            // 💡 핵심 수정: 텍스트 내용이 일치한다면 바인딩 실행
                            // (이미 같은 변수에 바인딩된 경우는 API가 알아서 처리하므로 굳이 skip하지 않음)
                            if (nodeText === targetText) {
                                const targetModeId = isHeader ? modeTitleId : modeContentsId;

                                // 모드 설정 및 변수 연결
                                node.setExplicitVariableModeForCollection(col, targetModeId);
                                if (node.id !== tNode.id) tNode.setExplicitVariableModeForCollection(col, targetModeId);

                                // 기존 바인딩 여부와 상관없이 '현재 찾은 변수'로 강제 연결
                                tNode.setBoundVariable('characters', targetVar);
                                boundCount++;
                            }
                        } catch (err) { console.warn("바인딩 실패", err); }
                    }
                }
            }
            figma.notify(`✅ 완료: ${boundCount}개 레이어 연결됨`);
            figma.ui.postMessage({ type: 'variables-registered', successCount: boundCount });
        } catch (error) {
            figma.notify("❌ 오류: " + error.message);
        }
    }
};