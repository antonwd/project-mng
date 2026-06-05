"use client";
import { useEffect, useRef, useState } from "react";

type Props = { deploymentId: string; initialLines: string[]; status: string };

export function DeploymentLogs({ deploymentId, initialLines, status }: Props) {
  const [lines, setLines] = useState<string[]>(initialLines);
  const ref = useRef<HTMLDivElement | null>(null);
  const isTerminal = status === "succeeded" || status === "failed";

  useEffect(() => {
    if (isTerminal) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/deployments/${deploymentId}/logs/ws`);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { stream: string; line: string };
        setLines((prev) => [...prev, `[${data.stream}] ${data.line}`]);
      } catch {
        setLines((prev) => [...prev, e.data]);
      }
    };
    return () => ws.close();
  }, [deploymentId, isTerminal]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div ref={ref} className="font-mono text-xs bg-zinc-950 text-zinc-100 rounded-md p-4 min-h-[40vh] max-h-[70vh] overflow-y-auto overflow-x-auto">
      {lines.length === 0 ? (
        <div className="text-zinc-500">Waiting for logs…</div>
      ) : (
        lines.map((l, i) => <div key={i} className="whitespace-pre">{l}</div>)
      )}
    </div>
  );
}
