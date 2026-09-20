"""Offline, label-aware reporting. No model inference, source access, or candidate generation.

Evaluation unit: invoked task; bootstrap resampling unit: repository. Thresholds must
be fixed before reading evaluation labels. Multiple useful actions are supported.
"""
import argparse
from collections import Counter, defaultdict
import json
import math
from pathlib import Path
import random
import statistics

ARMS = ('A', 'B', 'C')
BOOTSTRAP_SEED = 20260920
BOOTSTRAP_REPLICATES = 10000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def quantile(values, p):
    if not values:
        return None
    values = sorted(values)
    position = (len(values) - 1) * p
    lower = math.floor(position)
    upper = math.ceil(position)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def ratio(numerator, denominator):
    return dict(numerator=numerator, denominator=denominator,
                value=numerator / denominator if denominator else None)


def validate(rows):
    task_ids, repositories, families = set(), {}, {}
    for row in rows:
        require(row.get('schemaVersion') == 1, 'Unknown replay schema.')
        require(isinstance(row.get('id'), str) and row['id'] not in task_ids, 'Duplicate/missing task ID.')
        task_ids.add(row['id'])
        require(row.get('split') in ('tuning', 'evaluation'), 'Missing predeclared split.')
        require(row.get('measurementKind') in ('fixture', 'live'), 'Missing measurement provenance.')
        for key, seen in (('repository', repositories), ('issueFamily', families)):
            name = row.get(key)
            require(isinstance(name, str) and bool(name), 'Missing clustering identity.')
            require(name not in seen or seen[name] == row['split'], 'Repository/issue-family leakage across splits.')
            seen[name] = row['split']
        require(type(row.get('eligible')) is bool, 'Eligibility must be predeclared.')
        if not row['eligible']:
            require(bool(row.get('exclusionReason')), 'An exclusion needs a reason.')
        require(set(row.get('runs', {})) <= set(ARMS), 'Unknown benchmark arm.')
        for run in row['runs'].values():
            require(run.get('status') in ('completed', 'timeout', 'error'), 'Missing run status.')
            require((run.get('verifiedSuccess') is None or type(run['verifiedSuccess']) is bool), 'Invalid verified outcome.')
            for name in ('investigationMs', 'totalTaskMs', 'llmTurns', 'tools', 'bytesScanned', 'evidenceBytes'):
                require(run.get(name) is None or finite(run[name]), 'Invalid numeric metric.')
            require((run.get('evidenceUseful') is None or type(run['evidenceUseful']) is bool), 'Invalid evidence label.')
            require(type(run.get('handoff')) is bool, 'Missing handoff label.')
            require(run.get('serviceState') in ('not_applicable', 'cold', 'warm', 'outage', 'overloaded'), 'Invalid service state.')
        for decision in row.get('decisions', []):
            ids = decision.get('candidateIds')
            require(isinstance(ids, list) and len(ids) <= 32 and len(set(ids)) == len(ids)
                    and 'handoff' not in ids, 'Invalid candidate catalog.')
            useful = decision.get('usefulIds')
            require(useful is None or (isinstance(useful, list) and len(set(useful)) == len(useful)), 'Invalid useful-action labels.')
            probabilities = decision.get('rawProbabilities')
            require(isinstance(probabilities, dict) and set(probabilities) == set(ids) | {'handoff'}, 'Invalid option keys.')
            values = list(probabilities.values())
            require(all(finite(p) and p <= 1 and abs(p * 10000 - round(p * 10000)) < 1e-7 for p in values), 'Invalid four-decimal probabilities.')
            total = sum(values)
            require(total > 0 and abs(total - 1) <= len(values) * .00005 + .000001, 'Invalid probability mass.')
            chosen = decision.get('selectedId')
            require(chosen in probabilities and probabilities[chosen] == max(values), 'Non-maximal/unknown selection.')
            require(type(decision.get('admitted')) is bool, 'Missing admission label.')
            for name in ('minTopProbability', 'minTopTwoMargin'):
                require(finite(decision.get(name)) and decision[name] <= 1, 'Missing explicit threshold.')
            normalized = sorted((p / total for p in values), reverse=True)
            admitted = chosen != 'handoff' and normalized[0] > normalized[1] and normalized[0] >= decision['minTopProbability'] and normalized[0] - normalized[1] >= decision['minTopTwoMargin']
            require(decision['admitted'] == admitted, 'Admission does not match the declared profile.')
    return rows


