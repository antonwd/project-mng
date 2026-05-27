BIN_DIR        ?= bin
HELPER_BIN     ?= $(BIN_DIR)/projectmng-helper
CLI_BIN        ?= $(BIN_DIR)/projectmng-helper-cli
GOFLAGS        ?= -trimpath
LDFLAGS        ?= -s -w

.PHONY: all build test test-integration tidy fmt vet lint clean install

all: build

build:
	mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 go build $(GOFLAGS) -ldflags '$(LDFLAGS)' -o $(HELPER_BIN) ./cmd/projectmng-helper
	CGO_ENABLED=0 go build $(GOFLAGS) -ldflags '$(LDFLAGS)' -o $(CLI_BIN) ./cmd/projectmng-helper-cli

test:
	go test ./...

test-integration:
	go test -tags=integration ./...

tidy:
	go mod tidy

fmt:
	gofmt -w -s .

vet:
	go vet ./...

lint: fmt vet

clean:
	rm -rf $(BIN_DIR) dist

install: build
	install -D -m 0755 $(HELPER_BIN) $(DESTDIR)/usr/local/bin/projectmng-helper
	install -D -m 0644 systemd/projectmng-helper.service $(DESTDIR)/etc/systemd/system/projectmng-helper.service
	install -D -m 0644 systemd/projectmng-helper.tmpfiles $(DESTDIR)/usr/lib/tmpfiles.d/projectmng-helper.conf
