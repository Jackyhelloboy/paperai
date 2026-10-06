"""Copy Cloudflare's account-wide daily analytics to D1; no AI requests or quota resets."""
import datetime as dt
import importlib.util
import json
import math
from pathlib import Path

spec = importlib.util.spec_from_file_location('quota_diagnostics', Path(__file__).with_name('verify-ai-quota.py'))
diagnostics = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diagnostics)


def collect(now):
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    fmt = lambda value: value.isoformat(timespec='seconds').replace('+00:00', 'Z')
    query = ('{viewer {accounts(filter:{accountTag:' + json.dumps(diagnostics.ACCOUNT) + '}) {'
        'aiInferenceAdaptiveGroups(limit:1000,filter:{datetime_geq:' + json.dumps(fmt(midnight)) +
        ',datetime_lt:' + json.dumps(fmt(now)) + '}) {sum {totalNeurons}}}}}')
    accounts = diagnostics.gql(query).get('viewer', {}).get('accounts') or []
    if len(accounts) != 1:
        raise RuntimeError('Cloudflare account analytics were not returned')
    rows = accounts[0].get('aiInferenceAdaptiveGroups')
    if rows is None or len(rows) >= 1000:
        raise RuntimeError('Cloudflare analytics response is missing or may be truncated')
    values = [(row.get('sum') or {}).get('totalNeurons') for row in rows]
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0 for value in values):
        raise RuntimeError('Invalid Cloudflare neuron totals')
    return {'report_date_utc':midnight.date().isoformat(), 'reported_used':sum(values),
        'fetched_at':fmt(now), 'source':'cloudflare-analytics',
        'accuracy':'May be delayed or sampled; not the quota enforcement ledger'}


def main():
    if not diagnostics.TOKEN or diagnostics.ACCOUNT != '9195bc9144b0e1c8811dfae71e58c7e4':
        raise RuntimeError('Existing deployment account could not be verified')
    snapshot = collect(dt.datetime.now(dt.timezone.utc))
    status, response = diagnostics.request('/accounts/' + diagnostics.ACCOUNT + '/d1/database?per_page=100')
    if status != 200 or not response.get('success'):
        raise RuntimeError('Cannot resolve the existing drafts database')
    database = next((row for row in response.get('result') or [] if row.get('name') == 'paperai-drafts'), None)
    if not database or not database.get('uuid'):
        raise RuntimeError('Existing paperai-drafts database was not found')
    sql = ('INSERT INTO provider_usage(provider,snapshot_json,fetched_at) VALUES(?,?,?) '
        'ON CONFLICT(provider) DO UPDATE SET snapshot_json=excluded.snapshot_json,fetched_at=excluded.fetched_at '
        'WHERE excluded.fetched_at >= provider_usage.fetched_at')
    status, response = diagnostics.request('/accounts/' + diagnostics.ACCOUNT + '/d1/database/' + database['uuid'] + '/query',
        {'sql':sql, 'params':['cloudflare-workers-ai',json.dumps(snapshot),snapshot['fetched_at']]})
    if status != 200 or not response.get('success') or any(not row.get('success') for row in response.get('result') or []):
        raise RuntimeError('Cloudflare usage snapshot could not be saved')
    diagnostics.emit('Cloudflare daily usage synced', snapshot)


if __name__ == '__main__':
    main()
