# NKG — Notion Knowledge Graph

## Project Overview

Notion "Knowledges" 데이터베이스를 SKOS/DCTERMS/Schema.org 온톨로지 기반 지식 그래프로 관리하는 프로젝트. 세 가지 바이너리로 구성:

| 바이너리 | 경로 | 역할 |
|----------|------|------|
| `nkg` | `cmd/nkg` | stdio MCP 서버 (Claude 연동) |
| `nkg-api` | `cmd/api` | HTTP REST API 서버 (웹 프런트엔드용) |
| `nkg-web` | `web/` | WebVOWL 스타일 그래프 시각화 (Vite + React) |

- **Language**: Go 1.25+ (백엔드), TypeScript + React 18 (프런트엔드)
- **Build**: `make all` (Go 바이너리), `cd web && npm run build` (프런트엔드)

## Architecture

```
cmd/
├── nkg/main.go              # MCP 서버 진입점
└── api/main.go              # HTTP API 서버 진입점 (graceful shutdown)

internal/
├── model/                   # Layer 1: 데이터 모델 + RDF 상수
├── config/                  # Layer 2: 설정 로더 (APIPort 포함)
├── client/                  # Layer 3: Notion HTTP 클라이언트 + 레이트 리미터
├── jena/                    # Layer 3: Jena SPARQL HTTP 클라이언트
├── api/                     # Layer 4: Notion REST API 래핑
├── rdf/                     # Layer 4: RDF 직렬화, SPARQL 빌더, 결과 파서
├── sync/                    # Layer 5: Notion ↔ Jena 양방향 동기화
├── handler/                 # Layer 5: HTTP 핸들러 (REST API + Swagger UI)
│   ├── handler.go           # Server struct, 라우터, CORS, JSON 헬퍼
│   ├── pages.go             # GET /api/v1/pages, GET /api/v1/pages/{id}
│   ├── graph.go             # GET /api/v1/graph (N+1 제거 최적화 적용)
│   ├── relations.go         # POST/DELETE /api/v1/pages/{id}/relations
│   ├── sync.go              # POST /api/v1/sync, GET /api/v1/sync/status
│   ├── docs.go              # GET /api/v1/docs (Swagger UI), GET /api/v1/openapi.yaml
│   └── openapi.yaml         # OpenAPI 3.0.3 스펙 (go:embed)
└── tools/                   # Layer 5: MCP 도구 등록 및 구현

web/                         # 프런트엔드 (별도 README 참조)
├── src/
│   ├── components/          # GraphView, RelationFilter, DetailsPanel
│   ├── lib/                 # relationStyle, graphIndex, canonicalEdges
│   └── api/                 # openapi-fetch 클라이언트 + 자동 생성 타입
├── Dockerfile               # node:22-alpine → nginx-unprivileged
└── nginx.conf.template      # API 프록시, SPA fallback

Dockerfile                   # Go API 서버 (golang:1.25-alpine → distroless)
```

의존성은 항상 상위 레이어 → 하위 레이어 방향. 역방향 의존 금지.

## SSOT Decision

- **Notion이 읽기/쓰기 양쪽의 single source of truth.** Notion UI 직접 편집이 주 흐름이므로 실시간 정합성 우선.
- **Jena는 파생 미러(derived mirror).** 쓰기 시점 보상 트랜잭션(LinkWithSync/UnlinkWithSync) + 수동 sync(POST /api/v1/sync)로 유지. `/api/v1/graph` 읽기 경로에서 Jena를 거치지 않는다.
- 재검토 기준: Notion 최적화 실측 5s 초과 또는 페이지 수 1000 이상.

## HTTP API

