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
            col = figma.variables.getLocalVariableCollections().find(c => c.name === newCollectionName) ||
                figma.variables.createVariableCollection(newCollectionName || "Translations");
        }

        if (col.modes.length < 2) {
            if (col.modes[0].name !== "title") col.renameMode(col.modes[0].modeId, "title");
            col.addMode("contents");
        }

        const modeTitleId = col.modes[0].modeId;
        const modeContentsId = col.modes[1].modeId;
        const colId = col.id;

        let boundCount = 0;

        for (const item of data) {
            const varName = toCamelCase(item.english);

            let targetVar = figma.variables.getLocalVariables("STRING")
                .find(v => v.name === varName && v.variableCollectionId === colId);

            if (!targetVar) {
                targetVar = figma.variables.createVariable(varName, colId, "STRING");
            }

            targetVar.setValueForMode(modeTitleId, item.header.toString().trim());
            targetVar.setValueForMode(modeContentsId, item.body.toString().trim());

            const selection = figma.currentPage.selection;
            selection.forEach(root => {
                const targets = [];
                if (root.name.toLowerCase().includes("cell-header") || root.name.toLowerCase().includes("cell-body")) {
                    targets.push(root);
                }
                if ("findAll" in root) {
                    targets.push(...root.findAll(n =>
                        n.name.toLowerCase().includes("cell-header") ||
                        n.name.toLowerCase().includes("cell-body")
                    ));
                }

                targets.forEach(node => {
                    const tNode = node.type === "TEXT" ? node : (node.findAll ? node.findAll(n => n.type === "TEXT")[0] : null);
                    if (!tNode) return;

                    const isHeader = node.name.toLowerCase().includes("cell-header");
                    const isBody = node.name.toLowerCase().includes("cell-body");

                    const isMatch = isHeader ?
                        tNode.characters.trim() === item.header.trim() :
                        tNode.characters.trim() === item.body.trim();

                    if (isMatch) {
                        try {
                            const targetModeId = isHeader ? modeTitleId : modeContentsId;

                            // ✅ 버그 수정: 올바른 피그마 API 메서드명 적용
                            node.setExplicitVariableModeForCollection(colId, targetModeId);
                            if (node.id !== tNode.id) {
                                tNode.setExplicitVariableModeForCollection(colId, targetModeId);
                            }

                            // 모드가 정상적으로 적용된 후 변수 연결
                            tNode.setBoundVariable('characters', targetVar.id);

                            boundCount++;
                        } catch (err) {
                            console.error("적용 실패:", err);
                        }
                    }
                });
            });
        }

        figma.notify(`✅ ${boundCount}개 레이어 동기화 완료 (모드 적용됨)`);
    }
};