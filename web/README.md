# NKG Web Frontend

Notion Knowledge Graph 웹 시각화. WebVOWL에서 영감을 받은 force-directed 그래프 뷰.

- **스택**: Vite 8 + React 18 + TypeScript 5.9 (strict)
- **그래프 엔진**: react-force-graph-2d + canvas 커스텀 렌더링
- **API 클라이언트**: openapi-fetch + openapi-typescript 자동 타입 생성

## 요구 사항

- Node 20+
- NKG API 서버 실행 중 (로컬 또는 원격)

## 설치 & 실행

```bash
cd web
npm install
npm run dev                    # http://localhost:5173
                               # /api → NKG_API_URL (기본 localhost:18080)

NKG_API_URL=http://host:8080 npm run dev    # API 위치 변경
```

## 빌드

```bash
npm run build      # lint + format:check + tsc + vite build → dist/
npm run preview    # dist/ 로컬 정적 서버
npm run gen:api    # openapi.yaml → src/api/schema.d.ts 타입 재생성
```

`npm run build`는 lint error 또는 Prettier diff가 있으면 즉시 실패한다. Docker 이미지 빌드(`web/Dockerfile`)도 동일 스크립트를 호출하므로 동일 게이트가 적용됨.

## Lint & Format

ESLint(flat config) + Prettier + knip 스택. TypeScript strict(`tsconfig.app.json`)와 함께 사용.

```bash
npm run lint          # ESLint 검사 (0 error 기준)
npm run lint:fix      # autofix 가능한 항목 수정
npm run format        # Prettier 일괄 포맷
npm run format:check  # 포맷 diff 확인 (CI/빌드용)
npm run knip          # 미사용 파일/export/dependency 검출
npm run typecheck     # tsc 타입 체크만
```

### ESLint 설정 요약 (`eslint.config.js`)

- `@eslint/js` recommended + `typescript-eslint` recommendedTypeChecked (type-aware)
- `eslint-plugin-react` + `react-hooks` + `react-refresh` (Vite HMR 호환)
- `eslint-plugin-unused-imports`: 미사용 import 자동 제거
- `eslint-plugin-simple-import-sort`: import/export 자동 정렬
- `eslint-config-prettier`: Prettier와 충돌하는 스타일 규칙 비활성
- `@typescript-eslint/consistent-type-imports`: `import type` 강제
- `no-console`: `warn`/`error`만 허용
- 제외 경로: `dist/`, `node_modules/`, `src/api/schema.d.ts` (자동 생성)

### Prettier 설정 (`.prettierrc.json`)

single quote · semicolon · trailing comma all · printWidth 100 · tab 2 · arrow paren always.

## 디렉터리

```
web/
├── index.html
├── package.json
├── vite.config.ts              # /api, /healthz 프록시
├── Dockerfile                  # node:22-alpine → nginx-unprivileged
├── nginx.conf.template         # ${NKG_API_HOST} envsubst, SPA fallback
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # 상태: selectedId, visibleRelations
│   ├── styles.css              # 다크 테마, 레이아웃
│   ├── api/
│   │   ├── client.ts           # openapi-fetch 인스턴스
│   │   ├── graph.ts            # fetchGraph(), GraphNode/GraphLink 타입
│   │   └── schema.d.ts         # openapi-typescript 자동 생성 (커밋됨)
│   ├── components/
│   │   ├── GraphView.tsx       # force-graph + WebVOWL 렌더 + hull overlay
│   │   ├── RelationFilter.tsx  # 6 카테고리 토글 (클라이언트 필터)
│   │   └── DetailsPanel.tsx    # 우측 상세 패널 (노드 info + relation 목록)
│   └── lib/
│       ├── relationStyle.ts    # 11 relation → 색/선/화살표/카테고리 매핑
│       ├── graphIndex.ts       # degree, 인접 리스트, top-level, BFS
│       ├── canonicalEdges.ts   # inverse 쌍 merge (broader↔narrower → broader)
│       └── directionalForce.ts # 선택 노드 기준 방향별 행/열 배치 + 2차 이웃 recursive sub-sector
```

