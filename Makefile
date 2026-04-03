.PHONY: build clean

build:
	go build -o nkg .

clean:
	rm -f nkg
