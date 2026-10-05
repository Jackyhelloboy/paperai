"""Read-only account diagnostics; credentials never leave Cloudflare or appear in output.

One inference probe sends a small owned test image through the deployed OCR Worker.
No configuration, quota, model, plan, or billing setting is changed.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import urllib.error
import urllib.request

TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN', '')
ACCOUNT = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '')
BASE = 'https://api.cloudflare.com/client/v4'


def safe(value):
    text = str(value)
    for secret in (TOKEN, ACCOUNT):
        if secret:
            text = text.replace(secret, '[redacted]')
    return text[:600]


def emit(label, value):
    print(label + ': ' + safe(json.dumps(value, ensure_ascii=False)), flush=True)


def request(endpoint, data=None):
    req = urllib.request.Request(BASE + endpoint,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'},
        method='GET' if data is None else 'POST')
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read())
        except (ValueError, UnicodeError):
            return error.code, {'errors': [{'message': 'Non-JSON API error'}]}


def gql(query, variables=None):
    status, result = request('/graphql', {'query': query, 'variables': variables or {}})
    if status != 200 or result.get('errors'):
        raise RuntimeError(safe(result.get('errors') or {'http_status': status}))
    return result.get('data') or {}


TYPE = 'kind name ofType {kind name ofType {kind name ofType {kind name}}}'
cache = {}


def typename(info):
    while info and not info.get('name'):
        info = info.get('ofType')
    return info.get('name') if info else None


def schema(name):
    if name not in cache:
        query = ('query($name: String!) { __type(name:$name) { name kind '
            'fields {name type {' + TYPE + '} args {name type {' + TYPE + '}}} '
            'inputFields {name type {' + TYPE + '}} }}')
        cache[name] = gql(query, {'name': name}).get('__type') or {}
    return cache[name]


def fields(name):
    return {row['name']: row for row in schema(name).get('fields') or []}


def analytics(now):
    root = gql('{__schema {queryType {name}}}')['__schema']['queryType']['name']
    viewer = fields(root)['viewer']
    accounts = fields(typename(viewer['type']))['accounts']
    datasets = fields(typename(accounts['type']))
    candidates = [row for name, row in datasets.items()
        if re.search(r'^(aiInference|workersAi)', name, re.I) and name.endswith('Groups')]
    emit('AI analytics datasets discovered', [row['name'] for row in candidates])
    if not candidates:
        raise RuntimeError('No Workers AI inference analytics dataset is exposed by this API schema')
    for dataset in candidates[:3]:
        name = dataset['name']
        data_fields = fields(typename(dataset['type']))
        if 'sum' not in data_fields:
            continue
        metrics = fields(typename(data_fields['sum']['type']))
        selected = [key for key in metrics if re.search(r'neuron|token|request|error', key, re.I)]
        if not selected:
            continue
        args = {row['name']: row for row in dataset['args']}
        if 'filter' not in args:
            continue
        filters = {row['name'] for row in schema(typename(args['filter']['type'])).get('inputFields') or []}
        lower = next((key for key in ['datetime_geq', 'datetime_gt'] if key in filters), None)
        upper = next((key for key in ['datetime_lt', 'datetime_leq'] if key in filters), None)
        if not lower or not upper:
            emit(name + ' unavailable', 'No supported datetime range filter')
            continue
        dims = fields(typename(data_fields['dimensions']['type'])) if 'dimensions' in data_fields else {}
        dimension_names = [key for key in ['date', 'datetimeHour', 'modelName', 'model'] if key in dims]
        selection = 'sum {' + ' '.join(selected) + '}'
        if 'count' in data_fields:
            selection += ' count'
        if dimension_names:
            selection += ' dimensions {' + ' '.join(dimension_names) + '}'
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        periods = [('yesterday', midnight - dt.timedelta(days=1), midnight), ('today', midnight, now)]
        for label, start, end in periods:
            format_time = lambda t: t.isoformat(timespec='seconds').replace('+00:00', 'Z')
            query = ('{viewer {accounts(filter:{accountTag:' + json.dumps(ACCOUNT) + '}) {' + name +
                '(limit:1000,filter:{' + lower + ':' + json.dumps(format_time(start)) + ',' + upper + ':' +
                json.dumps(format_time(end)) + '}) {' + selection + '}}}}')
            try:
                result = gql(query)
                account_rows = result.get('viewer', {}).get('accounts') or []
                rows = account_rows[0].get(name) or [] if account_rows else []
                totals = {key: sum((row.get('sum') or {}).get(key) or 0 for row in rows) for key in selected}
                emit(name + ' ' + label + ' totals', {'from_utc': format_time(start), 'to_utc': format_time(end),
                    'groups': len(rows), 'totals': totals, 'note': 'Analytics may be delayed or sampled; not the billing quota ledger'})
                # Only usage metrics and model/time dimensions, never prompts or outputs.
                for row in rows[:24]:
                    emit(name + ' ' + label + ' group', row)
            except Exception as error:
                emit(name + ' ' + label + ' analytics unavailable', safe(error))


def main():
    now = dt.datetime.now(dt.timezone.utc)
    emit('Verification time UTC', now.isoformat())
    if not TOKEN or not ACCOUNT:
        emit('Account diagnostics unavailable', 'Existing deployment credentials are missing')
        return
    if '--pages-settings' not in sys.argv:
        emit('Deployment account verification', {'matches_project_account': ACCOUNT == '9195bc9144b0e1c8811dfae71e58c7e4'})
        sub_status, sub_data = request('/accounts/' + ACCOUNT + '/workers/subdomain')
        emit('Worker subdomain verification', {'http_status': sub_status,
            'matches_production_worker': (sub_data.get('result') or {}).get('subdomain') == 'mdjawaadkhan57'})
    if '--pages-settings' in sys.argv:
        status, data = request('/accounts/' + ACCOUNT + '/pages/projects/paperai')
        result = data.get('result') or {}
        emit('Pages project', {'http_status': status, 'name': result.get('name'),
            'subdomain': result.get('subdomain'), 'production_branch': result.get('production_branch'),
            'build_config': result.get('build_config')})
        for name, settings in (result.get('deployment_configs') or {}).items():
            emit('Pages ' + name + ' runtime settings', {
                'compatibility_date': settings.get('compatibility_date'),
                'compatibility_flags': settings.get('compatibility_flags'),
                'binding_keys': {key: list((settings.get(key) or {}).keys()) for key in
                    ['env_vars', 'kv_namespaces', 'd1_databases', 'r2_buckets', 'services', 'durable_object_namespaces']},
            })
        if status != 200:
            emit('Pages settings errors', data.get('errors'))
            raise SystemExit(1)
        return
    try:
        status, settings = request('/accounts/' + ACCOUNT + '/workers/scripts/paperai-ocr/settings')
        result = settings.get('result') or {}
        emit('Worker AI binding', {'http_status': status, 'AI_binding_present': any(
            row.get('type') == 'ai' and row.get('name') == 'AI' for row in result.get('bindings') or []),
            'unused_legacy_ocr_binding_names': [row.get('name') for row in result.get('bindings') or []
                if row.get('name') in {'OCR_PROVIDER', 'UNLIMITED_OCR_BASE_URL', 'UNLIMITED_OCR_API_KEY'}]})
        if status != 200:
            emit('Settings read errors', settings.get('errors'))
    except Exception as error:
        emit('Settings read unavailable', safe(error))
    try:
        analytics(now)
    except Exception as error:
        emit('Account analytics unavailable with existing token', safe(error))
    # Public Worker probe uses its AI binding. Do not send deployment credentials
    # to this endpoint: the deployment token does not grant REST inference access.
    try:
        image = (Path(__file__).resolve().parent.parent / 'fixtures' / 'ocr-probe.base64').read_text().strip()
        probe = urllib.request.Request('https://paperai-5up.pages.dev/api/ocr',
            data=json.dumps({'image': image, 'mimeType': 'image/png', 'filename': 'quota-probe.png',
                'language': 'en', 'difficulty': 'easy', 'image_meta': {'width': 640, 'height': 160}}).encode(),
            headers={'Content-Type': 'application/json', 'User-Agent': 'PaperAI-Quota-Diagnostics/1.0'}, method='POST')
        try:
            with urllib.request.urlopen(probe, timeout=150) as response:
                status, result = response.status, json.load(response)
        except urllib.error.HTTPError as error:
            status = error.code
            raw = error.read().decode('utf-8', errors='replace')
            try:
                result = json.loads(raw)
            except ValueError:
                result = {'error': 'Non-JSON HTTP response', 'code': 'HTTP_' + str(status)}
                emit('Probe response metadata', {'http_status': status, 'content_type': error.headers.get('Content-Type'),
                    'cf_ray': error.headers.get('CF-Ray'), 'body_summary': re.sub('<[^>]+>', ' ', raw)[:240]})
        emit('Production OCR inference result', {'http_status': status,
            'success': result.get('success'), 'code': result.get('code'),
            'provider_error_code': result.get('provider_error_code'),
            'provider_message': result.get('provider_message'), 'error': result.get('error'),
            'observed_at': result.get('observed_at'),
            'result_present': bool(result.get('text') or result.get('result'))})
    except Exception as error:
        emit('Production OCR verification unavailable', safe(error))


if __name__ == '__main__':
    main()