## Force Model

이후 변경은 feature branch에서 작업.

### Phase 1 — 초기 레이아웃

| 힘                 | 파라미터          | 역할                                            |
| ------------------ | ----------------- | ----------------------------------------------- |
| charge             | strength -800     | 노드 간 반발 → 겹침 방지                        |
| link (taxonomy)    | dist 50, str 0.8  | skos:broader, dcterms:hasPart → 빡빡한 클러스터 |
| link (dependency)  | dist 100, str 0.4 | dcterms:requires                                |
| link (association) | dist 200, str 0.1 | skos:related, dcterms:references → 느슨한 연결  |
| center             | 기본값            | 무게중심을 화면 중앙에                          |
| collision          | nodeVal = radius  | 원형 겹침 방지                                  |

### Phase 2 — 상호작용 (onEngineStop 이후)

| 변경               | 값                | 이유                                   |
| ------------------ | ----------------- | -------------------------------------- |
| charge strength    | -800 → **-150**   | 드래그 시 약한 반발만                  |
| charge distanceMax | 없음 → **250**    | 먼 노드 반발 차단                      |
| position memory    | **str 0.08**      | 각 노드를 수렴 위치(home)로 복원       |
| zoomToFit          | 400ms, padding 60 | **초기 1회만** 실행. 이후 줌 레벨 유지 |

**Position memory vs gravity**: 기존 gravity는 모든 노드를 (0,0) 절대 좌표로 당겨 드래그 시 전체 그래프를 수축시켰음. Position memory는 각 노드를 자신의 수렴 위치(home position)로 당기므로 드래그 시 나머지 노드가 제자리를 유지.

### Phase 3 — 노드 선택 시 Directional 배치 (`directionalForce.ts`)

노드를 클릭하면 해당 노드에 연결된 이웃이 관계 종류별 **방향·거리**로 자동 재배치.

**핵심 메커니즘**:

| 기능                                        | 설명                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **선택 노드 pin**                           | fx/fy 고정 → 섹터 기준점 안정                                                                                                                                                                          |
| **focused link force**                      | 선택 노드의 link distance/strength를 관계별 극단값으로 변경                                                                                                                                            |
| **directional force** (str 0.5)             | 이웃을 관계별 방향으로 행/열 배치                                                                                                                                                                      |
| **position memory 면제**                    | 1차+2차 이웃을 면제 → directional이 100% 작용                                                                                                                                                          |
| **2차 이웃 recursive sub-sector** (str 0.2) | 1차 이웃 B 주변에 2차 이웃 C를 sub-sector 그리드(SUB_GAP 50, SUB_COL 40, SUB_MAX 4)로 배치. B↔C 관계가 taxonomy/part-whole/dep/seq면 sub-sector, related/refs면 OUTER fallback (parent 섹터 바깥 80px) |
| **barycenter 정렬**                         | 섹터 행 내 노드를 연결 대상 평균 좌표로 정렬 → 엣지 교차 최소화                                                                                                                                        |
| **선택 해제**                               | directional 제거, 현재 위치를 새 home으로 저장 (복귀 안 함)                                                                                                                                            |

**방향 배치 (선택 노드 기준)**:

```
              parent1  parent2  parent3       ← UP (taxonomy parent, whole)
                  ─────────────────
  dep1            [    SELECTED    ]       next1    ← LEFT / RIGHT
  dep2            ─────────────────        next2
              child1  child2  child3       ← DOWN (taxonomy child, part)
```

- UP/DOWN: 가로 행 (colSpacing 55, 행당 최대 6, 넘으면 줄바꿈)
- LEFT/RIGHT: 세로 열 (colSpacing 45, 열당 최대 4, 넘으면 줄바꿈)
- OUTER: 방향 없음, link force의 focused distance(250~280)만으로 멀리 배치

**관계별 거리 우선순위 (가까운 순)**:

