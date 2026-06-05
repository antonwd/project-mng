"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HelpHint } from "@/components/common/help-hint";
import { listInstallationRepos, type Installation, type Repo } from "@/actions/github";
import { createAppAction } from "@/actions/apps";

type Props = { installations: Installation[] };

function deriveSlug(repoFullName: string): string {
  const name = repoFullName.split("/").pop() ?? "";
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

export function NewAppWizard({ installations }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [installationId, setInstallationId] = useState<string>(installations[0]?.id.toString() ?? "");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [slug, setSlug] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [buildRoot, setBuildRoot] = useState(".");
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startTransition] = useTransition();

  async function loadRepos(id: string) {
    if (!id) return;
    setReposLoading(true);
    setError(null);
    try {
      const r = await listInstallationRepos(id);
      setRepos(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReposLoading(false);
    }
  }

  // Initial load for the default installation. Runs once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (installationId) void loadRepos(installationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickInstallation(id: string) {
    setInstallationId(id);
    setSelectedRepo("");
    setRepos([]);
    void loadRepos(id);
  }

  function pickRepo(fullName: string) {
    setSelectedRepo(fullName);
    setSlug(deriveSlug(fullName));
    const repo = repos.find((r) => r.fullName === fullName);
    if (repo) setDefaultBranch(repo.defaultBranch);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createAppAction({
        slug,
        githubInstallationId: installationId,
        githubRepoFullName: selectedRepo,
        defaultBranch,
        buildRoot,
        autoDeploy,
      });
      if (res.error) setError(res.error);
      else if (res.slug) router.push(`/apps/${res.slug}`);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New app</h1>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>1. Pick a repository</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="flex items-center gap-1">
                GitHub installation
                <HelpHint>
                  Which installed GitHub App org/user account to fetch repos from. Install the projectMng app on more accounts to see them here.
                </HelpHint>
              </Label>
              <Select value={installationId} onValueChange={(v) => pickInstallation(v ?? "")}>
                <SelectTrigger>
                  <SelectValue>
                    {(value: string | null) =>
                      value
                        ? installations.find((i) => i.id.toString() === value)?.account ?? value
                        : "Choose installation"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {installations.map((i) => (
                    <SelectItem key={i.id} value={i.id.toString()}>{i.account}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Repository</Label>
              {reposLoading ? (
                <div className="text-sm text-muted-foreground py-2">Loading repos…</div>
              ) : (
                <Select value={selectedRepo} onValueChange={(v) => pickRepo(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue>
                      {(value: string | null) =>
                        value
                          ? repos.find((r) => r.fullName === value)?.fullName ?? value
                          : "Choose repo"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((r) => (
                      <SelectItem key={r.id} value={r.fullName}>{r.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button onClick={() => setStep(2)} disabled={!selectedRepo}>Continue</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>2. Configure</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="slug" className="flex items-center gap-1">
                Slug (used as subdomain + container name)
                <HelpHint>
                  Lowercase letters, digits, hyphens. Becomes <code className="font-mono">{"{slug}.<your-host>"}</code> and the Docker container name.
                </HelpHint>
              </Label>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="branch" className="flex items-center gap-1">
                Default branch
                <HelpHint>The branch that <strong>Deploy latest</strong> and auto-deploy build from.</HelpHint>
              </Label>
              <Input id="branch" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="buildRoot" className="flex items-center gap-1">
                Build root
                <HelpHint>Path inside the repo where the build runs. <code className="font-mono">.</code> = repo root.</HelpHint>
              </Label>
              <Input id="buildRoot" value={buildRoot} onChange={(e) => setBuildRoot(e.target.value)} />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <Label htmlFor="autoDeploy" className="flex items-center gap-1">
                  Auto-deploy on push
                  <HelpHint>Off by default. When on, every push to the default branch triggers a deploy.</HelpHint>
                </Label>
              </div>
              <Switch id="autoDeploy" checked={autoDeploy} onCheckedChange={setAutoDeploy} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={submit} disabled={submitting || !slug}>{submitting ? "Creating…" : "Create app"}</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
