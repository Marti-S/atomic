"""Pinned, local-only Decider loader. All heavyweight imports occur at startup."""
import hashlib
import importlib.util
import importlib.metadata
import platform
import math
import os
import re
from pathlib import Path

from contract import (CANDIDATE_POLICY_VERSION, DECIDER_REVISION, MAX_TOTAL_TOKENS, PRECISION,
                      QUESTION_VERSION, RENDERING_VERSION, ContractError, Prepared, compact, digest,
                      exact, exact_state_first_item, request_contract, strict_json, validate_probabilities)

# Git blob identities from the reviewed revision, not mutable branch names.
SOURCE_BLOBS = {
    '__init__.py': 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
    'infer.py': '379d479de19c22fb25deeeedeba5319308232d4c',
    'prompt.py': 'fb9f1306fa7c5b710a00daf4093ab4fb5501d62f',
    'systemone.py': '02b1d1849f8dc91b5b74a6e496ffaaaf51ef280b',
    'model.py': 'c42c4994a930a94ed5c50dd0983ecdc60c40f722',
    'engine.py': '1d13aecc9f98654db95f5f573a7ba8eebe2a8be0',
    'fp8.py': '1534608db2993bf6247510145d0a0110941efcd0',
}


def file_sha(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(part)
    return result.hexdigest()


def snapshot_files(root):
    if not root.is_dir() or root.is_symlink():
        raise ContractError('model_mismatch', 503)
    files = {}
    for directory, subdirs, names in os.walk(root, followlinks=False):
        for name in subdirs:
            if (Path(directory) / name).is_symlink():
                raise ContractError('model_mismatch', 503)
        for name in names:
            path = Path(directory) / name
            if not path.is_file() or path.is_symlink():
                raise ContractError('model_mismatch', 503)
            files[path.relative_to(root).as_posix()] = file_sha(path)
    if not files or 'decider_config.json' not in files or not any(name.endswith('.safetensors') for name in files):
        raise ContractError('model_mismatch', 503)
    if not any(name in files for name in ('tokenizer.json', 'tokenizer.model')):
        raise ContractError('model_mismatch', 503)
    return files


def load_manifest(snapshot, manifest_path):
    manifest = strict_json(manifest_path.read_bytes())
    keys = ('schemaVersion', 'deciderRevision', 'backendId', 'weightsRevision', 'tokenizerRevision',
            'configHash', 'temperature', 'calibrationReference', 'renderingVersion', 'questionVersion',
            'candidatePolicyVersion', 'precision', 'maxTotalTokens', 'device', 'dtype', 'useGraphs', 'runtime', 'files')
    if not exact(manifest, keys) or manifest['schemaVersion'] != 1 or manifest['deciderRevision'] != DECIDER_REVISION:
        raise ContractError('model_mismatch', 503)
    for key in ('backendId', 'weightsRevision', 'tokenizerRevision', 'calibrationReference'):
        if not isinstance(manifest[key], str) or not manifest[key].strip():
            raise ContractError('model_mismatch', 503)
    if any(not re.fullmatch(r'[a-f0-9]{40}', manifest[key]) for key in ('weightsRevision', 'tokenizerRevision')):
        raise ContractError('model_mismatch', 503)
    if (manifest['renderingVersion'] != RENDERING_VERSION or manifest['questionVersion'] != QUESTION_VERSION
            or manifest['candidatePolicyVersion'] != CANDIDATE_POLICY_VERSION or manifest['precision'] != PRECISION
            or type(manifest['maxTotalTokens']) is not int or not 0 < manifest['maxTotalTokens'] <= MAX_TOTAL_TOKENS
            or manifest['device'] not in ('cpu', 'cuda', 'mps') or manifest['dtype'] not in ('float32', 'bfloat16')
            or type(manifest['useGraphs']) is not bool or (manifest['device'] != 'cuda' and manifest['useGraphs'])):
        raise ContractError('model_mismatch', 503)
    if not isinstance(manifest['runtime'], dict) or not manifest['runtime'] or any(not isinstance(k, str) or not isinstance(v, str) or not v for k, v in manifest['runtime'].items()):
        raise ContractError('model_mismatch', 503)
    actual_files = snapshot_files(snapshot)
    if manifest['files'] != actual_files or manifest['configHash'] != actual_files['decider_config.json']:
        raise ContractError('model_mismatch', 503)
    config = strict_json((snapshot / 'decider_config.json').read_bytes())
    temperature = config.get('temperature') if isinstance(config, dict) else None
    if isinstance(temperature, bool) or not isinstance(temperature, (int, float)) or not math.isfinite(temperature) or temperature <= 0 or temperature != manifest['temperature']:
        raise ContractError('model_mismatch', 503)
    return manifest


def runtime_identity(device=None):
    packages = ('torch', 'transformers', 'tokenizers', 'huggingface-hub', 'safetensors', 'numpy', 'flash-linear-attention')
    result = {name: importlib.metadata.version(name) for name in packages}
    result['python'] = platform.python_version()
    # CUDA/driver changes should also trigger profile review; torch records its build CUDA version.
    import torch
    result['cuda'] = str(torch.version.cuda)
    result['device'] = torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu'
    if device == 'mps':
        if not torch.backends.mps.is_available() or not hasattr(torch.backends.mps, 'get_name'):
            raise ContractError('model_mismatch', 503)
        result['device'] = torch.backends.mps.get_name()
        result['macos'] = platform.mac_ver()[0]
        result['machine'] = platform.machine()
    return result


def check_decider_source():
    spec = importlib.util.find_spec('decider')
    if not spec or not spec.submodule_search_locations:
        raise ContractError('model_mismatch', 503)
    directory = Path(next(iter(spec.submodule_search_locations)))
    for name, expected in SOURCE_BLOBS.items():
        data = (directory / name).read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
        if actual != expected:
            raise ContractError('model_mismatch', 503)


class LocalDecider:
    def __init__(self, snapshot, manifest_path):
        # Prevent loaders from downloading even indirectly. The service takes local paths only.
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        self.manifest = load_manifest(Path(snapshot), Path(manifest_path))
        check_decider_source()
        if self.manifest['runtime'] != runtime_identity(self.manifest['device']):
            raise ContractError('model_mismatch', 503)
        import torch
        from decider.infer import Decider
        self.torch = torch
        self.decider = Decider(str(Path(snapshot).resolve()), device=self.manifest['device'],
                               dtype=getattr(torch, self.manifest['dtype']),
                               temperature=self.manifest['temperature'], use_graphs=self.manifest['useGraphs'])
        model_config = self.decider.m.lm.config
        text_config = getattr(model_config, 'text_config', model_config)
        model_limit = getattr(text_config, 'max_position_embeddings', None)
        if not isinstance(model_limit, int) or self.manifest['maxTotalTokens'] > model_limit:
            raise ContractError('model_mismatch', 503)
        self.identity = {'backendId': self.manifest['backendId'], 'deploymentFingerprint': digest(self.manifest)}
        self.compatibility = {key: self.manifest[key] for key in ('precision', 'renderingVersion', 'weightsRevision',
                              'tokenizerRevision', 'configHash', 'temperature', 'questionVersion', 'candidatePolicyVersion')}
        # Startup warm-up follows the same strict rendering and exact-item scoring path.
        warm = dict(model=self.identity['backendId'], deploymentFingerprint=self.identity['deploymentFingerprint'],
                    state={'objective': 'Verify that the local model can score a bounded Choice.'},
                    questions={'warmup': dict(type='choice', instructions='Select handoff.',
                               criteria={'read': 'A permitted source read.', 'handoff': 'Return control.'})},
                    independent=True, layout='state_first')
        self.infer(compact(warm))

    def ready(self):
        return dict(ready=True, **self.identity, model=self.identity['backendId'], compatibility=self.compatibility,
                    deciderRevision=DECIDER_REVISION, layout='state_first', independent=True,
                    limits=dict(maxOptions=33, maxStateBytes=32768, maxRequestBytes=65536,
                                maxResponseBytes=1048576, maxTotalTokens=self.manifest['maxTotalTokens'],
                                runningRequests=1, queuedRequests=1, requestTimeoutMs=2000))

    def prepare(self, raw):
        from decider.systemone import render_state, render_question
        from decider.prompt import label_table
        request = request_contract(raw, self.identity)
        question_id, question = next(iter(request['questions'].items()))
        rendered = render_question(question)
        item = exact_state_first_item(self.decider.m.tok, render_state(request['state']), rendered['question'],
                                      rendered['options'], label_table, self.manifest['maxTotalTokens'])
        # Validate the padding of the selected pinned scoring path, not just the unpadded item.
        tokens = len(item['ids'])
        if self.decider.eng is not None:
            from decider.engine import _bucket, T_BUCKETS, LONG_STEP
            padded_tokens = _bucket(tokens, T_BUCKETS) or ((tokens + LONG_STEP - 1) // LONG_STEP) * LONG_STEP
        else:
            padded_tokens = ((tokens + 63) // 64) * 64
        if padded_tokens > self.manifest['maxTotalTokens']:
            raise ContractError('context_limit')
        return Prepared(question_id, rendered, item)

    def infer(self, raw):
        from decider.model import collate
        from decider.systemone import format_answer
        prepared = self.prepare(raw)
        d, torch = self.decider, self.torch
        # This is the EXACT item whose full length prepare() validated. Never call build/system_one here.
        with torch.no_grad():
            if d.eng is not None:
                values = d.eng.score_items([prepared.item], temperature=d.T)[0][0].tolist()
            else:
                batch = collate([prepared.item], d.m.tok.pad_token_id)
                logits = d.m.slot_logits(*[batch[key].to(d.dev) for key in ('input_ids', 'attention_mask', 'slot_idx', 'slot_batch', 'nopts')])
                values = torch.softmax(logits / d.T, -1).cpu()[0].tolist()
        count = prepared.item['nopts'][0]
        values = validate_probabilities(values[:count], count)
        answer = format_answer(prepared.rendered_question, values)
        return dict(model=self.identity['backendId'], answers={prepared.question_id: answer},
                    usage=dict(input_tokens=len(prepared.item['ids']), output_tokens=0),
                    deploymentFingerprint=self.identity['deploymentFingerprint'], compatibility=self.compatibility)