def paired_bootstrap(rows, left='A', right='C', replicates=BOOTSTRAP_REPLICATES):
    grouped = defaultdict(list)
    for row in rows:
        a, c = row['runs'].get(left, {}), row['runs'].get(right, {})
        if type(a.get('verifiedSuccess')) is bool and type(c.get('verifiedSuccess')) is bool:
            grouped[row['repository']].append(int(c['verifiedSuccess']) - int(a['verifiedSuccess']))
    pairs = sum(map(len, grouped.values()))
    out = dict(pairs=pairs, repositories=len(grouped), meanDifference=None,
               lower95=None, upper95=None, replicates=replicates, seed=BOOTSTRAP_SEED,
               method='paired percentile bootstrap, clusters=resampled repositories, interval=2.5th..97.5th percentile')
    if pairs:
        out['meanDifference'] = sum(sum(values) for values in grouped.values()) / pairs
    if len(grouped) < 2:
        return out
    rng = random.Random(BOOTSTRAP_SEED)
    clusters = list(grouped.values())
    samples = []
    for _ in range(replicates):
        selected = [rng.choice(clusters) for _ in clusters]
        samples.append(sum(sum(values) for values in selected) / sum(map(len, selected)))
    out.update(lower95=quantile(samples, .025), upper95=quantile(samples, .975))
    return out


