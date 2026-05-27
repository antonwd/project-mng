// projectmng-helper-cli is a developer/debug client for the helper socket.
// It is not intended for production use; the real client is the platform's
// pm-api / pm-worker.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"time"

	"github.com/projectmng/projectmng/apps/helper/internal/helper"
)

func main() {
	socket := flag.String("socket", "/run/projectmng/helper.sock", "path to helper Unix socket")
	timeout := flag.Duration("timeout", 30*time.Second, "round-trip timeout")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: projectmng-helper-cli [--socket PATH] [--timeout DUR] <command> [<json-params>]")
		flag.PrintDefaults()
	}
	flag.Parse()
	args := flag.Args()
	if len(args) < 1 {
		flag.Usage()
		os.Exit(2)
	}
	command := args[0]
	var params json.RawMessage
	if len(args) >= 2 {
		if !json.Valid([]byte(args[1])) {
			fmt.Fprintln(os.Stderr, "params: not valid JSON")
			os.Exit(2)
		}
		params = json.RawMessage(args[1])
	}

	conn, err := net.Dial("unix", *socket)
	if err != nil {
		fmt.Fprintln(os.Stderr, "dial:", err)
		os.Exit(1)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(*timeout))

	req := helper.Request{Command: command, Params: params}
	payload, err := json.Marshal(req)
	if err != nil {
		fmt.Fprintln(os.Stderr, "marshal:", err)
		os.Exit(1)
	}
	if err := helper.WriteFrame(conn, payload); err != nil {
		fmt.Fprintln(os.Stderr, "write:", err)
		os.Exit(1)
	}
	respBytes, err := helper.ReadFrame(conn)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read:", err)
		os.Exit(1)
	}
	var resp helper.Response
	if err := json.Unmarshal(respBytes, &resp); err != nil {
		fmt.Fprintln(os.Stderr, "unmarshal:", err)
		os.Exit(1)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(resp)
	if !resp.OK {
		os.Exit(1)
	}
}
