import asyncio
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

from benchmark import benchmark, driver_run
from replay import paired_bootstrap, report, validate

FIXTURE = Path(__file__).parent / 'fixtures' / 'replay.jsonl'


class ReplayTests(unittest.TestCase):
    def setUp(self):
        self.rows = [json.loads(line) for line in FIXTURE.read_text().splitlines()]

    def test_population_denominators_and_multiple_useful_actions(self):
        result = report(self.rows, replicates=100)
        self.assertEqual(result['population']['allInvoked'], 4)
        self.assertEqual(result['population']['eligible'], 3)
        self.assertEqual(result['candidates']['usefulCoverage']['value'], 2/3)
        self.assertEqual(result['selection']['utility']['value'], 1)
        self.assertFalse(result['rolloutApproved'])
        self.assertFalse(result['proposedMetricGates']['liveHeldOutPopulation'])
        self.assertEqual(result['arms']['C']['service']['outage']['n'], 1)

    def test_no_repository_or_issue_family_split_leakage(self):
        for key in ('repository', 'issueFamily'):
            rows = copy.deepcopy(self.rows)
            rows[-1][key] = rows[0][key]
            with self.assertRaisesRegex(ValueError, 'leakage'):
                validate(rows)

    def test_missing_outcomes_are_not_counted_as_success_or_silently_dropped(self):
        self.rows[0]['runs']['C']['verifiedSuccess'] = None
        del self.rows[1]['runs']['B']
        result = report(self.rows, replicates=100)
        self.assertEqual(result['arms']['C']['unverified'], 1)
        self.assertEqual(result['arms']['B']['missing'], 1)
        self.assertFalse(result['proposedMetricGates']['completeVerifiedOutcomes'])

    def test_rounding_ties_and_declared_profile(self):
        self.rows[2]['decisions'][0]['admitted'] = True
        with self.assertRaisesRegex(ValueError, 'Admission'):
            validate(self.rows)

    def test_clustered_bootstrap_is_paired_reproducible_and_requires_clusters(self):
        rows = self.rows[:3]
        rows[0]['runs']['A']['verifiedSuccess'] = False
        first = paired_bootstrap(rows, replicates=100)
        self.assertEqual(first, paired_bootstrap(rows, replicates=100))
        self.assertEqual(first['meanDifference'], 1/3)
        self.assertIsNone(paired_bootstrap(rows[:1], replicates=100)['lower95'])


class BenchmarkTests(unittest.IsolatedAsyncioTestCase):
    async def test_timeout_and_output_cap(self):
        request = {'serviceState': 'warm'}
        timed = await driver_run([sys.executable, '-c', 'import time;time.sleep(10)'], request, 25)
        self.assertEqual(timed['status'], 'timeout')
        overflow = await driver_run([sys.executable, '-c', 'print("x" * 1048577)'], request, 1000)
        self.assertEqual(overflow['status'], 'error')

    async def test_no_labels_future_observations_or_fix_are_given_to_driver(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            driver = directory / 'driver.py'
            driver.write_text('''import json,sys
r=json.load(sys.stdin)
assert set(r)=={'schemaVersion','arm','id','repositoryRoot','input','budgets','serviceState'}
assert r['budgets']['maxActions']==5
print(json.dumps(dict(status='completed',measurementKind='fixture',tools=0,bytesScanned=0,evidenceBytes=0,traceRef='fixture',verifiedSuccess=None,evidenceUseful=None,investigationMs=0,totalTaskMs=0,llmTurns=0,handoff=True,serviceState=r['serviceState'])))
''')
            task = dict(schemaVersion=1,id='case',repository='repo',repositoryRoot='/fixture',issueFamily='family',split='evaluation',eligible=True,exclusionReason=None,
                        input={'objective':'Gather evidence'},futureObservations=['must not leak'],fix='must not leak',labels={'success':True})
            manifest = dict(taskTimeoutMs=1000,measurementKind='fixture',verifierIdentity='fixture',
                            drivers={arm:[sys.executable,str(driver)] for arm in ('A','B','C')})
            output = directory / 'out.jsonl'
            await benchmark([task],manifest,output)
            row = json.loads(output.read_text())
            self.assertEqual(set(row['runs']), {'A','B','C'})
            self.assertTrue(all(run['status']=='completed' for run in row['runs'].values()))
            self.assertNotIn('must not leak', output.read_text())


if __name__ == '__main__':
    unittest.main()
