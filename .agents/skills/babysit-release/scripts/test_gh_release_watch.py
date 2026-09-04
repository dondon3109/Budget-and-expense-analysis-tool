"""Focused tests for gh_release_watch.py (stdlib unittest, no extra deps)."""

import importlib.util
import unittest
from pathlib import Path

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
        "web_release_json": {"ok": True, "status": 200, "payload": {"appVersion": app_version}},
        "android_latest_json": {"ok": True, "status": 200, "payload": {"versionCode": 20316}},
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


if __name__ == "__main__":
    unittest.main()
