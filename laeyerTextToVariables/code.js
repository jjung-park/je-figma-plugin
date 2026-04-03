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
    // 1. 콜렉션 및 Prefix 목록 조회
    if (msg.type === 'get-collections') {
        try {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            const list = collections.map(c => ({
                id: c.id,
                name: c.name
            }));

            figma.ui.postMessage({ type: 'collections-list', data: list });
            figma.notify("🔄 콜렉션 목록이 업데이트되었습니다.");
        } catch (e) {
            console.error(e);
            figma.notify("❌ 목록을 불러오지 못했습니다.");
        }
        return;
    }

    // 2. 텍스트 추출 로직 (Syntax Error 수정 지점)
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

    // 3. 변수 등록 및 레이어 바인딩
    if (msg.type === 'register-variables') {
        const { data, collectionId, newCollectionName, prefix } = msg;

        try {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            let col = null;

            // 1. 콜렉션 식별 로직 (더 안전하게 수정)
            if (collectionId && collectionId !== 'new') {
                col = collections.find(c => c.id === collectionId);
            }

            // 드롭다운 선택이 아니거나, 선택한 ID를 못 찾은 경우 이름으로 검색
            if (!col) {
                const targetName = (newCollectionName || "Translations").trim();
                col = collections.find(c => c.name === targetName);

                // 이름으로도 없으면 새로 생성
                if (!col) {
                    col = figma.variables.createVariableCollection(targetName);
                }
            }

            // 💡 [중요] col이 확실히 존재하는지 한 번 더 체크 (TypeError 방지)
            if (!col) {
                throw new Error("콜렉션을 생성하거나 찾을 수 없습니다.");
            }

            // 2. 모드 설정 (col이 확실히 있을 때만 실행)
            // 피그마 컬렉션은 기본적으로 최소 1개의 모드를 가집니다.
            if (!col.modes || col.modes.length === 0) {
                // 매우 드문 케이스지만 모드가 아예 없는 경우 대응
                await col.addMode("title");
                await col.addMode("contents");
            } else {
                if (col.modes.length < 2) {
                    if (col.modes[0].name !== "title") await col.renameMode(col.modes[0].modeId, "title");
                    await col.addMode("contents");
                }
            }

            const modeTitleId = col.modes[0].modeId;
            const modeContentsId = col.modes[1].modeId;

            // 3. 변수 등록 및 바인딩 (이하 로직 동일)
            // ... (기존 버전 2 로직 계속)

            figma.notify("✅ 처리가 완료되었습니다.");

        } catch (error) {
            console.error(msg.type + " 에러:", error);
            figma.notify("❌ 오류 발생: " + error.message);
        }
    }
    if (msg.type === 'register-variables') {
        const { data, collectionId, newCollectionName, prefix } = msg;

        try {
            const collections = await figma.variables.getLocalVariableCollectionsAsync();
            let col = null;

            // 1. 콜렉션 식별 로직 (더 안전하게 수정)
            if (collectionId && collectionId !== 'new') {
                col = collections.find(c => c.id === collectionId);
            }

            // 드롭다운 선택이 아니거나, 선택한 ID를 못 찾은 경우 이름으로 검색
            if (!col) {
                const targetName = (newCollectionName || "Translations").trim();
                col = collections.find(c => c.name === targetName);

                // 이름으로도 없으면 새로 생성
                if (!col) {
                    col = figma.variables.createVariableCollection(targetName);
                }
            }

            // 💡 [중요] col이 확실히 존재하는지 한 번 더 체크 (TypeError 방지)
            if (!col) {
                throw new Error("콜렉션을 생성하거나 찾을 수 없습니다.");
            }

            // 2. 모드 설정 (col이 확실히 있을 때만 실행)
            // 피그마 컬렉션은 기본적으로 최소 1개의 모드를 가집니다.
            if (!col.modes || col.modes.length === 0) {
                // 매우 드문 케이스지만 모드가 아예 없는 경우 대응
                await col.addMode("title");
                await col.addMode("contents");
            } else {
                if (col.modes.length < 2) {
                    if (col.modes[0].name !== "title") await col.renameMode(col.modes[0].modeId, "title");
                    await col.addMode("contents");
                }
            }

            const modeTitleId = col.modes[0].modeId;
            const modeContentsId = col.modes[1].modeId;

            // 3. 변수 및 바인딩 로직 (버전 2 그룹 로직 유지)
            const allVars = await figma.variables.getLocalVariablesAsync("STRING");
            const colVars = allVars.filter(v => v.variableCollectionId === col.id);
            const currentSelection = figma.currentPage.selection;
            let boundCount = 0;

            for (const item of data) {
                const varName = toCamelCase(item.english);
                const userPath = prefix ? (prefix + "/" + varName) : varName;
                const commonPath = "common/" + varName;

                // 동일한 이름(마지막 경로)을 가진 변수 조회
                const existingVarsWithName = colVars.filter(v => v.name.split('/').pop() === varName);
                let targetVar;

                if (existingVarsWithName.length > 0) {
                    // [중복 발견] common 그룹 체크 및 이관
                    targetVar = existingVarsWithName.find(v => v.name === commonPath);
                    if (!targetVar) {
                        targetVar = existingVarsWithName[0];
                        targetVar.name = commonPath; // 이름 변경을 통해 common으로 이관
                        figma.notify(`📦 중복 변수 '${varName}'를 common으로 합쳤습니다.`);
                    }
                } else {
                    // [신규] 지정된 prefix 경로로 생성
                    targetVar = figma.variables.createVariable(userPath, col, "STRING");
                }

                // 값 업데이트
                targetVar.setValueForMode(modeTitleId, String(item.header || "").trim());
                targetVar.setValueForMode(modeContentsId, String(item.body || "").trim());

                // 레이어 바인딩 (버전 1/2 공통 로직)
                for (const root of currentSelection) {
                    if (root.removed) continue; // 루트 노드 제거 여부 체크

                    let targets = [];
                    try {
                        // 노드가 유효하고 findAll 메서드가 있을 때만 실행
                        if (root && !root.removed && "findAll" in root) {
                            targets = root.findAll(n =>
                                !n.removed &&
                                n.name &&
                                (n.name.toLowerCase().includes("cell-header") || n.name.toLowerCase().includes("cell-body"))
                            );
                        }
                    } catch (e) {
                        continue;
                    }

                    for (const node of targets) {
                        // 💡 바인딩 직전 노드 유효성 최종 확인
                        if (!node || node.removed) continue;

                        try {
                            // 텍스트 노드 찾기
                            const tNode = node.type === "TEXT" ? node : (node.findAll ? node.findAll(n => n.type === "TEXT")[0] : null);

                            // 💡 텍스트 노드가 없거나 유효하지 않으면 스킵
                            if (!tNode || tNode.removed || !figma.getNodeById(tNode.id)) continue;

                            const isHeader = node.name.toLowerCase().includes("cell-header");
                            const nodeText = tNode.characters.trim();
                            const targetText = isHeader ? String(item.header || "").trim() : String(item.body || "").trim();

                            // 텍스트 내용이 일치할 때만 바인딩 진행
                            if (nodeText === targetText) {
                                const targetModeId = isHeader ? modeTitleId : modeContentsId;

                                // 1. 모드 설정 (에러 방지를 위해 하나씩 체크)
                                if (node.setExplicitVariableModeForCollection) {
                                    node.setExplicitVariableModeForCollection(col, targetModeId);
                                }

                                // 2. 인스턴스 내부의 텍스트 노드일 경우 별도 모드 설정
                                if (node.id !== tNode.id && tNode.setExplicitVariableModeForCollection) {
                                    tNode.setExplicitVariableModeForCollection(col, targetModeId);
                                }

                                // 3. 최종 변수 연결
                                tNode.setBoundVariable('characters', targetVar);
                                boundCount++;
                            }
                        } catch (err) {
                            // 개별 노드 실패가 전체 루프를 멈추지 않도록 처리
                            console.warn("특정 노드 바인딩 건너뜀:", err.message);
                        }
                    }
                }
            }
            figma.notify(`✅ 총 ${boundCount}개 레이어 연결 완료!`);
        } catch (error) {
            console.error(error.message)
            figma.notify("❌ 오류: " + error.message);
        }
    }



};