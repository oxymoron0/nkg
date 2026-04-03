# NKG — Notion Knowledge Graph MCP Server

## Project Overview

Notion "Knowledges" 데이터베이스를 SKOS/DCTERMS/Schema.org 온톨로지 기반 지식 그래프로 관리하는 stdio MCP 서버.

- **Language**: Go 1.25+
- **SDK**: github.com/mark3labs/mcp-go
- **Build**: `make build` (output: `./nkg`)

## Architecture

```
internal/
├── model/    # Layer 1: 데이터 모델 (의존 없음)
├── config/   # Layer 2: 설정 로더 (의존 없음)
├── client/   # Layer 3: HTTP 클라이언트 + 레이트 리미터
├── api/      # Layer 4: Notion REST API 래핑
└── tools/    # Layer 5: MCP 도구 등록 및 구현
main.go       # 서버 진입점
```

의존성은 항상 상위 레이어 → 하위 레이어 방향. 역방향 의존 금지.

## Git Convention

### Commit Message Format

```
<type>: <subject>

<optional body>
```

- **subject**: 영문 소문자, 50자 이내, 마침표 없음
- **body**: 변경의 "왜"를 설명, 72자 줄바꿈

### Commit Types

| Type | 용도 |
|------|------|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가/수정 |
| `docs` | 문서 변경 |
| `chore` | 빌드, 의존성, 설정 등 기능 외 변경 |
| `ci` | CI/CD 파이프라인 변경 |

### Commit Scope Rules

- 하나의 커밋은 하나의 논리적 변경만 포함
- 레이어를 넘는 변경은 의존성 순서(leaf-first)로 분리
- `.gitignore`, `Makefile`, `go.mod` 등 scaffold 변경은 `chore` 타입

### Branch Strategy

- `main`: 릴리스 브랜치, 직접 push 가능 (1인 프로젝트)
- feature 브랜치 필요 시: `feat/<name>` 형식

## Secrets & Ignored Files

아래 파일은 절대 커밋하지 않는다 (`.gitignore`로 차단됨):

| 경로 | 내용 |
|------|------|
| `/config/config.json` | Notion API token, Database ID |
| `token/` | 인증 토큰 파일 |
| `.mcp.json` | 로컬 MCP 서버 경로 (절대 경로 포함) |
| `nkg`, `*.exe` | 빌드 바이너리 |
| `.playwright-mcp/` | 테스트 아티팩트 |

## MCP Tools (8종)

| 도구 | 설명 |
|------|------|
| `query_pages` | 제목으로 페이지 검색 |
| `get_page` | 페이지 상세 조회 (관계 포함) |
| `create_page` | 지식 항목 생성 |
| `update_page` | 속성 수정 |
| `delete_page` | 아카이브 (soft delete) |
| `link_pages` | 관계 추가 |
| `unlink_pages` | 관계 제거 |
| `traverse_graph` | 그래프 탐색 (BFS/DFS) |

## Ontology

관계 유형의 상세 정의, 판별 기준, 혼동 방지 규칙은 `~/.claude/rules/common/nkg-ontology.md`를 따른다.

## Rate Limiting

Notion API 제한: 3 req/sec. 토큰 버킷 + 429/5xx 시 지수 백오프 재시도 내장.
