function toCamelCase(str) {
    if (!str) return "var_" + Math.random().toString(36).substr(2, 5);
    return str.toLowerCase()
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .split(' ')
        .filter(w => w.length > 0)
        .map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
}

figma.showUI(__html__, { width: 400, height: 650, themeColors: true });

figma.ui.onmessage = async (msg) => {
    // 1. 콜렉션 목록 조회
    if (msg.type === 'get-collections') {
        try {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            const list = collections.map(c => ({ id: c.id, name: c.name }));
            figma.ui.postMessage({ type: 'collections-list', data: list });
        } catch (e) { console.error(e); }
        return;
    }

    // 2. 텍스트 추출 로직
    if (msg.type === 'extract-text') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) { figma.notify("❌ 프레임을 선택해주세요."); return; }
        const resultMap = new Map();
        selection.forEach(root => {
            const findNodes = (name) => {
                try {
                    if (!root || root.removed) return [];
                    return root.findAll(n => {
                        try {
                            // 노드가 유효하고 name 속성에 접근 가능한지 확인
                            return !n.removed && n.name && n.name.toLowerCase().includes(name);
                        } catch (e) { return false; }
                    });
                } catch (e) { return []; }
            };
            const headers = findNodes("cell-header");
            const bodies = findNodes("cell-body");

            headers.forEach((hNode, index) => {
                const getTxt = (n) => {
                    if (!n) return "";
                    if (n.type === "TEXT") return n.characters;
                    if (n.findAll) {
                        const found = n.findAll(x => x.type === "TEXT");
                        return found.length > 0 ? found[0].characters : "";
                    }
                    return "";
                };
                const hText = getTxt(hNode).trim();
                if (hText) {
                    const bText = bodies[index] ? getTxt(bodies[index]).trim() : "";
                    resultMap.set(hText, { header: hText, body: bText });
                }
            });
        });
        figma.ui.postMessage({ type: 'text-extracted', pairs: Array.from(resultMap.values()) });
        return;
    }

    // 3. 변수 등록 및 레이어 바인딩 (복구 및 통합 버전)
    if (msg.type === 'register-variables') {
        const { data, collectionId, newCollectionName, prefix } = msg;
        figma.notify("🔄 변수 등록 및 레이어 바인딩 시작...");

        try {
            // 1. 콜렉션 준비
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            let col = (collectionId && collectionId !== 'new')
                ? collections.find(c => c.id === collectionId)
                : collections.find(c => c.name === (newCollectionName || "Translations").trim());

            if (!col) col = figma.variables.createVariableCollection((newCollectionName || "Translations").trim());

            // 2. 모드 설정 (title / contents)
            if (col.modes.length < 2) {
                if (col.modes[0].name !== "title") await col.renameMode(col.modes[0].modeId, "title");
                await col.addMode("contents");
            }
            const modeTitleId = col.modes[0].modeId;
            const modeContentsId = col.modes[1].modeId;

            // 3. 변수 및 레이어 데이터 준비
            const allVars = await figma.variables.getLocalVariablesAsync("STRING");
            const colVars = allVars.filter(v => v.variableCollectionId === col.id);
            const currentSelection = figma.currentPage.selection;
            let boundCount = 0;

            for (const item of data) {
                const varName = toCamelCase(item.english);
                const userPath = prefix ? `${prefix}/${varName}` : varName;
                const commonPath = `common/${varName}`;

                // 중복 체크 및 변수 결정
                const existingVarsWithName = colVars.filter(v => v.name.split('/').pop() === varName);
                let targetVar;

                if (existingVarsWithName.length > 0) {
                    targetVar = existingVarsWithName.find(v => v.name === commonPath) || existingVarsWithName[0];
                    targetVar.name = commonPath;
                } else {
                    targetVar = figma.variables.createVariable(userPath, col, "STRING");
                }

                // 모드별 값 주입
                targetVar.setValueForMode(modeTitleId, String(item.header || "").trim());
                targetVar.setValueForMode(modeContentsId, String(item.body || "").trim());

                // 🚀 [핵심] 레이어 바인딩 및 모드 적용
                for (const root of currentSelection) {
                    if (root.removed) continue;

                    let targets = [];
                    try {
                        // 💡 여기서도 동일하게 방어적 검색 수행
                        targets = root.findAll(n => {
                            try {
                                return !n.removed && n.name && (n.name.toLowerCase().includes("cell-header") || n.name.toLowerCase().includes("cell-body"));
                            } catch (e) { return false; }
                        });
                    } catch (e) {
                        console.warn("findAll 실행 중 노드 유실됨:", e.message);
                        continue;
                    }

                    for (const node of targets) {
                        try {
                            // 텍스트 노드 찾기 (자신이 텍스트거나 자식 중 첫 번째 텍스트)
                            const tNode = (node.type === "TEXT") ? node : (node.findAll ? node.findAll(n => n.type === "TEXT")[0] : null);
                            if (!tNode || tNode.removed) continue;

                            const isHeader = node.name.toLowerCase().includes("cell-header");
                            const nodeText = tNode.characters.trim();
                            const targetValue = isHeader ? String(item.header).trim() : String(item.body).trim();

                            // 💡 텍스트 내용이 일치하는 경우에만 실행
                            if (nodeText === targetValue) {
                                const targetModeId = isHeader ? modeTitleId : modeContentsId;

                                // A. 레이어(또는 부모)에 콜렉션 모드 설정
                                if (node.setExplicitVariableModeForCollection) {
                                    node.setExplicitVariableModeForCollection(col, targetModeId);
                                }

                                // B. 텍스트 노드 자체에도 모드 설정 (인스턴스 대응)
                                if (tNode.id !== node.id && tNode.setExplicitVariableModeForCollection) {
                                    tNode.setExplicitVariableModeForCollection(col, targetModeId);
                                }

                                // C. 변수 바인딩 (characters 속성에 targetVar 연결)
                                tNode.setBoundVariable('characters', targetVar);

                                boundCount++;
                            }
                        } catch (e) {
                            console.warn("개별 노드 바인딩 실패:", e.message);
                        }
                    }
                }
            }
            figma.notify(`✅ 총 ${boundCount}개 레이어에 변수 및 모드 적용 완료!`);
        } catch (error) {
            console.error(error);
            figma.notify("❌ 오류: " + error.message);
        }
    }
};