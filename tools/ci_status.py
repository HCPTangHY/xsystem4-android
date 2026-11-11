import os, json, urllib.request, sys

TOKEN = os.environ["GITHUB_TOKEN"]  # a fine-grained token with Actions read access
BASE = "https://api.github.com/repos/bailaiOWO/xsystem4-android"

def api(path):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Bearer " + TOKEN, "User-Agent": "dsh"})
    return json.load(urllib.request.urlopen(req, timeout=30))

runs = api("/actions/runs?per_page=1")
run = runs["workflow_runs"][0]
print("run id:", run["id"], run["status"], run["conclusion"])
jobs = api("/actions/runs/%d/jobs" % run["id"])
for j in jobs["jobs"]:
    print("job:", j["name"], j["status"], j["conclusion"])
    for s in j["steps"]:
        mark = "OK" if s["conclusion"] == "success" else str(s["conclusion"]).upper()
        print("  [%s] %s" % (mark, s["name"]))
