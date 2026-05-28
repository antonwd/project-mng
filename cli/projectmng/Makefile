BIN ?= bin/projectmng
GOFLAGS := -trimpath -ldflags="-s -w -buildid="

.PHONY: build test fmt vet

build:
	@mkdir -p bin
	go build $(GOFLAGS) -o $(BIN) ./cmd/projectmng

test:
	go test ./...

fmt:
	go fmt ./...

vet:
	go vet ./...
