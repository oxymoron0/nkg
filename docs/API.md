# NKG HTTP API

REST API for the Notion Knowledge Graph — web visualization and CRUD
operations against a Notion `Knowledges` database backed by
SKOS / DCTERMS / Schema.org ontology.

The server binary is `cmd/api` (built as `nkg-api`). It wraps the Notion
REST API and, when a Jena endpoint is configured, keeps a Jena SPARQL
store in sync via compensating transactions.

## Base URL

The server binds to `:${api_port}` (default `8080`) as specified in
`config/config.json`. All paths below are relative to that base URL.

## Interactive documentation (Swagger UI)

| Path | Description |
|------|-------------|
| `GET /api/v1/docs` | Swagger UI — try endpoints interactively |
| `GET /api/v1/openapi.yaml` | OpenAPI 3.0.3 spec (YAML) |

The Swagger UI page loads `swagger-ui-dist` from `unpkg.com`, so the
browser that opens `/api/v1/docs` needs internet access. The API
itself does not make any outbound calls when serving the page.

## Response envelope

```json
// success
{"data": <payload>}

// error
{"error": {"code": "Bad Request", "message": "..."}}
```

Success responses always wrap the payload inside a `data` key. Error
responses never include a `data` key, and the error body includes a
human-readable `code` (HTTP status text) and `message`.

Internal errors (HTTP 500) return an opaque message — the real error
is logged server-side only to avoid leaking Notion / Jena internals.

## Endpoints

### System

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Liveness probe |
| GET | `/api/v1/docs` | Swagger UI |
| GET | `/api/v1/openapi.yaml` | OpenAPI 3.0.3 spec |

### Graph

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/graph` | Full knowledge graph (nodes + edges + meta) |

Query parameters:

- `relations` — comma-separated list of relation names to include
  (e.g. `?relations=skos:broader,dcterms:hasPart`). Omit to include
  every relation.

Response (`data`):

```json
{
  "nodes": [
    {"id": "...", "label": "...", "summary": "...", "group": "concept"}
  ],
  "edges": [
    {
      "id": "<source>|<relation>|<target>",
      "source": "...",
      "target": "...",
      "label": "skos:broader",
      "relation": "skos:broader"
    }
  ],
  "meta": {
    "node_count": 135,
    "edge_count": 312,
    "relations": ["dcterms:hasPart", "skos:broader", "skos:related"]
  }
}
```

The `edges` list is deduplicated and only contains edges whose target
exists in the same `nodes` list (no dangling references). The graph
endpoint fans out `N` sequential Notion API calls — expect it to be
slow for large databases (~seconds for 100+ pages).

### Pages

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/pages` | List page summaries |
| GET | `/api/v1/pages/{id}` | Single page with relations |

`GET /api/v1/pages` query parameters:

- `name` — title filter (substring unless `exact=true`)
- `exact` — `true` / `false`. When `true`, `name` must match exactly.
- `limit` — non-negative integer. `0` means no limit. Invalid values
  return `400 Bad Request`.

Response (`data`):

```json
{
  "count": 3,
  "pages": [
    {
      "id": "...",
      "name": "Kubernetes",
      "summary": "Container orchestration platform.",
      "last_edited_time": "2026-03-21T10:42:00.000Z"
    }
  ]
}
```

`GET /api/v1/pages/{id}` returns the full page plus a `relations` map
keyed by relation name.

```json
{
  "id": "...",
  "name": "Kubernetes",
  "summary": "...",
  "last_edited_time": "2026-03-21T10:42:00.000Z",
  "relations": {
    "skos:broader": [{"id": "...", "name": "Container Orchestration"}],
    "dcterms:hasPart": [{"id": "...", "name": "kubectl"}]
  }
}
```

Empty relation buckets are omitted.

### Relations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/pages/{id}/relations` | Add relation (link) |
| DELETE | `/api/v1/pages/{id}/relations` | Remove relation (unlink) |

Request body (identical for POST and DELETE):

```json
{
  "target_id": "<notion page uuid>",
  "relation": "skos:broader"
}
```

`relation` must be one of the known ontology relation names:

