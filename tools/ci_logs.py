import os, json, urllib.request, urllib.error, zipfile, io

TOKEN = os.environ["GITHUB_TOKEN"]  # a fine-grained token with Actions read access
BASE = "https://api.github.com/repos/bailaiOWO/xsystem4-android"
H = {"Authorization": "Bearer " + TOKEN, "User-Agent": "dsh"}

def get(url):
    req = urllib.request.Request(url, headers=H)
    return urllib.request.urlopen(req, timeout=60)

run = json.load(get(BASE + "/actions/runs?per_page=1"))["workflow_runs"][0]
rid = run["id"]
try:
    resp = get(BASE + "/actions/runs/%d/logs" % rid)
    data = resp.read()
    z = zipfile.ZipFile(io.BytesIO(data))
    for name in z.namelist():
        print("=====", name, "=====")
        print(z.read(name).decode("utf-8", "replace")[:3000])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:500])
