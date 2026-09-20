"""Explicit offline setup; never called by an Atomic investigation or service request."""
import argparse
import json
from pathlib import Path

from backend import check_decider_source, load_manifest, runtime_identity, snapshot_files
from contract import (CANDIDATE_POLICY_VERSION, DECIDER_REVISION, PRECISION,
                      QUESTION_VERSION, RENDERING_VERSION, digest, strict_json)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--backend-id', required=True)
    parser.add_argument('--weights-revision', required=True)
    parser.add_argument('--tokenizer-revision', required=True)
    parser.add_argument('--calibration-reference', required=True)
    parser.add_argument('--device', choices=('cpu', 'cuda', 'mps'), default='cuda')
    parser.add_argument('--dtype', choices=('float32', 'bfloat16'), default='bfloat16')
    parser.add_argument('--use-graphs', action='store_true')
    parser.add_argument('--max-total-tokens', type=int, default=8192)
    args = parser.parse_args()
    root = args.snapshot.resolve(strict=True)
    output = args.output.resolve()
    if output == root or root in output.parents:
        parser.error('The manifest must be outside the model snapshot.')
    check_decider_source()
    files = snapshot_files(root)
    config = strict_json((root / 'decider_config.json').read_bytes())
    manifest = dict(schemaVersion=1, deciderRevision=DECIDER_REVISION, backendId=args.backend_id,
                    weightsRevision=args.weights_revision, tokenizerRevision=args.tokenizer_revision,
                    configHash=files['decider_config.json'], temperature=config.get('temperature'),
                    calibrationReference=args.calibration_reference, renderingVersion=RENDERING_VERSION,
                    questionVersion=QUESTION_VERSION, candidatePolicyVersion=CANDIDATE_POLICY_VERSION,
                    precision=PRECISION, maxTotalTokens=args.max_total_tokens,
                    device=args.device, dtype=args.dtype, useGraphs=args.use_graphs,
                    runtime=runtime_identity(args.device), files=files)
    # Never overwrite an approved deployment's identity accidentally.
    with output.open('x', encoding='utf-8') as stream:
        json.dump(manifest, stream, indent=2, sort_keys=True, allow_nan=False)
        stream.write('\n')
    try:
        load_manifest(root, output)
    except Exception:
        output.unlink()
        raise SystemExit('Invalid deployment metadata; no manifest accepted.') from None
    print(json.dumps(dict(deploymentFingerprint=digest(manifest), backendId=args.backend_id)))


if __name__ == '__main__':
    main()
