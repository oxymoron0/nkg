# NKG Web Frontend

Notion Knowledge Graph 웹 시각화 (Vite + React + TypeScript).

NKG HTTP API (`cmd/api` 바이너리)의 `/api/v1/graph` 엔드포인트에서
전체 지식 그래프를 가져와 force-directed 레이아웃으로 렌더링한다.

## 요구 사항

- Node 18+ (권장: Node 20 이상)
- 로컬 또는 원격에서 실행 중인 NKG API 서버

## 설치

```bash
cd web
npm install
```

## 개발 서버

```bash
# 기본: API는 http://localhost:18080 로 프록시됨
npm run dev

# API가 다른 곳에서 돌고 있을 때
NKG_API_URL=http://other-host:8080 npm run dev
```

Vite 개발 서버는 `:5173`에서 열리며, `/api/*`와 `/healthz` 요청은
`NKG_API_URL` 로 지정된 NKG API 서버로 프록시된다. CORS 설정
없이도 바로 동작한다.

## 빌드

```bash
npm run build     # tsc + vite build → dist/
npm run preview   # dist/ 를 로컬 정적 서버로 확인
```

## API 타입 재생성

백엔드 `internal/handler/openapi.yaml` 이 변경되면 타입을 다시
생성한다.

```bash
npm run gen:api
```

생성된 타입은 `src/api/schema.d.ts`에 저장되며 커밋되어 있어
첫 클론 후에도 별도 단계 없이 `npm run dev` / `build` 가 동작한다.

## 디렉터리

```
web/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts          # /api, /healthz 프록시
├── src/
│   ├── main.tsx
│   ├── App.tsx             # 상태/에러/로딩 + 헤더
│   ├── styles.css
│   ├── api/
│   │   ├── client.ts       # openapi-fetch 인스턴스
│   │   ├── graph.ts        # /api/v1/graph 호출 및 정규화
│   │   └── schema.d.ts     # openapi-typescript 로 자동 생성
│   └── components/
│       └── GraphView.tsx   # react-force-graph-2d 래퍼
```

## API 사용

`src/api/client.ts` 는 `openapi-fetch` 기반의 타입 안전 클라이언트를
내보낸다. 새 엔드포인트를 사용할 때는 `api.GET('/api/v1/pages', ...)`
형태로 호출하면 `schema.d.ts`의 타입이 자동 적용된다.

NKG API의 응답은 `{ data: <payload> }` envelope을 사용하므로,
호출부에서는 한 단계 언래핑이 필요하다. `src/api/graph.ts` 의
`fetchGraph` 구현을 참고한다.