8 엔드포인트 + Swagger UI. 응답 형식: `{"data": <payload>}` 또는 `{"error": {"code": "...", "message": "..."}}`.

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/healthz` | 헬스 체크 |
| `GET` | `/api/v1/docs` | Swagger UI |
| `GET` | `/api/v1/openapi.yaml` | OpenAPI 3.0.3 스펙 |
| `GET` | `/api/v1/graph` | 전체 그래프 (노드+엣지, ~1.5초) |
| `GET` | `/api/v1/pages` | 페이지 목록 (`?name=`, `?limit=`) |
| `GET` | `/api/v1/pages/{id}` | 페이지 상세 (관계 포함) |
| `POST` | `/api/v1/pages/{id}/relations` | 관계 추가 (Notion+Jena 트랜잭션) |
| `DELETE` | `/api/v1/pages/{id}/relations` | 관계 삭제 (멱등, Notion+Jena 트랜잭션) |
| `POST` | `/api/v1/sync` | Notion→Jena 동기화 (Jena 설정 시만) |
| `GET` | `/api/v1/sync/status` | Notion↔Jena 상태 비교 (Jena 설정 시만) |

`/api/v1/graph`는 `api.QueryPages` 한 번으로 전체 nodes+edges를 빌드 (N+1 fan-out 제거). `has_more` 플래그가 있는 relation property만 `GetRelationPropertyIDs`로 재조회.

상세 문서: `docs/API.md`

## Web Frontend

WebVOWL 에서 영감을 받은 지식 그래프 시각화. `react-force-graph-2d` 위에 canvas 커스텀 렌더링.

### Force Model

Two-phase force 시뮬레이션 + 선택 시 directional 배치.

**Phase 1 — 초기 레이아웃**:

| 힘 | 역할 | 파라미터 |
|---|---|---|
| charge | 척력 (겹침 방지) | -800 |
| link | 스프링 (관계별 차등) | taxonomy: dist 50/str 0.8, related: dist 200/str 0.1 |
| center | 무게중심 유지 | 기본값 |
| collision | nodeVal 기반 | radius (nodeRadius 함수) |

**Phase 2 — 상호작용 (onEngineStop 이후)**:

| 변경 | 값 | 이유 |
|------|-----|------|
| charge | -800 → -150 + distMax 250 | 드래그 시 먼 노드 반발 차단 |
| positionMemory | str 0.08 | 각 노드를 수렴 위치(home)로 복원. gravity(절대 (0,0) 당김)가 아닌 개별 home 방향 복원 |
| zoomToFit | 초기 1회만 | 이후 줌 레벨 유지 |

**노드 선택 시 — Directional 배치**:

| 기능 | 설명 |
|------|------|
| focused link force | 선택 노드의 link distance/strength를 관계별 극단값으로 변경 (taxonomy 35/1.0, related 280/0.15) |
| 선택 노드 pin | fx/fy 고정 → 섹터 기준점 안정 |
| directional force | 이웃을 관계별 방향으로 행/열 배치. UP=상위(parent,whole), DOWN=하위(child,part), LEFT=선행(dependency,prev), RIGHT=후행(dependent,next), OUTER=연관(related,ref) |
| 행/열 그리드 | 둥글게 퍼지지 않고 가로 행(UP/DOWN) 또는 세로 열(LEFT/RIGHT)로 나열. 다수 시 자동 줄바꿈 |
| barycenter 정렬 | 섹터 내 노드를 연결 대상 평균 좌표로 정렬 → 행 내 엣지 교차 최소화 (Sugiyama 기법) |
| position memory 면제 | 1차+2차 이웃을 면제하여 directional이 100% 작용 (면제 안 하면 0.08이 0.5을 73% 흡수해 수렴 극도로 느림) |
| 2차 이웃 편향 | 1차 이웃의 연결 노드(2차)를 해당 섹터 바깥 방향으로 약한 편향(0.15) → 엣지가 선택 노드를 관통하지 않음 |
| 선택 해제 | directional 제거, 현재 위치를 새 home으로 저장 (복귀 안 함) |

**관계별 거리 우선순위 (가까운 순)**:

| 우선순위 | 관계 | 기본 dist | 포커스 dist | 방향 |
|----------|------|----------|-----------|------|
| 1 | taxonomy (broader/narrower) | 50 | 35 | UP(parent) / DOWN(child) |
| 2 | part-whole (hasPart/isPartOf) | 50 | 35 | DOWN(part) / UP(whole) |
| 3 | sequence (nextItem/previousItem) | 80 | 60 | RIGHT(next) / LEFT(prev) |
| 4 | dependency (requires/isRequiredBy) | 100 | 80 | LEFT(dep) / RIGHT(dependent) |
| 5 | reference (references/isReferencedBy) | 200 | 250 | OUTER |
| 6 | association (related) | 200 | 280 | OUTER |

### 시각 요소

- **노드**: degree 기반 원형, top-level Is-A 구분 (진한 블루 + 흰 테두리)
- **엣지**: relation별 색/선/화살표 구분 (relationStyle.ts), canonicalEdges로 inverse 쌍 merge
- **속성 박스**: 엣지 중앙에 relation 이름 표시 (globalScale ≥ 1.2)
- **Hull**: top-level Is-A 하위 BFS → 반투명 convex hull 오버레이
- **필터 바**: 6 카테고리 토글 (클라이언트 사이드, 시뮬레이션 불변)
- **상세 패널**: 우측 320px, 선택 노드 정보 + relation 네비게이션

### 개발

```bash
cd web
npm install
npm run dev                    # http://localhost:5173 (API → :18080 프록시)
npm run gen:api                # openapi.yaml → schema.d.ts 재생성
npm run build                  # tsc + vite build → dist/
```

## Docker / Harbor

| 이미지 | Dockerfile | Harbor 경로 |
|--------|-----------|-------------|
| `nkg-api` | `./Dockerfile` | `harbor.leorca.org/nkg/nkg-api` |
| `nkg-web` | `web/Dockerfile` | `harbor.leorca.org/nkg/nkg-web` |

```bash
# API 서버
docker run -d --name nkg-api -p 18080:8080 \
  -v "$PWD/config:/app/config:ro" -v "$PWD/token:/app/token:ro" \
  harbor.leorca.org/nkg/nkg-api:latest