- `skos:broader` / `skos:narrower`
- `dcterms:hasPart` / `dcterms:isPartOf`
- `dcterms:requires` / `dcterms:isRequiredBy`
- `dcterms:references` / `dcterms:isReferencedBy`
- `skos:related`
- `schema:previousItem` / `schema:nextItem`

Response (`data`):

```json
{
  "linked": true,            // POST only
  "unlinked": true,          // DELETE only
  "from": "<id>",
  "to": "<target_id>",
  "relation": "skos:broader",
  "jena_synced": true,
  "already_existed": false,  // POST: target already linked (200)
  "already_absent": false    // DELETE: target already absent (200)
}
```

**Transactional semantics**: when a Jena endpoint is configured, the
POST/DELETE handlers call into `internal/sync.LinkWithSync` /
`UnlinkWithSync`, which wrap the Notion + Jena updates in a
compensating transaction. On Notion failure the Jena write is rolled
back.

**Idempotency**: DELETE is idempotent — removing an already-absent
relation returns `200` with `already_absent: true` and makes no
Notion API call (saves rate-limit quota).

Notion's dual-property feature automatically maintains inverse
relations, so you only set one side (e.g. `skos:broader`) and
`skos:narrower` is populated automatically.

### Sync

These routes are only registered when `jena_endpoint` is set in
`config/config.json`. Otherwise they return `404 Not Found`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/sync` | Notion → Jena (full or incremental) |
| GET | `/api/v1/sync/status` | Diff Notion vs Jena state |

`POST /api/v1/sync` body:

```json
{"mode": "full"}
// or
{"mode": "incremental"}
// or send no body for the incremental default
```

Unknown modes return `400 Bad Request`. Malformed JSON also returns
`400` — an empty body is treated as incremental.

Response (`data`):

```json
{
  "mode": "incremental",
  "synced": 42,
  "errors": ["page XYZ: rate limited"] // present only on partial failure
}
```

`GET /api/v1/sync/status` response (`data`):

```json
{
  "consistent": false,
  "notion_only": 2,
  "jena_only": 0,
  "notion_only_details": ["<page id>", "<page id>"]
}
```

⚠️ **Slow**: the status endpoint iterates every Notion page and runs
SPARQL queries against Jena. Do not poll it from the frontend.

## CORS

All endpoints return permissive CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` preflight requests return `204 No Content`.

## Example usage

```bash
# Full graph for visualization
curl http://localhost:8080/api/v1/graph | jq .data.meta

# Filter to only broader/hasPart edges
curl 'http://localhost:8080/api/v1/graph?relations=skos:broader,dcterms:hasPart' \
    | jq '.data.meta'

# Find pages by name
curl 'http://localhost:8080/api/v1/pages?name=Kubernetes&exact=true' | jq .

# Page detail
PAGE_ID=abc123...
curl "http://localhost:8080/api/v1/pages/$PAGE_ID" | jq .data.relations

# Link two pages (A → broader B)
curl -X POST "http://localhost:8080/api/v1/pages/$A_ID/relations" \
    -H 'Content-Type: application/json' \
    -d "{\"target_id\": \"$B_ID\", \"relation\": \"skos:broader\"}"

# Incremental sync
curl -X POST http://localhost:8080/api/v1/sync \
    -H 'Content-Type: application/json' \
    -d '{"mode": "incremental"}'
```

## Running the server

```bash
# Local build
make build-api        # produces ./nkg-api
./nkg-api             # reads config/config.json + token/notion.token

# Docker
docker run --rm -p 8080:8080 \
    -v "$(pwd)/config:/app/config:ro" \
    -v "$(pwd)/token:/app/token:ro" \
    harbor.leorca.org/nkg/nkg-api:latest
```

Mount the host `config/` and `token/` directories at `/app/config` and
`/app/token` so `config.FindProjectRoot` resolves `/app` as the project
root inside the container (the image also includes a copy of `go.mod`
to anchor the lookup).

Graceful shutdown: the server traps `SIGINT`/`SIGTERM` and drains
in-flight requests for up to 30 seconds before exiting.