def report(rows, replicates=BOOTSTRAP_REPLICATES):
    validate(rows)
    population = [row for row in rows if row['split'] == 'evaluation']
    eligible = [row for row in population if row['eligible']]
    decisions = [d for row in eligible for d in row.get('decisions', [])]
    labeled = [d for d in decisions if d['usefulIds'] is not None]
    covered = [d for d in labeled if set(d['candidateIds']) & set(d['usefulIds'])]
    admitted = [d for d in decisions if d['admitted']]
    admitted_labeled = [d for d in admitted if d['usefulIds'] is not None]
    bins = []
    for lower in (0, .5, .7, .8, .9):
        subset = [d for d in admitted_labeled if max(d['rawProbabilities'].values()) / sum(d['rawProbabilities'].values()) >= lower]
        correct = sum(d['selectedId'] in d['usefulIds'] for d in subset)
        bins.append(dict(minProbability=lower, coverage=ratio(len(subset), len(decisions)),
                         utility=ratio(correct, len(subset)),
                         meanConfidence=statistics.mean(max(d['rawProbabilities'].values()) / sum(d['rawProbabilities'].values()) for d in subset) if subset else None))
    arms = {}
    for arm in ARMS:
        runs = [row['runs'][arm] for row in eligible if arm in row['runs']]
        verified = [run for run in runs if type(run.get('verifiedSuccess')) is bool]
        usefulness = [run for run in runs if type(run.get('evidenceUseful')) is bool]
        metrics = {}
        for metric in ('investigationMs', 'totalTaskMs', 'llmTurns', 'tools'):
            values = [run[metric] for run in runs if run.get(metric) is not None]
            metrics[metric] = dict(n=len(values), p50=quantile(values, .5), p95=quantile(values, .95))
        service = {}
        for state in ('cold', 'warm', 'outage', 'overloaded'):
            values = [run['investigationMs'] for run in runs if run['serviceState'] == state and run.get('investigationMs') is not None]
            service[state] = dict(n=len(values), p50=quantile(values, .5), p95=quantile(values, .95))
        arms[arm] = dict(invoked=len(runs), missing=len(eligible) - len(runs),
                         verifiedSuccess=ratio(sum(run['verifiedSuccess'] for run in verified), len(verified)),
                         unverified=len(runs) - len(verified), evidenceUseful=ratio(sum(run['evidenceUseful'] for run in usefulness), len(usefulness)),
                         handoff=ratio(sum(run['handoff'] for run in runs), len(runs)),
                         statusCounts=dict(Counter(run['status'] for run in runs)), metrics=metrics, service=service)
    deltas = {}
    for metric, sign in (('llmTurns', -1), ('tools', 1), ('totalTaskMs', 1)):
        values = [sign * (row['runs']['C'][metric] - row['runs']['A'][metric]) for row in eligible
                  if all(arm in row['runs'] and row['runs'][arm].get(metric) is not None for arm in ('A', 'C'))]
        deltas[metric] = dict(pairs=len(values), mean=statistics.mean(values) if values else None,
                             p50=quantile(values, .5), p95=quantile(values, .95))
    interval = paired_bootstrap(eligible, replicates=replicates)
    latency_pairs = [row for row in eligible if all(arm in row['runs'] and row['runs'][arm].get('investigationMs') is not None for arm in ARMS)]
    medians = {arm: quantile([row['runs'][arm]['investigationMs'] for row in latency_pairs], .5) for arm in ARMS}
    improvement = 1 - medians['C'] / medians['A'] if medians['A'] else None
    fixture = any(row['measurementKind'] != 'live' for row in population)
    full_outcomes = bool(eligible) and all(arms[arm]['unverified'] == 0 and arms[arm]['missing'] == 0 for arm in ARMS)
    gates = dict(liveHeldOutPopulation=bool(population) and not fixture,
                 completeVerifiedOutcomes=full_outcomes,
                 usefulCandidateCoverage95=bool(labeled) and len(labeled) == len(decisions) and len(covered) / len(labeled) >= .95,
                 decisionAcceptance30=bool(decisions) and len(admitted) / len(decisions) >= .30,
                 pairedSuccessLowerBound=interval['lower95'] is not None and interval['lower95'] >= -.02,
                 medianLatencyImprovement20=improvement is not None and improvement >= .20,
                 lowerMedianThanDeterministic=bool(latency_pairs) and medians['C'] < medians['B'])
    return dict(schemaVersion=1, measurementKind='contains-fixtures' if fixture else 'live-only',
                population=dict(allInvoked=len(population), eligible=len(eligible), excluded=len(population)-len(eligible),
                                exclusionReasons=dict(Counter(row['exclusionReason'] for row in population if not row['eligible'])),
                                tuningRows=sum(row['split'] == 'tuning' for row in rows)),
                candidates=dict(usefulCoverage=ratio(len(covered), len(labeled)), unlabeledDecisions=len(decisions)-len(labeled)),
                selection=dict(acceptance=ratio(len(admitted), len(decisions)),
                               utility=ratio(sum(d['selectedId'] in d['usefulIds'] for d in admitted_labeled), len(admitted_labeled)),
                               calibrationAtCoverage=bins), arms=arms,
                pairedChanges=dict(llmTurnsRemoved=deltas['llmTurns'], extraToolWork=deltas['tools'], totalTaskLatencyChange=deltas['totalTaskMs']),
                pairedVerifiedSuccess=interval, pairedLatency=dict(pairs=len(latency_pairs), medians=medians, improvementVsA=improvement),
                proposedMetricGates=gates, metricGatesPass=all(gates.values()), rolloutApproved=False,
                reviewRequired='Safety conformance, profile provenance, eligible-slice declaration, p95/full-workflow regressions, and human pilot review are separate gates.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
    result = report(rows)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(json.dumps({'invoked': result['population']['allInvoked'], 'rolloutApproved': False,
                      'measurementKind': result['measurementKind']}))


if __name__ == '__main__':
    main()
