.PHONY: build build-api clean all

build:
	go build -o nkg ./cmd/nkg

build-api:
	go build -o nkg-api ./cmd/api

all: build build-api

clean:
	rm -f nkg nkg-api
