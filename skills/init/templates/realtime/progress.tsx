"use client";

import { useRealtimeRun } from "@trigger.dev/react-hooks";

export function Progress({ runId, token }: { runId: string; token: string }) {
  const { run, error } = useRealtimeRun(runId, {
    accessToken: token,
    skipColumns: ["payload", "output"], // a status UI rarely needs these
  });
  if (error) return <div>Error: {error.message}</div>;
  if (!run) return <div>Waiting…</div>;
  const progress = (run.metadata as { progress?: number } | undefined)?.progress ?? 0;
  return <div>{run.status}: {progress}%</div>;
}
