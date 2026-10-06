"""Build a public snapshot from Cloudflare's own Workers AI analytics.

This does not estimate usage from PaperAI requests. It queries Cloudflare Analytics
with the deployment token and writes only aggregate, non-secret usage data.
"""
import datetime as dt
import json
import math
import os
import urllib.request

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ACCOUNT = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
OUT = "frontend/usage.json"
DAILY_REFERENCE = 10000

if not TOKEN or not ACCOUNT:
    raise RuntimeError("Cloudflare credentials are required")

now = dt.datetime.now(dt.timezone.utc)
midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
tomorrow = midnight + dt.timedelta(days=1)

def iso(value):
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")

query = (
    "{viewer {accounts(filter:{accountTag:" + json.dumps(ACCOUNT) + "}) {"
    "aiInferenceAdaptiveGroups(limit:1000,filter:{datetime_geq:" + json.dumps(iso(midnight)) +
    ",datetime_lt:" + json.dumps(iso(now)) + "}) {sum {totalNeurons}}}}}"
)

req = urllib.request.Request(
    "https://api.cloudflare.com/client/v4/graphql",
    data=json.dumps({"query": query}).encode("utf-8"),
    headers={
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
    },
    method="POST",
)

with urllib.request.urlopen(req, timeout=30) as response:
    payload = json.loads(response.read().decode("utf-8"))

if payload.get("errors"):
    raise RuntimeError("Cloudflare Analytics returned errors: " + json.dumps(payload["errors"]))

accounts = payload.get("data", {}).get("viewer", {}).get("accounts") or []
if len(accounts) != 1:
    raise RuntimeError("Cloudflare account analytics were not returned")

rows = accounts[0].get("aiInferenceAdaptiveGroups")
if rows is None or len(rows) >= 1000:
    raise RuntimeError("Cloudflare analytics response is missing or may be truncated")

values = [(row.get("sum") or {}).get("totalNeurons") for row in rows]
if any(not isinstance(v, (int, float)) or not math.isfinite(v) or v < 0 for v in values):
    raise RuntimeError("Cloudflare returned an invalid neuron total")

used = float(sum(values))
snapshot = {
    "source": "cloudflare-analytics",
    "report_date_utc": midnight.date().isoformat(),
    "reported_used": used,
    "daily_reference": DAILY_REFERENCE,
    "reported_remaining": max(0.0, DAILY_REFERENCE - used),
    "percent_used": max(0.0, min(100.0, used / DAILY_REFERENCE * 100.0)),
    "last_updated": iso(now),
    "reset_at": iso(tomorrow),
    "scope": "Cloudflare account-wide Workers AI usage for the current UTC day",
    "accuracy": "Cloudflare-reported analytics; may be delayed or sampled and is not the enforcement ledger",
}

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(snapshot, f, ensure_ascii=False, separators=(",", ":"))
    f.write("\n")

print(json.dumps({k: snapshot[k] for k in ("source","reported_used","reported_remaining","last_updated","reset_at")}))
