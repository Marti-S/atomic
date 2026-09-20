"""Bounded A/B/C task-driver harness. Driver commands are trusted host CLI config,
not tool/model input. Labels, future observations and fixes are never sent to drivers.

Each driver reads ONE JSON request from stdin and emits ONE JSON metric record.
The task runner/verifier is repository-specific; its identity is recorded in the manifest.
This harness is not an OS sandbox for an untrusted driver.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import signal
import time

MAX_OUTPUT_BYTES = 1048576
MAX_TASK_TIMEOUT_MS = 300000
BUDGET = dict(maxActions=5, maxEvidenceBytes=24576, maxScannedBytes=16777216,
              maxFileBytes=1048576, maxEnumeratedEntries=5000, investigationTimeoutMs=15000)


async def driver_run(argv, request, timeout_ms):
    started = time.monotonic()
    process = await asyncio.create_subprocess_exec(*argv, stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
                start_new_session=True)
    async def collect():
        process.stdin.write(json.dumps(request, allow_nan=False).encode() + b'\n')
        await process.stdin.drain()
        process.stdin.close()
        output = bytearray()
        while chunk := await process.stdout.read(65536):
            output.extend(chunk)
            if len(output) > MAX_OUTPUT_BYTES:
                raise ValueError('Driver output bound exceeded.')
        await process.wait()
        if process.returncode:
            raise ValueError('Driver failed.')
        result = json.loads(output)
        if not isinstance(result, dict):
            raise ValueError('Driver contract.')
        bounds = [('tools', 5), ('evidenceBytes', 24576)]
        # Canonical native search exposes no scanned-byte telemetry. A driver may
        # debit the complete explicit regular-file scope before access instead;
        # this is a conservative charge, never an actual scan measurement.
        if result.get('bytesScanned') is not None:
            bounds.append(('bytesScanned', 16777216))
        elif (result.get('bytesScannedObserved') is not False
              or result.get('accountingMethod') != 'full_scope_precharge'):
            raise ValueError('Unknown scan telemetry requires explicit precharge accounting.')
        if 'chargedBytes' in result or result.get('bytesScanned') is None:
            bounds.append(('chargedBytes', 16777216))
        for key, maximum in bounds:
            if type(result.get(key)) not in (int, float) or not 0 <= result[key] <= maximum:
                raise ValueError('Driver access/output budget violation.')
        if not isinstance(result.get('traceRef'), str) or not result['traceRef']:
            raise ValueError('Missing independently auditable trace.')
        result['driverWallMs'] = (time.monotonic() - started) * 1000
        return result
    try:
        return await asyncio.wait_for(collect(), timeout_ms / 1000)
    except (TimeoutError, ValueError, json.JSONDecodeError):
        return dict(status='timeout' if (time.monotonic()-started)*1000 >= timeout_ms else 'error',
                    verifiedSuccess=None, evidenceUseful=None, investigationMs=None,
                    totalTaskMs=(time.monotonic()-started)*1000, llmTurns=None, tools=None,
                    bytesScanned=None, evidenceBytes=None, handoff=True, serviceState=request['serviceState'])
    finally:
        # Kill the complete trusted driver's process group, including descendant task runners.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        await process.wait()


async def benchmark(tasks, manifest, destination):
    if os.name != 'posix':
        raise ValueError('The bounded process-group harness requires POSIX.')
    if not 0 < manifest['taskTimeoutMs'] <= MAX_TASK_TIMEOUT_MS:
        raise ValueError('Invalid benchmark deadline.')
    if set(manifest['drivers']) != {'A', 'B', 'C'} or not manifest.get('verifierIdentity'):
        raise ValueError('Three declared drivers and a verifier identity are required.')
    for command in manifest['drivers'].values():
        if not isinstance(command, list) or not command or any(not isinstance(arg, str) for arg in command):
            raise ValueError('Commands must be explicit argument arrays; no shell.')
    with destination.open('x') as output:
        for task in tasks:
            # Only explicitly enumerated task-start fields go to a driver. No labels/fix/history.
            record = {key: task[key] for key in ('schemaVersion', 'id', 'repository', 'issueFamily', 'split', 'eligible', 'exclusionReason')}
            record.update(measurementKind=manifest['measurementKind'], runs={}, decisions=[],
                          verifierIdentity=manifest['verifierIdentity'])
            if task['eligible']:
                for arm in ('A', 'B', 'C'):
                    request = dict(schemaVersion=1, arm=arm, id=task['id'], repositoryRoot=task['repositoryRoot'],
                                   input=task['input'], budgets=BUDGET,
                                   serviceState=task.get('serviceState', 'warm'))
                    run = await driver_run(manifest['drivers'][arm], request, manifest['taskTimeoutMs'])
                    if run.get('measurementKind') != manifest['measurementKind'] and run['status'] == 'completed':
                        raise ValueError('Driver measurement provenance mismatch.')
                    # Decision logs contain current observations only. Reviewer labels are joined offline.
                    record['runs'][arm] = run
            output.write(json.dumps(record, allow_nan=False) + '\n')
            output.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tasks', type=Path, required=True)
    parser.add_argument('--drivers', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    tasks = [json.loads(line) for line in args.tasks.read_text().splitlines() if line.strip()]
    manifest = json.loads(args.drivers.read_text())
    asyncio.run(benchmark(tasks, manifest, args.output))


if __name__ == '__main__':
    main()
