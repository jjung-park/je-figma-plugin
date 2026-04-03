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

    // 2. 텍스트 추출
    if (msg.type === 'extract-text') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) { figma.notify("❌ 프레임을 선택해주세요."); return; }
        const resultMap = new Map();
        selection.forEach(root => {
            const findNodes = (name) => root.findAll ? root.findAll(n => n.name.toLowerCase().includes(name)) : [];
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

    // 3. 변수 등록 및 레이어 연결 (복구된 메인 로직)
    if (msg.type === 'register-variables') {
        const { data, collectionId, newCollectionName, prefix } = msg;

        try {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            let col = (collectionId && collectionId !== 'new')
                ? collections.find(c => c.id === collectionId)
                : collections.find(c => c.name === (newCollectionName || "Translations").trim());

            if (!col) col = figma.variables.createVariableCollection((newCollectionName || "Translations").trim());

            // 모드 설정
            if (col.modes.length < 2) {
                if (col.modes[0].name !== "title") await col.renameMode(col.modes[0].modeId, "title");
                await col.addMode("contents");
            }
            const modeTitleId = col.modes[0].modeId;
            const modeContentsId = col.modes[1].modeId;

            const allVars = await figma.variables.getLocalVariablesAsync("STRING");
            const colVars = allVars.filter(v => v.variableCollectionId === col.id);
            const currentSelection = figma.currentPage.selection;
            let boundCount = 0;

            for (const item of data) {
                const varName = toCamelCase(item.english);
                const userPath = prefix ? `${prefix}/${varName}` : varName;
                const commonPath = `common/${varName}`;

                const existingVarsWithName = colVars.filter(v => v.name.split('/').pop() === varName);
                let targetVar;

                if (existingVarsWithName.length > 0) {
                    targetVar = existingVarsWithName.find(v => v.name === commonPath) || existingVarsWithName[0];
                    targetVar.name = commonPath;
                } else {
                    targetVar = figma.variables.createVariable(userPath, col, "STRING");
                }

                targetVar.setValueForMode(modeTitleId, String(item.header || "").trim());
                targetVar.setValueForMode(modeContentsId, String(item.body || "").trim());

                // 레이어 바인딩 루프
                for (const root of currentSelection) {
                    if (root.removed) continue;
                    const targets = root.findAll ? root.findAll(n => n.name.toLowerCase().includes("cell-header") || n.name.toLowerCase().includes("cell-body")) : [];

                    for (const node of targets) {
                        const tNode = (node.type === "TEXT") ? node : (node.findAll ? node.findAll(n => n.type === "TEXT")[0] : null);
                        if (!tNode) continue;

                        const isHeader = node.name.toLowerCase().includes("cell-header");
                        const nodeText = tNode.characters.trim();
                        const targetValue = isHeader ? String(item.header).trim() : String(item.body).trim();

                        if (nodeText === targetValue) {
                            const targetModeId = isHeader ? modeTitleId : modeContentsId;

                            // 모드 설정 및 변수 연결
                            if (node.setExplicitVariableModeForCollection) {
                                node.setExplicitVariableModeForCollection(col, targetModeId);
                            }
                            tNode.setBoundVariable('characters', targetVar);
                            boundCount++;
                        }
                    }
                }
            }
            figma.notify(`✅ ${boundCount}개 레이어 연결 완료!`);
        } catch (error) {
            figma.notify("❌ 오류: " + error.message);
        }
    }
};