figma.showUI(__html__, { width: 350, height: 520 });

async function sendInitData() {
    try {
        const selection = figma.currentPage.selection[0];
        let compData = null;

        if (selection) {
            let targets = [];
            // 1. 선택물 자체가 인스턴스/컴포넌트인 경우
            if (selection.type === 'INSTANCE' || selection.type === 'COMPONENT') {
                targets = [selection];
            }
            // 2. 프레임/그룹 내부의 모든 인스턴스 탐색
            else if ('findAll' in selection) {
                targets = selection.findAll(n => n.type === 'INSTANCE' || n.type === 'COMPONENT');
            }

            const allTextProps = new Set();
            targets.forEach(t => {
                const props = t.type === 'INSTANCE' ? t.componentProperties : t.componentPropertyDefinitions;
                if (props) {
                    Object.keys(props).forEach(name => {
                        if (props[name].type === 'TEXT') allTextProps.add(name);
                    });
                }
            });

            compData = {
                name: selection.name,
                properties: Array.from(allTextProps) // 중복 제거된 프로퍼티 리스트
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
    } catch (err) {
        console.error("데이터 전송 중 에러:", err);
    }
}

// 이벤트 리스너 설정
figma.on("selectionchange", sendInitData);
// 실행 시 즉시 데이터 전송 (UI가 로드될 시간을 위해 약간의 지연을 주기도 함)
setTimeout(sendInitData, 100);

figma.ui.onmessage = async (msg) => {
    if (msg.type === 'generate') {
        const { collectionId, mappings } = msg.data;
        const selection = figma.currentPage.selection[0];

        if (!selection) return figma.notify("대상을 선택해주세요.");

        // 1. 변수 콜렉션 가져오기
        const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
        if (!collection) return figma.notify("콜렉션을 찾을 수 없습니다.");

        const variableIds = collection.variableIds;
        const generatedNodes = [];
        let currentY = selection.y + selection.height + 20;

        // 변수 개수만큼 반복 생성 (행 단위)
        for (const varId of variableIds) {
            const variable = await figma.variables.getVariableByIdAsync(varId);
            if (!variable) continue;

            const clone = selection.clone();
            clone.y = currentY;
            clone.x = selection.x;
            currentY += clone.height + 16;

            // 2. 내부의 모든 인스턴스 탐색
            const allInstances = (clone.type === 'INSTANCE')
                ? [clone, ...(clone.findAll(n => n.type === 'INSTANCE'))]
                : clone.findAll(n => n.type === 'INSTANCE');

            for (const inst of allInstances) {
                if (!inst.componentProperties) continue;

                const propertyUpdates = {};
                let targetModeId = null;

                // 3. 매핑 정보를 바탕으로 어떤 인스턴스에 어떤 모드를 넣을지 결정
                for (const mapping of mappings) {
                    const targetPropName = Object.keys(inst.componentProperties).find(name =>
                        name === mapping.propertyName || name.startsWith(`${mapping.propertyName}#`)
                    );

                    if (targetPropName) {
                        // 변수 바인딩 (육각형 아이콘)
                        propertyUpdates[targetPropName] = {
                            type: "VARIABLE_ALIAS",
                            id: variable.id
                        };
                        // 이 인스턴스가 보여줘야 할 모드 ID 저장
                        targetModeId = mapping.modeId;
                    }
                }

                // 4. 바인딩 및 모드 설정 실행
                if (Object.keys(propertyUpdates).length > 0) {
                    try {
                        // 변수 연결 실행
                        inst.setProperties(propertyUpdates);

                        // 💡 [핵심 수정] 정식 메서드 setExplicitVariableModeForCollection 사용
                        if (targetModeId) {
                            // figma.variables.getVariableCollectionByIdAsync를 통해 가져온 collection 객체 혹은 ID 사용
                            inst.setExplicitVariableModeForCollection(collection, targetModeId);
                            console.log(`✅ ${inst.name}에 모드 적용 성공 (ID: ${targetModeId})`);
                        }
                    } catch (e) {
                        console.error(`❌ 모드 설정 에러:`, e);
                    }
                }
            }

            figma.currentPage.appendChild(clone);
            generatedNodes.push(clone);
        }

        figma.currentPage.selection = generatedNodes;
        figma.viewport.scrollAndZoomIntoView(generatedNodes);
        figma.notify("정식 API로 모드 바인딩 완료!");
    }
};