| 우선순위 | 관계                                  | 기본 dist | 포커스 dist | 방향                         |
| -------- | ------------------------------------- | --------- | ----------- | ---------------------------- |
| 1        | taxonomy (broader/narrower)           | 50        | 35          | UP(parent) / DOWN(child)     |
| 2        | part-whole (hasPart/isPartOf)         | 50        | 35          | DOWN(part) / UP(whole)       |
| 3        | sequence (nextItem/previousItem)      | 80        | 60          | RIGHT(next) / LEFT(prev)     |
| 4        | dependency (requires/isRequiredBy)    | 100       | 80          | LEFT(dep) / RIGHT(dependent) |
| 5        | reference (references/isReferencedBy) | 200       | 250         | OUTER                        |
| 6        | association (related)                 | 200       | 280         | OUTER                        |

**설계 판단 기록**:

- **Position memory가 아닌 directional force**: pin/unpin 접근은 모든 노드를 완전 고정해 로컬 충돌 회피까지 차단. 시뮬레이션 기반 force가 다른 힘과 자연스럽게 공존.
- **Gravity → position memory 교체**: (0,0) 절대 좌표 당김은 드래그 시 전체 수축 유발. home 기준 당김은 개별 노드 복원만.
- **이웃 면제 필요성**: directional(0.5)과 position memory(0.08)가 동시 작용 시 실효력 0.42로 충분해 보이지만, 목표 위치가 다르면 진동("헤엄") 발생. 면제가 유일한 해법.
- **2차 이웃 recursive sub-sector 필요성**: 단순 outer 편향은 2차 이웃이 부모 행 끝에 무질서하게 모임. 부모 B 기준 sub-sector 그리드(B↔C 관계 반영)로 배치하면 트리형 계층이 자연스럽게 형성. 강도 0.2 (1차 0.5의 40%)로 1차 위치 우선.
- **Barycenter 정렬**: Sugiyama 레이어드 레이아웃의 표준 기법. 행 내 노드를 연결 대상 평균 좌표로 정렬해 교차 최소화. force 생성 시 1회 계산.

## 시각 요소

### 노드

- 원형, degree 기반 크기 (`6 + 2 * log(1 + degree)`)
- Top-level Is-A: 진한 블루(`#3A4894`) + 흰 테두리
- 일반: `#5D6CC1`
- 선택: amber 링(`#fbbf24`), hover: gray 링
- Hover 시 비연결 노드/엣지 dim (alpha 0.15)

### 엣지

- relation별 색/선/화살표 (`lib/relationStyle.ts` 참조)
- canonicalEdges로 inverse 쌍 merge → pair-count 기반 curvature
- globalScale ≥ 1.2 에서 엣지 중앙에 relation 이름 속성 박스 표시

### Hull Overlay

- 아무것도 선택 안 함 → top-level Is-A 각각의 하위 BFS → 반투명 convex hull
- 노드 선택 → 해당 노드의 containment descendants만 hull
- `d3-polygon`의 `polygonHull` + centroid 기반 패딩

### 필터 바 (상단)

- 6 카테고리: Taxonomy, Part-Whole, Dependency, Reference, Association, Sequence
- 클라이언트 사이드 — 서버 재호출 없음, 시뮬레이션 불변 (linkCanvasObject에서 skip)

### 상세 패널 (우측 320px)

- 선택 노드: label, id, degree, summary, outgoing/incoming relations
- 빈 상태: 전체 통계 (노드 수, 엣지 수, top-level 수, relation 분포)

## Docker 배포

```bash
# 이미지 빌드
docker build -t harbor.leorca.org/nkg/nkg-web:latest .

# 실행 (nkg-api와 같은 네트워크)
docker run -d --name nkg-web --network nkg-net -p 18081:8080 \
  -e NKG_API_HOST=nkg-api:8080 \
  harbor.leorca.org/nkg/nkg-web:latest
```

`NKG_API_HOST`는 nginx envsubst로 치환. 기본값 `nkg-api:8080`.
