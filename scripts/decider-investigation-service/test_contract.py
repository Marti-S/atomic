import asyncio
import hashlib
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from contract import (CANDIDATE_POLICY_VERSION, DECIDER_REVISION, PRECISION, QUESTION_VERSION,
                      RENDERING_VERSION, ContractError, compact, exact_state_first_item, request_contract, strict_json)
from backend import LocalDecider, load_manifest, runtime_identity, snapshot_files
from server import Service

IDENTITY = {'backendId': 'decider/fixture', 'deploymentFingerprint': 'a' * 64}
TOKEN = 'fixture-service-token-not-a-real-secret-1234'


def request(options=2):
    return dict(model=IDENTITY['backendId'], deploymentFingerprint=IDENTITY['deploymentFingerprint'],
                independent=True, layout='state_first', state={'objective': 'Find evidence', 'lateRestriction': 'No network'},
                questions={'next': dict(type='choice', instructions='Choose an action or handoff.',
                                       criteria={f'a{i}': f'Read source {i}' for i in range(options)})})


class CharacterTokenizer:
    def encode(self, text, add_special_tokens=False):
        assert not add_special_tokens
        return [ord(c) for c in text]


def labels(_):
    return [], list(range(1000, 1255)), [10, 40]


class ContractTests(unittest.TestCase):
    def test_prepare_respects_engine_and_eager_padding_at_lower_limits(self):
        # Pinned engine buckets differ from collate's 64-token padding. No model is loaded.
        buckets = [64, 128, 192, 256, 320, 384, 512, 640, 768, 1024, 1280, 1536, 2048]
        modules = {
            'decider.systemone': SimpleNamespace(render_state=lambda state: 'state',
                render_question=lambda question: {'question': 'pick', 'options': ['read', 'handoff']}),
            'decider.prompt': SimpleNamespace(label_table=labels),
            'decider.engine': SimpleNamespace(T_BUCKETS=buckets, LONG_STEP=1024,
                _bucket=lambda n, sizes: next((size for size in sizes if n <= size), None)),
        }
        backend = LocalDecider.__new__(LocalDecider)
        backend.identity = IDENTITY
        for engine, tokens, limit, accepted in ((False, 400, 448, True), (False, 400, 447, False),
                (True, 400, 448, False), (True, 400, 512, True),
                (True, 2100, 2176, False), (True, 2100, 3072, True)):
            with self.subTest(engine=engine, tokens=tokens, limit=limit):
                backend.decider = SimpleNamespace(eng=object() if engine else None,
                    m=SimpleNamespace(tok=CharacterTokenizer()))
                backend.manifest = {'maxTotalTokens': limit}
                item = {'ids': [1] * tokens}
                with patch.dict('sys.modules', modules), patch('backend.exact_state_first_item', return_value=item):
                    if accepted:
                        self.assertIs(backend.prepare(compact(request())).item, item)
                    else:
                        with self.assertRaisesRegex(ContractError, 'context_limit'):
                            backend.prepare(compact(request()))

    def test_duplicate_object_keys_and_nonfinite_numbers_are_rejected(self):
        for raw in (b'{"a":1,"a":2}', b'{"a":{"b":1,"b":2}}', b'{"a":NaN}', b'{"a":1e999}', b'{"a":Infinity}'):
            with self.subTest(raw=raw), self.assertRaises(ContractError):
                strict_json(raw)

    def test_context_is_complete_and_never_sliced(self):
        tok = CharacterTokenizer()
        item = exact_state_first_item(tok, 'x' * 300 + 'LATE_RESTRICTION', 'Decide?', ['Read', 'Handoff'], labels, 8192)
        self.assertIn('LATE_RESTRICTION', ''.join(chr(n) for n in item['ids']))
        exact = len(item['ids'])
        same = exact_state_first_item(tok, 'x' * 300 + 'LATE_RESTRICTION', 'Decide?', ['Read', 'Handoff'], labels, exact)
        self.assertEqual(item, same)
        with self.assertRaisesRegex(ContractError, 'context_limit'):
            exact_state_first_item(tok, 'x' * 300 + 'LATE_RESTRICTION', 'Decide?', ['Read', 'Handoff'], labels, exact - 1)

    def test_options_and_answer_slot_count_toward_limit(self):
        with self.assertRaisesRegex(ContractError, 'context_limit'):
            exact_state_first_item(CharacterTokenizer(), 'tiny', 'Decide?', ['x' * 5000, 'y' * 5000], labels)

    def test_wide_rendering_preserves_every_option_and_order(self):
        item = exact_state_first_item(CharacterTokenizer(), 'state', 'Decide?', [f'action-{i}' for i in range(33)], labels)
        self.assertEqual(item['nopts'], [33])
        self.assertEqual(item['perms'], [list(range(33))])
        self.assertEqual([n for n in item['ids'] if 1000 <= n < 1255], list(range(1000, 1033)))
        self.assertEqual(item['slots'], [len(item['ids']) - 1])

    def test_closed_request_and_model_identity(self):
        self.assertEqual(request_contract(compact(request()), IDENTITY)['state']['lateRestriction'], 'No network')
        for mutate, code in ((lambda b: b.update(model='other'), 'model_mismatch'),
                             (lambda b: b.update(deploymentFingerprint=''), 'model_mismatch'),
                             (lambda b: b.update(independent=False), 'decision_invalid'),
                             (lambda b: b.update(layout='schema_first'), 'decision_invalid'),
                             (lambda b: b.update(temperature=1), 'decision_invalid'),
                             (lambda b: b.update(state={'text': 'x' * 33000}), 'context_limit')):
            body = request(); mutate(body)
            with self.subTest(code=code), self.assertRaisesRegex(ContractError, code):
                request_contract(compact(body), IDENTITY)
        for count in (0, 1, 34):
            with self.assertRaises(ContractError):
                request_contract(compact(request(count)), IDENTITY)

    def test_mps_runtime_binds_accelerator_and_os_and_refuses_unavailable_device(self):
        mps = SimpleNamespace(is_available=lambda: True, get_name=lambda: 'Apple fixture GPU')
        torch = SimpleNamespace(version=SimpleNamespace(cuda=None),
                                cuda=SimpleNamespace(is_available=lambda: False),
                                backends=SimpleNamespace(mps=mps))
        with patch.dict('sys.modules', {'torch': torch}), patch('backend.importlib.metadata.version', return_value='fixture'), \
                patch('backend.platform.mac_ver', return_value=('15.fixture', '', '')), \
                patch('backend.platform.machine', return_value='arm64'):
            identity = runtime_identity('mps')
            self.assertEqual(identity['device'], 'Apple fixture GPU')
            self.assertEqual(identity['macos'], '15.fixture')
            self.assertEqual(identity['machine'], 'arm64')
            self.assertEqual(runtime_identity('cpu')['device'], 'cpu')
            self.assertEqual(runtime_identity(), runtime_identity('cpu'))
            self.assertNotIn('macos', runtime_identity('cpu'))
            mps.is_available = lambda: False
            with self.assertRaisesRegex(ContractError, 'model_mismatch'):
                runtime_identity('mps')
            mps.is_available = lambda: True
            del mps.get_name
            with self.assertRaisesRegex(ContractError, 'model_mismatch'):
                runtime_identity('mps')

    def test_mps_runtime_drift_prevents_model_loading(self):
        manifest = {'device': 'mps', 'runtime': {'device': 'approved GPU', 'macos': 'approved OS'}}
        with patch('backend.load_manifest', return_value=manifest), patch('backend.check_decider_source'), \
                patch('backend.runtime_identity', return_value={'device': 'different GPU', 'macos': 'new OS'}) as identity:
            with self.assertRaisesRegex(ContractError, 'model_mismatch'):
                LocalDecider('/fixture-model', '/fixture-manifest')
            identity.assert_called_once_with('mps')

    def test_mps_manifest_accepts_eager_and_rejects_cuda_graphs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'model'; root.mkdir()
            (root / 'model.safetensors').write_bytes(b'fixture-not-real-weights')
            (root / 'tokenizer.json').write_text('{}')
            (root / 'decider_config.json').write_text('{"temperature":1.25}')
            files = snapshot_files(root)
            manifest = dict(schemaVersion=1, deciderRevision=DECIDER_REVISION, backendId='fixture',
                            weightsRevision='a'*40, tokenizerRevision='b'*40,
                            configHash=files['decider_config.json'], temperature=1.25, calibrationReference='fixture-only',
                            renderingVersion=RENDERING_VERSION, questionVersion=QUESTION_VERSION,
                            candidatePolicyVersion=CANDIDATE_POLICY_VERSION, precision=PRECISION, maxTotalTokens=1024,
                            device='mps', dtype='float32', useGraphs=False, runtime={'test': 'fixture'}, files=files)
            path = Path(tmp) / 'manifest.json'; path.write_bytes(compact(manifest))
            self.assertEqual(load_manifest(root, path), manifest)
            manifest['useGraphs'] = True
            path.write_bytes(compact(manifest))
            with self.assertRaisesRegex(ContractError, 'model_mismatch'):
                load_manifest(root, path)

    def test_missing_or_changed_calibration_metadata_prevents_startup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'model'; root.mkdir()
            (root / 'model.safetensors').write_bytes(b'fixture-not-real-weights')
            (root / 'tokenizer.json').write_text('{}')
            (root / 'decider_config.json').write_text('{"temperature":1.25}')
            files = snapshot_files(root)
            manifest = dict(schemaVersion=1, deciderRevision=DECIDER_REVISION, backendId='fixture',
                            weightsRevision='a'*40, tokenizerRevision='b'*40,
                            configHash=files['decider_config.json'], temperature=1.25, calibrationReference='fixture-only',
                            renderingVersion=RENDERING_VERSION, questionVersion=QUESTION_VERSION,
                            candidatePolicyVersion=CANDIDATE_POLICY_VERSION, precision=PRECISION, maxTotalTokens=8192,
                            device='cpu', dtype='float32', useGraphs=False, runtime={'test': 'fixture'}, files=files)
            path = Path(tmp) / 'manifest.json'; path.write_bytes(compact(manifest))
            self.assertEqual(load_manifest(root, path), manifest)
            (root / 'decider_config.json').write_text('{}')
            with self.assertRaises(ContractError):
                load_manifest(root, path)
            (root / 'decider_config.json').unlink()
            with self.assertRaises(ContractError):
                load_manifest(root, path)