# Web (nginx, API 프록시)
docker run -d --name nkg-web --network nkg-net -p 18081:8080 \
  -e NKG_API_HOST=nkg-api:8080 \
  harbor.leorca.org/nkg/nkg-web:latest
```

## Git Convention

### Commit Message Format

```
<type>(<scope>): <subject>

<optional body>
```

Types: feat, fix, refactor, perf, test, docs, chore, ci, style
Scope: web, api, 또는 생략

### Branch Strategy

- `main`: 안정 브랜치. `fa5292a` 이후 web/ 변경은 feature branch 필수.
- Feature branch: `feat/<name>` → 브라우저 검증 후 main merge.
- 백엔드 단순 변경 (Go 코드, docs)은 main 직접 push 가능.

## Secrets & Ignored Files

| 경로 | 내용 |
|------|------|
| `/config/config.json` | Notion API token, Database ID, Jena 인증 정보 |
| `token/` | 인증 토큰 파일 |
| `.mcp.json` | 로컬 MCP 서버 경로 (절대 경로 포함) |
| `/nkg`, `/nkg-api`, `*.exe` | 빌드 바이너리 |
| `.playwright-mcp/` | 테스트 아티팩트 |
| `web/node_modules`, `web/dist` | 프런트엔드 빌드 아티팩트 |

## MCP Tools (11종)

| 도구 | 설명 |
|------|------|
| `query_pages` | 제목으로 페이지 검색 |
| `get_page` | 페이지 상세 조회 (관계 포함) |
| `create_page` | 지식 항목 생성 |
| `update_page` | 속성 수정 |
| `delete_page` | 아카이브 (soft delete) |
| `link_pages` | 관계 추가 (Jena 자동 동기화) |
| `unlink_pages` | 관계 제거 (Jena 자동 동기화) |
| `traverse_graph` | 그래프 탐색 (BFS/DFS) |
| `sync_to_jena` | Notion → Jena 동기화 (full/incremental) |
| `sync_from_jena` | Jena → Notion 트랜잭션 동기화 (link/unlink) |
| `sync_status` | Notion ↔ Jena 상태 비교 |

## Jena Integration

- **Endpoint**: `https://jena.leorca.org/ds/` (Fuseki 5.1.0)
- **Named Graph**: `<http://knowledge.local/graph/nkg>`
- **Notion → Jena**: link/unlink 시 자동 동기화 + sync_to_jena로 full/incremental
- **Jena → Notion**: sync_from_jena로 보상 트랜잭션

## Ontology

관계 유형의 상세 정의, 판별 기준, 혼동 방지 규칙은 `~/.claude/rules/common/nkg-ontology.md`를 따른다.

## Rate Limiting

Notion API 제한: 3 req/sec. 토큰 버킷 + 429/5xx 시 지수 백오프 재시도 내장.
