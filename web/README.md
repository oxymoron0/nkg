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
npm run build      # tsc + vite build → dist/
npm run preview    # dist/ 로컬 정적 서버
npm run gen:api    # openapi.yaml → src/api/schema.d.ts 타입 재생성
```

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
│       └── canonicalEdges.ts   # inverse 쌍 merge (broader↔narrower → broader)
```

## Force Model

안정 기준점: `fa5292a`. 이후 변경은 feature branch에서 작업.

### Phase 1 — 초기 레이아웃

| 힘 | 파라미터 | 역할 |
|---|---|---|
| charge | strength -800 | 노드 간 반발 → 겹침 방지 |
| link (taxonomy) | dist 50, str 0.8 | skos:broader, dcterms:hasPart → 빡빡한 클러스터 |
| link (dependency) | dist 100, str 0.4 | dcterms:requires |
| link (association) | dist 200, str 0.1 | skos:related, dcterms:references → 느슨한 연결 |
| center | 기본값 | 무게중심을 화면 중앙에 |
| collision | nodeVal = radius | 원형 겹침 방지 |

### Phase 2 — 상호작용 (onEngineStop 이후)

| 변경 | 값 | 이유 |
|------|-----|------|
| charge strength | -800 → **-150** | 드래그 시 약한 반발만 |
| charge distanceMax | 없음 → **250** | 먼 노드 반발 차단 |
| position memory | **str 0.08** | 각 노드를 수렴 위치로 복원 (gravity 대체) |
| zoomToFit | 400ms, padding 60 | 초기 뷰포트 맞춤 |

**Position memory vs gravity**: 기존 gravity는 모든 노드를 (0,0) 절대 좌표로 당겨 드래그 시 전체 그래프를 수축시켰음. Position memory는 각 노드를 자신의 수렴 위치(home position)로 당기므로 드래그 시 나머지 노드가 제자리를 유지.

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
