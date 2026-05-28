"use client";
import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

export function XtermShell({ appId }: { appId: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      theme: { background: "#09090b", foreground: "#e4e4e7" },
      cursorBlink: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/apps/${appId}/shell`);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      term.onData((d) => ws.send(d));
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        term.write(e.data);
      } else {
        term.write(new Uint8Array(e.data as ArrayBuffer));
      }
    };
    ws.onclose = () => term.write("\r\n[connection closed]\r\n");
    ws.onerror = () => term.write("\r\n[connection error]\r\n");

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      ws.close();
      term.dispose();
    };
  }, [appId]);

  return <div ref={containerRef} className="h-[70vh] rounded-md overflow-hidden border bg-zinc-950" />;
}
