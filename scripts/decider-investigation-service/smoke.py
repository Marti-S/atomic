"""Explicit live suite: use an already ready service; never download or load weights here."""
import argparse
import http.client
import os
from pathlib import Path
from urllib.parse import urlsplit

from contract import compact, digest, strict_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--endpoint', default='http://127.0.0.1:8000/v1/systemone')
    parser.add_argument('--manifest', type=Path, required=True)
    args = parser.parse_args()
    url = urlsplit(args.endpoint)
    if (url.scheme != 'http' or url.hostname not in ('127.0.0.1', '::1') or url.username
            or url.password or url.query or url.fragment or url.path != '/v1/systemone'):
        parser.error('Only an exact literal-loopback endpoint is supported.')
    token = os.environ.get('ATOMIC_DECIDER_SERVICE_TOKEN', '')
    if len(token.encode()) < 32 or '\n' in token or '\r' in token:
        parser.error('A separate local service token is required.')
    manifest = strict_json(args.manifest.read_bytes())
    identity = digest(manifest)
    def request(method, path, body=None):
        conn = http.client.HTTPConnection(url.hostname, url.port or 80, timeout=2)
        try:
            conn.request(method, path, body=compact(body) if body is not None else None,
                         headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
            response = conn.getresponse()
            raw = response.read(1048577)
            if len(raw) > 1048576 or response.status != 200:
                raise SystemExit('Live service contract failed; no response body is logged.')
            return strict_json(raw)
        finally:
            conn.close()
    ready = request('GET', '/health/ready')
    if ready.get('ready') is not True or ready.get('deploymentFingerprint') != identity:
        raise SystemExit('Readiness identity mismatch.')
    body = dict(model=manifest['backendId'], deploymentFingerprint=identity,
                independent=True, layout='state_first',
                state={'objective': 'Gather source evidence; this smoke test executes no repository action.'},
                questions={'next': {'type': 'choice', 'instructions': 'Choose handoff when no source is supplied.',
                                   'criteria': {'a_test': 'Read an explicitly listed fixture.', 'handoff': 'Return control.'}}})
    answer = request('POST', url.path, body)
    if (answer.get('deploymentFingerprint') != identity or answer.get('model') != manifest['backendId']
            or set(answer.get('answers', {})) != {'next'}):
        raise SystemExit('Inference identity/answer contract mismatch.')
    choice = answer['answers']['next']
    probabilities = choice['probabilities']
    if set(probabilities) != {'a_test', 'handoff'}:
        raise SystemExit('Invalid probability keys.')
    values = list(probabilities.values())
    if any(not isinstance(x, (int, float)) or not 0 <= x <= 1 for x in values):
        raise SystemExit('Invalid probabilities.')
    if abs(sum(values) - 1) > len(values) * .00005 + .000001 or choice['choice'] not in probabilities:
        raise SystemExit('Invalid probability mass/selection.')
    if probabilities[choice['choice']] != max(values):
        raise SystemExit('Non-maximal selection.')
    print(compact({'liveInference': True, 'contractPassed': True, 'deploymentFingerprint': identity,
                   'usage': answer['usage'], 'repositoryActions': 0, 'qualityGateEvaluated': False}).decode())


if __name__ == '__main__':
    main()
