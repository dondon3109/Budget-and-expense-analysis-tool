"""Focused tests for gh_release_watch.py (stdlib unittest, no extra deps)."""

import argparse
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).with_name("gh_release_watch.py")
MODULE_SPEC = importlib.util.spec_from_file_location("gh_release_watch", MODULE_PATH)
gh_release_watch = importlib.util.module_from_spec(MODULE_SPEC)
assert MODULE_SPEC.loader is not None
MODULE_SPEC.loader.exec_module(gh_release_watch)

SHA = "abc123def456"


def sample_run(name, status="completed", conclusion="success", head_sha=SHA, run_id=1):
    return {
        "run_id": run_id,
        "workflow_name": name,
        "head_sha": head_sha,
        "status": status,
        "conclusion": conclusion,
        "terminal": status.lower() == "completed",
        "pending": status.lower() in ("in_progress", "queued"),
        "failed": conclusion in gh_release_watch.FAILED_RUN_CONCLUSIONS,
        "html_url": f"https://example.test/runs/{run_id}",
    }


def live_markers(app_version="2.2.2"):
    return {
        "web_app_version": app_version,
        "android_identity": {"version": "0.2.16-beta", "versionCode": 20316},
    }


class RecommendActionsTest(unittest.TestCase):
    def test_ci_failure_with_bydesign_release_skip(self):
        # The live case: lint fails CI, Production Release skips by design.
        tracks = {
            "ci": sample_run("CI", conclusion="failure", run_id=11),
            "release": sample_run("Production Release", conclusion="skipped", run_id=12),
            "android": None,
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(tracks, [{"job_id": 1}], live_markers(), 0, 3)
        self.assertEqual(actions, ["diagnose_ci_failure", "retry_failed_checks"])

    def test_exhausted_retry_budget_stops(self):
        tracks = {
            "ci": sample_run("CI", conclusion="failure", run_id=11),
            "release": None,
            "android": None,
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(tracks, [{"job_id": 1}], live_markers(), 3, 3)
        self.assertEqual(actions, ["diagnose_ci_failure", "stop_exhausted_retries"])

    def test_green_release_stops(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": sample_run("Production Release", run_id=12),
            "android": None,
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(tracks, [], live_markers(), 0, 3)
        self.assertEqual(actions, ["stop_released"])

    def test_release_success_with_version_mismatch_verifies_production(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": sample_run("Production Release", run_id=12),
            "android": None,
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(
            tracks, [], live_markers(app_version="2.2.1"), 0, 3, expect_version="2.2.2"
        )
        self.assertEqual(actions, ["verify_production"])

    def test_release_success_with_matching_version_stops(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": sample_run("Production Release", run_id=12),
            "android": None,
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(
            tracks, [], live_markers(app_version="2.2.2"), 0, 3, expect_version="2.2.2"
        )
        self.assertEqual(actions, ["stop_released"])

    def test_in_flight_android_blocks_stop(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": sample_run("Production Release", run_id=12),
            "android": sample_run(
                "Android Beta Build", status="in_progress", conclusion="", run_id=13
            ),
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(tracks, [], live_markers(), 0, 3)
        self.assertEqual(actions, ["idle"])

    def test_android_failure_is_diagnosed(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": None,
            "android": sample_run("Android Beta Build", conclusion="failure", run_id=13),
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(tracks, [{"job_id": 9}], live_markers(), 0, 3)
        self.assertEqual(
            actions, ["diagnose_android_failure", "retry_failed_checks"]
        )

    def test_green_ci_with_skipped_release_needs_one_check(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": sample_run("Production Release", conclusion="skipped", run_id=12),
            "android": None,
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(tracks, [], live_markers(), 0, 3)
        self.assertEqual(actions, ["check_release_needed"])

    def test_all_pending_is_idle(self):
        tracks = {
            "ci": sample_run("CI", status="in_progress", conclusion="", run_id=11),
            "release": None,
            "android": None,
            "ota": None,
        }
        actions = gh_release_watch.recommend_actions(tracks, [], live_markers(), 0, 3)
        self.assertEqual(actions, ["idle"])


class RetryHelperTest(unittest.TestCase):
    def test_skipped_production_release_is_not_a_rerun_candidate(self):
        snapshot = {
            "tracks": {
                "ci": sample_run("CI", conclusion="failure", run_id=11),
                "release": sample_run("Production Release", conclusion="skipped", run_id=12),
            }
        }
        self.assertEqual(gh_release_watch.terminal_failed_run_ids(snapshot), [11])

    def test_invalid_sha_is_rejected(self):
        with self.assertRaises(ValueError):
            gh_release_watch.resolve_sha("owner/repo", "not-a-sha!!!")


class SnapshotKeyTest(unittest.TestCase):
    def test_change_key_reflects_status_and_live_markers(self):
        base = {
            "sha": SHA,
            "tracks": {
                "ci": sample_run("CI", run_id=11),
                "release": None,
                "android": None,
                "ota": None,
            },
            "live": live_markers(),
            "actions": ["idle"],
        }
        same = dict(base)
        progressed = dict(base)
        progressed["tracks"] = dict(base["tracks"])
        progressed["tracks"]["release"] = sample_run("Production Release", run_id=12)
        self.assertEqual(
            gh_release_watch.snapshot_change_key(base),
            gh_release_watch.snapshot_change_key(same),
        )
        self.assertNotEqual(
            gh_release_watch.snapshot_change_key(base),
            gh_release_watch.snapshot_change_key(progressed),
        )


class CollectSnapshotTest(unittest.TestCase):
    def test_failed_jobs_surface_from_raw_runs(self):
        # Regression test: collect_snapshot must hand raw API payloads (with
        # numeric `id`) to failed_jobs_for_runs, not summarized runs.
        raw_run = {
            "id": 999,
            "name": "CI",
            "head_sha": SHA,
            "status": "completed",
            "conclusion": "failure",
            "html_url": "https://example.test/runs/999",
        }
        raw_job = {
            "id": 555,
            "name": "verify",
            "status": "completed",
            "conclusion": "failure",
            "html_url": "https://example.test/job/555",
        }

        def fake_runs(repo, workflow_file, head_sha=None):
            return [raw_run] if workflow_file == "ci.yml" else []

        with tempfile.TemporaryDirectory() as tmp:
            args = argparse.Namespace(
                sha=SHA,
                repo="owner/repo",
                state_file=str(Path(tmp) / "state.json"),
                expect_version=None,
                max_flaky_retries=3,
            )
            with (
                mock.patch.object(gh_release_watch, "resolve_repo", return_value="owner/repo"),
                mock.patch.object(gh_release_watch, "resolve_sha", return_value=SHA),
                mock.patch.object(gh_release_watch, "get_workflow_runs", side_effect=fake_runs),
                mock.patch.object(gh_release_watch, "get_jobs_for_run", return_value=[raw_job]),
                mock.patch.object(gh_release_watch, "collect_live_markers", return_value={}),
            ):
                snapshot, _ = gh_release_watch.collect_snapshot(args)

        self.assertEqual([job["job_id"] for job in snapshot["failed_jobs"]], [555])
        self.assertEqual(
            snapshot["failed_jobs"][0]["logs_endpoint"],
            "repos/owner/repo/actions/jobs/555/logs",
        )
        self.assertEqual(snapshot["actions"], ["diagnose_ci_failure", "retry_failed_checks"])


class QuietWatchTest(unittest.TestCase):
    def test_live_markers_never_carry_full_payloads(self):
        with (
            mock.patch.object(
                gh_release_watch,
                "fetch_json_url",
                return_value={
                    "ok": True,
                    "payload": {"version": "9.9", "notes": ["a" * 5000]},
                },
            ),
        ):
            markers = gh_release_watch.collect_live_markers()
        dumped = str(markers)
        self.assertNotIn("aaaa", dumped)
        self.assertNotIn("payload", dumped)
        self.assertEqual(markers["android_identity"]["version"], "9.9")

    def test_watch_prints_only_on_change_or_stop(self):
        import io
        from contextlib import redirect_stdout

        def snap(ci_conclusion, actions):
            return {
                "sha": SHA,
                "tracks": {
                    "ci": {
                        "status": "completed",
                        "conclusion": ci_conclusion,
                    },
                    "release": None,
                    "android": None,
                    "ota": None,
                },
                "live": live_markers(),
                "actions": actions,
            }

        steady = snap("failure", ["diagnose_ci_failure"])
        steady_again = snap("failure", ["diagnose_ci_failure"])
        released = snap("success", ["stop_released"])
        state_path = Path("/tmp/watch-test-state.json")

        with tempfile.TemporaryDirectory() as tmp:
            args = argparse.Namespace(
                poll_seconds=60,
                heartbeat_file=str(Path(tmp) / "watch.log"),
                state_file=str(Path(tmp) / "state.json"),
            )
            snapshots = [
                (steady, state_path),
                (steady_again, state_path),
                (released, state_path),
            ]
            with (
                mock.patch.object(
                    gh_release_watch, "collect_snapshot", side_effect=snapshots
                ),
                mock.patch.object(gh_release_watch.time, "sleep", return_value=None),
            ):
                out = io.StringIO()
                with redirect_stdout(out):
                    self.assertEqual(gh_release_watch.run_watch(args), 0)

            events = [
                json.loads(line) for line in out.getvalue().splitlines() if line.strip()
            ]
            kinds = [event["event"] for event in events]
            # watch_started + first snapshot + changed stop-poll snapshot + stop.
            # The identical second poll prints nothing.
            self.assertEqual(kinds, ["watch_started", "snapshot", "snapshot", "stop"])

            with open(args.heartbeat_file, encoding="utf-8") as handle:
                beats = [line for line in handle.read().splitlines() if line.strip()]
            # One cheap liveness line per poll, including the silent one.
            self.assertEqual(len(beats), 3)
            self.assertIn("changed=false", beats[1])


class SourceGuardTest(unittest.TestCase):
    def _guard_job(self, run_id, steps):
        return {
            "run_id": run_id,
            "workflow_name": "Production Release",
            "job_id": 777,
            "job_name": "deploy-and-release",
            "conclusion": "failure",
            "failed_steps": steps,
        }

    def test_guard_only_trip_advises_check_not_retry(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": sample_run("Production Release", conclusion="failure", run_id=12),
            "android": None,
            "ota": None,
        }
        jobs = [self._guard_job(12, ["Verify release source"])]
        actions = gh_release_watch.recommend_actions(tracks, jobs, live_markers(), 0, 3)
        self.assertEqual(actions, ["check_release_source"])

    def test_guard_plus_real_failure_stays_diagnose(self):
        tracks = {
            "ci": sample_run("CI", run_id=11),
            "release": sample_run("Production Release", conclusion="failure", run_id=12),
            "android": None,
            "ota": None,
        }
        jobs = [self._guard_job(12, ["Verify release source", "Deploy production Worker"])]
        actions = gh_release_watch.recommend_actions(tracks, jobs, live_markers(), 0, 3)
        self.assertEqual(actions, ["diagnose_release_failure", "retry_failed_checks"])

    def test_guard_only_run_excluded_from_rerun_ids(self):
        snapshot = {
            "tracks": {
                "release": sample_run(
                    "Production Release", conclusion="failure", run_id=12
                ),
            },
            "failed_jobs": [self._guard_job(12, ["Verify release source"])],
        }
        self.assertEqual(gh_release_watch.terminal_failed_run_ids(snapshot), [])


class WatchResilienceTest(unittest.TestCase):
    def _args(self, tmp):
        return argparse.Namespace(
            poll_seconds=60,
            heartbeat_file=None,
            state_file=str(Path(tmp) / "state.json"),
        )

    def _snap(self, sha, actions):
        return {
            "sha": sha,
            "tracks": {"ci": None, "release": None, "android": None, "ota": None},
            "live": live_markers(),
            "actions": actions,
        }

    def _run_events(self, args, snapshots):
        import io
        from contextlib import redirect_stdout

        with (
            mock.patch.object(
                gh_release_watch, "collect_snapshot", side_effect=snapshots
            ),
            mock.patch.object(gh_release_watch.time, "sleep", return_value=None),
        ):
            out = io.StringIO()
            with redirect_stdout(out):
                code = gh_release_watch.run_watch(args)
        return code, [
            json.loads(line) for line in out.getvalue().splitlines() if line.strip()
        ]

    def test_transient_poll_error_does_not_kill_watch(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(tmp)
            state_path = Path(tmp) / "state.json"
            steady = self._snap(SHA, ["idle"])
            stop = self._snap(SHA, ["stop_released"])
            code, events = self._run_events(
                args,
                [
                    gh_release_watch.GhCommandError("rate limited"),
                    (steady, state_path),
                    (stop, state_path),
                ],
            )
        self.assertEqual(code, 0)
        self.assertEqual(
            [event["event"] for event in events],
            ["watch_started", "error", "snapshot", "snapshot", "stop"],
        )

    def test_persistent_poll_errors_give_up(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(tmp)
            with (
                mock.patch.object(
                    gh_release_watch,
                    "collect_snapshot",
                    side_effect=gh_release_watch.GhCommandError("API 500"),
                ),
                mock.patch.object(gh_release_watch.time, "sleep", return_value=None),
            ):
                import io
                from contextlib import redirect_stdout

                out = io.StringIO()
                with redirect_stdout(out):
                    code = gh_release_watch.run_watch(args)
        self.assertEqual(code, 1)
        errors = [
            json.loads(line)
            for line in out.getvalue().splitlines()
            if '"error"' in line
        ]
        self.assertEqual(len(errors), gh_release_watch.MAX_CONSECUTIVE_POLL_ERRORS)

    def test_heartbeat_follows_sha_advance(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(tmp)
            other_sha = "ffffffffffff"
            first = self._snap(SHA, ["idle"])
            second = self._snap(other_sha, ["stop_released"])
            first_path = Path(tmp) / "state-a.json"
            second_path = Path(tmp) / "state-b.json"
            code, _ = self._run_events(
                args, [(first, first_path), (second, second_path)]
            )
            self.assertEqual(code, 0)
            for path in (first_path.with_suffix(".log"), second_path.with_suffix(".log")):
                with open(path, encoding="utf-8") as handle:
                    lines = [line for line in handle.read().splitlines() if line.strip()]
                self.assertEqual(len(lines), 1)


if __name__ == "__main__":
    unittest.main()