class FakeBackend:
    def __init__(self):
        self.calls = 0
        self.running = 0
        self.maximum_running = 0
        self.release = threading.Event(); self.release.set()
        self.started = threading.Event()

    def infer(self, raw):
        request_contract(raw, IDENTITY)
        self.calls += 1; self.running += 1
        self.maximum_running = max(self.maximum_running, self.running)
        self.started.set()
        self.release.wait(1)
        self.running -= 1
        return {'model': IDENTITY['backendId'], 'deploymentFingerprint': IDENTITY['deploymentFingerprint']}

    def ready(self):
        return {'ready': True, **IDENTITY}


class ServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.backend = FakeBackend()
        self.service = Service(TOKEN, self.backend, timeout_seconds=0.3)
        self.service.start_worker()
        self.server = await asyncio.start_server(self.service.connection, '127.0.0.1', 0, limit=8192)
        self.port = self.server.sockets[0].getsockname()[1]

    async def asyncTearDown(self):
        self.backend.release.set()
        self.server.close(); await self.server.wait_closed()
        await self.service.close()

    async def send(self, target='/v1/systemone', method='POST', token=TOKEN, body=None):
        reader, writer = await asyncio.open_connection('127.0.0.1', self.port)
        body = compact(request()) if body is None and method == 'POST' else (body or b'')
        header = (f'{method} {target} HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\n'
                  f'Content-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n').encode()
        writer.write(header + body); await writer.drain()
        return reader, writer

    async def response(self, reader, writer):
        raw = await asyncio.wait_for(reader.read(), 2)
        writer.close(); await writer.wait_closed()
        header, body = raw.split(b'\r\n\r\n', 1)
        return int(header.split(b' ')[1]), json.loads(body)

    async def test_authenticated_readiness_and_no_pre_ready_inference(self):
        status, body = await self.response(*await self.send('/health/ready', 'GET'))
        self.assertEqual(status, 200); self.assertEqual(body['deploymentFingerprint'], IDENTITY['deploymentFingerprint'])
        self.service.backend = None
        status, _ = await self.response(*await self.send())
        self.assertEqual(status, 503); self.assertEqual(self.backend.calls, 0)

    async def test_unauthorized_remote_redirect_and_query_contract(self):
        for target, token, expected in (('/v1/systemone', 'bad', 401),
                                        ('/v1/systemone?target=remote', TOKEN, 404),
                                        ('http://remote/v1/systemone', TOKEN, 404)):
            status, _ = await self.response(*await self.send(target=target, token=token))
            self.assertEqual(status, expected)
        self.assertEqual(self.backend.calls, 0)

    async def test_http422_has_only_static_error_code(self):
        body = request(); body['model'] = 'untrusted-private-response-data'
        status, response = await self.response(*await self.send(body=compact(body)))
        self.assertEqual(status, 422); self.assertEqual(response, {'code': 'model_mismatch'})
        status, response = await self.response(*await self.send(body=b'{"secret":"DO_NOT_ECHO","secret":"also"}'))
        self.assertEqual(status, 422); self.assertEqual(response, {'code': 'decision_invalid'})

    async def test_bounded_queue_and_cancelled_queued_work(self):
        self.backend.release.clear()
        first = await self.send()
        await asyncio.to_thread(self.backend.started.wait, 1)
        second = await self.send()
        await asyncio.sleep(0.02)
        status, _ = await self.response(*await self.send())
        self.assertEqual(status, 429)
        second[1].close(); await second[1].wait_closed()
        await asyncio.sleep(0.02)
        self.backend.release.set()
        status, _ = await self.response(*first)
        self.assertEqual(status, 200)
        await asyncio.sleep(0.02)
        self.assertEqual(self.backend.calls, 1)
        self.assertEqual(self.backend.maximum_running, 1)

    async def test_late_gpu_result_is_not_admitted_or_overlapped(self):
        self.service.timeout = 0.05
        self.backend.release.clear()
        first = await self.send()
        await asyncio.to_thread(self.backend.started.wait, 1)
        status, _ = await self.response(*first)
        self.assertEqual(status, 504)
        second = await self.send()
        status, _ = await self.response(*second)
        self.assertEqual(status, 504)
        self.backend.release.set()
        await asyncio.sleep(0.03)
        self.assertEqual(self.backend.calls, 1)
        self.assertEqual(self.backend.maximum_running, 1)

if __name__ == '__main__':
    unittest.main(verbosity=2)
