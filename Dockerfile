# syntax=docker/dockerfile:1.7

FROM golang:1.25-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/nkg-api \
    ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app

# go.mod is kept in the runtime image so config.FindProjectRoot can locate
# /app as the project root. config/ and token/ are mounted at runtime.
COPY --from=builder /src/go.mod /app/go.mod
COPY --from=builder /out/nkg-api /app/nkg-api

EXPOSE 8080

USER nonroot:nonroot
ENTRYPOINT ["/app/nkg-api"]
