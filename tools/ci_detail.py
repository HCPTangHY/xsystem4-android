import os, json, urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]  # a fine-grained token with Actions read access
BASE = "https://api.github.com/repos/bailaiOWO/xsystem4-android"
H = {"Authorization": "Bearer " + TOKEN, "User-Agent": "dsh"}

def api(path):
    req = urllib.request.Request(BASE + path, headers=H)
    return json.load(urllib.request.urlopen(req, timeout=30))

run = api("/actions/runs?per_page=1")["workflow_runs"][0]
rid = run["id"]
print("== run ==")
for k in ("status", "conclusion", "event", "head_branch", "run_attempt"):
    print(" ", k, "=", run.get(k))
cr = api("/actions/runs/%d/attempts/%d/jobs" % (rid, run["run_attempt"]))
for j in cr["jobs"]:
    print("job:", j["name"], "| conclusion:", j["conclusion"], "| started:", j["started_at"])
    print("  runner:", j.get("runner_name"), j.get("runner_group_name"))
# annotations
try:
    ann = api("/actions/runs/%d/annotations" % rid) if False else None
except Exception as e:
    pass
# check-run annotations
checks = api("/commits/" + run["head_sha"] + "/check-runs")
for c in checks.get("check_runs", []):
    print("check:", c["name"], c["conclusion"])
    out = c.get("output") or {}
    print("  title:", out.get("title"))
    print("  summary:", (out.get("summary") or "")[:500])
