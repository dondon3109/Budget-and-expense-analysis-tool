#!/usr/bin/env python3
"""Watch web + Android release workflow runs for babysit-release sessions.

Snapshots CI, Production Release, Android Beta Build, and Mobile OTA runs for
one main SHA (plus live release markers), and recommends watcher actions so
the babysitter knows what to do on each poll without re-deciding from scratch.
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

FAILED_RUN_CONCLUSIONS = {
    "failure",
    "timed_out",
    "cancelled",
    "action_required",
    "startup_failure",
    "stale",
}

PENDING_RUN_STATUSES = {
    "queued",
    "in_progress",
    "waiting",
    "pending",
    "requested",
}

# (track, workflow file). CI + release are head_sha-scoped; android/ota are
# manual dispatches and tracked via their latest runs.
TRACKS = (
    ("ci", "ci.yml"),
    ("release", "release.yml"),
    ("android", "android-beta.yml"),
    ("ota", "mobile-ota.yml"),
)

WEB_RELEASE_JSON_URL = "https://zoption.site/release.json"
ANDROID_LATEST_JSON_URL = "https://downloads.zoption.site/android/latest.json"
HTTP_TIMEOUT_SECONDS = 15


class GhCommandError(RuntimeError):
    pass


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Snapshot release workflow state for babysit-release and optionally "
            "rerun failed runs."
        )
    )
    parser.add_argument(
        "--sha",
        default="auto",
        help="main SHA to watch, or 'auto' for the current origin main HEAD",
    )
    parser.add_argument("--repo", help="Optional OWNER/REPO override")
    parser.add_argument(
        "--expect-version",
        help="Optional bare version (e.g. 2.2.2) required in the live release.json",
    )
    parser.add_argument("--poll-seconds", type=int, default=60, help="Watch poll interval")
    parser.add_argument(
        "--max-flaky-retries",
        type=int,
        default=3,
        help="Max rerun cycles per SHA before stop recommendation",
    )
    parser.add_argument("--state-file", help="Path to state JSON file")
    parser.add_argument(
        "--heartbeat-file",
        help="Append-only liveness log path (default: state file with .log suffix)",
    )
    parser.add_argument("--once", action="store_true", help="Emit one snapshot and exit")
    parser.add_argument("--watch", action="store_true", help="Continuously emit JSONL snapshots")
    parser.add_argument(
        "--retry-failed-now",
        action="store_true",
        help="Rerun failed runs for the watched SHA when policy allows",
    )
    args = parser.parse_args()

    if args.poll_seconds <= 0:
        parser.error("--poll-seconds must be > 0")
    if args.max_flaky_retries < 0:
        parser.error("--max-flaky-retries must be >= 0")
    if args.watch and args.retry_failed_now:
        parser.error("--watch cannot be combined with --retry-failed-now")
    if not args.once and not args.watch and not args.retry_failed_now:
        args.once = True
    return args


def _format_gh_error(cmd, err):
    stdout = (err.stdout or "").strip()
    stderr = (err.stderr or "").strip()
    parts = [f"GitHub CLI command failed: {' '.join(cmd)}"]
    if stdout:
        parts.append(f"stdout: {stdout}")
    if stderr:
        parts.append(f"stderr: {stderr}")
    return "\n".join(parts)


def gh_text(args, repo=None):
    cmd = ["gh"]
    # `gh api` does not accept `-R/--repo` on all gh versions. API calls use
    # explicit endpoints (repos/{owner}/{repo}/...), so the flag is unneeded.
    if repo and (not args or args[0] != "api"):
        cmd.extend(["-R", repo])
    cmd.extend(args)
    try:
        proc = subprocess.run(cmd, check=True, capture_output=True, text=True)
    except FileNotFoundError as err:
        raise GhCommandError("`gh` command not found") from err
    except subprocess.CalledProcessError as err:
        raise GhCommandError(_format_gh_error(cmd, err)) from err
    return proc.stdout


def gh_json(args, repo=None):
    raw = gh_text(args, repo=repo).strip()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as err:
        raise GhCommandError(f"Failed to parse JSON from gh output for {' '.join(args)}") from err


def resolve_repo(repo_override=None):
    if repo_override:
        return repo_override
    data = gh_json(["repo", "view", "--json", "nameWithOwner"])
    if not isinstance(data, dict) or not data.get("nameWithOwner"):
        raise GhCommandError("Unable to determine OWNER/REPO from `gh repo view`")
    return str(data["nameWithOwner"])


def resolve_sha(repo, sha_spec):
    if sha_spec != "auto":
        if not re.fullmatch(r"[0-9a-fA-F]{4,40}", sha_spec):
            raise ValueError("--sha must be 'auto' or a commit SHA")
        return sha_spec.lower()
    data = gh_json(["api", f"repos/{repo}/commits/main"])
    if not isinstance(data, dict) or not data.get("sha"):
        raise GhCommandError("Unable to determine main HEAD from the commits API")
    return str(data["sha"])


def load_state(path):
    if path.exists():
        try:
            data = json.loads(path.read_text())
        except json.JSONDecodeError as err:
            raise RuntimeError(f"State file is not valid JSON: {path}") from err
        if not isinstance(data, dict):
            raise RuntimeError(f"State file must contain an object: {path}")
        return data, False
    return {
        "repo": None,
        "started_at": None,
        "last_seen_sha": None,
        "retries_by_sha": {},
        "last_snapshot_at": None,
    }, True


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(state, indent=2, sort_keys=True) + "\n"
    fd, tmp_name = tempfile.mkstemp(prefix=f"{path.name}.", suffix=".tmp", dir=path.parent)
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_file:
            tmp_file.write(payload)
        os.replace(tmp_path, path)
    except Exception:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise


def default_state_file_for(repo, sha):
    repo_slug = repo.replace("/", "-")
    return Path(f"/tmp/muse-babysit-release-{repo_slug}-{sha[:12]}.json")


def summarize_run(run):
    status = str(run.get("status") or "")
    conclusion = str(run.get("conclusion") or "")
    return {
        "run_id": run.get("id"),
        "workflow_name": str(run.get("name") or ""),
        "head_sha": str(run.get("head_sha") or ""),
        "status": status,
        "conclusion": conclusion,
        "terminal": status.lower() == "completed",
        "pending": status.lower() in PENDING_RUN_STATUSES,
        "failed": conclusion in FAILED_RUN_CONCLUSIONS,
        "html_url": str(run.get("html_url") or ""),
    }


def get_workflow_runs(repo, workflow_file, head_sha=None):
    endpoint = f"repos/{repo}/actions/workflows/{workflow_file}/runs"
    cmd = ["api", endpoint, "-X", "GET", "-f", "per_page=5"]
    if head_sha:
        cmd.extend(["-f", f"head_sha={head_sha}"])
    data = gh_json(cmd, repo=repo)
    if not isinstance(data, dict):
        raise GhCommandError(f"Unexpected payload from workflow runs API for {workflow_file}")
    runs = data.get("workflow_runs") or []
    if not isinstance(runs, list):
        raise GhCommandError(f"Expected `workflow_runs` to be a list for {workflow_file}")
    return runs


def get_jobs_for_run(repo, run_id):
    endpoint = f"repos/{repo}/actions/runs/{run_id}/jobs"
    data = gh_json(["api", endpoint, "-X", "GET", "-f", "per_page=100"], repo=repo)
    if not isinstance(data, dict):
        raise GhCommandError("Unexpected payload from actions run jobs API")
    jobs = data.get("jobs") or []
    if not isinstance(jobs, list):
        raise GhCommandError("Expected `jobs` to be a list")
    return jobs


def failed_jobs_for_runs(repo, runs):
    """Collect failed jobs for runs worth diagnosing.

    Completed runs with a non-failed conclusion are skipped; every other run
    (failed, or still in flight with an early job failure) gets its failed
    jobs surfaced with a direct logs endpoint.
    """
    failed_jobs = []
    for run in runs:
        if not isinstance(run, dict):
            continue
        run_id = run.get("id")
        if run_id in (None, ""):
            continue
        status = str(run.get("status") or "")
        conclusion = str(run.get("conclusion") or "")
        if status.lower() == "completed" and conclusion not in FAILED_RUN_CONCLUSIONS:
            continue
        for job in get_jobs_for_run(repo, run_id):
            if not isinstance(job, dict):
                continue
            job_conclusion = str(job.get("conclusion") or "")
            if job_conclusion not in FAILED_RUN_CONCLUSIONS:
                continue
            job_id = job.get("id")
            logs_endpoint = None
            if job_id not in (None, ""):
                logs_endpoint = f"repos/{repo}/actions/jobs/{job_id}/logs"
            failed_jobs.append(
                {
                    "run_id": run_id,
                    "workflow_name": str(run.get("name") or ""),
                    "run_status": status,
                    "run_conclusion": conclusion,
                    "job_id": job_id,
                    "job_name": str(job.get("name") or ""),
                    "conclusion": job_conclusion,
                    "html_url": str(job.get("html_url") or ""),
                    "logs_endpoint": logs_endpoint,
                }
            )
    failed_jobs.sort(
        key=lambda item: (
            str(item.get("workflow_name") or ""),
            str(item.get("job_name") or ""),
            str(item.get("job_id") or ""),
        )
    )
    return failed_jobs


def fetch_json_url(url):
    """Best-effort fetch of a live JSON marker; never raises."""
    try:
        # Cloudflare bot management blocks the default Python-urllib
        # user-agent; identify honestly instead.
        request = urllib.request.Request(
            url,
            headers={
                "Cache-Control": "no-cache",
                "User-Agent": "muse-babysit-release/1.0 (+release watcher)",
            },
        )
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            return {"ok": True, "status": response.status, "payload": json.loads(response.read())}
    except Exception as err:  # noqa: BLE001 - liveness probes must not fail the snapshot
        return {"ok": False, "error": f"{type(err).__name__}: {err}"}


def collect_live_markers():
    """Trimmed live markers: versions only, never full payloads.

    Full documents (e.g. android/latest.json notes arrays) are noise in every
    snapshot; keep the identity fields the watcher decides on and record
    fetch failures as short error strings.
    """
    web = fetch_json_url(WEB_RELEASE_JSON_URL)
    android = fetch_json_url(ANDROID_LATEST_JSON_URL)
    markers = {}
    web_payload = web.get("payload") if web.get("ok") else None
    markers["web_app_version"] = (
        web_payload.get("appVersion") if isinstance(web_payload, dict) else None
    )
    if not web.get("ok"):
        markers["web_fetch_error"] = str(web.get("error") or "unknown")
    android_payload = android.get("payload") if android.get("ok") else None
    if isinstance(android_payload, dict):
        markers["android_identity"] = {
            "version": android_payload.get("version"),
            "versionCode": android_payload.get("versionCode"),
        }
    else:
        markers["android_identity"] = None
        if not android.get("ok"):
            markers["android_fetch_error"] = str(android.get("error") or "unknown")
    return markers


def current_retry_count(state, sha):
    retries = state.get("retries_by_sha") or {}
    try:
        return int(retries.get(sha, 0))
    except (TypeError, ValueError):
        return 0


def set_retry_count(state, sha, count):
    retries = state.get("retries_by_sha")
    if not isinstance(retries, dict):
        retries = {}
    retries[sha] = int(count)
    state["retries_by_sha"] = retries


def unique_actions(actions):
    out = []
    seen = set()
    for action in actions:
        if action not in seen:
            out.append(action)
            seen.add(action)
    return out


def recommend_actions(tracks, failed_jobs, live_markers, retries_used, max_retries, expect_version=None):
    """Decide watcher actions from one snapshot of track states.

    `tracks` maps track name -> latest summarized run (or None when the
    workflow has no run for the watched SHA yet).
    """
    actions = []
    ci = tracks.get("ci")
    release = tracks.get("release")

    ci_failed = bool(ci and ci["failed"])
    ci_green = bool(ci and ci["terminal"] and ci["conclusion"] == "success")

    if ci_failed:
        actions.append("diagnose_ci_failure")

    if release is not None:
        conclusion = release["conclusion"]
        if conclusion in FAILED_RUN_CONCLUSIONS:
            # A `skipped` release on top of a failed CI run is by design; the
            # CI diagnosis above already covers it.
            if not (conclusion == "skipped" and not ci_green):
                actions.append("diagnose_release_failure")
        elif conclusion == "skipped" and ci_green:
            # Terminal-skip with green CI: either a correct no-op
            # (docs/test/chore-only) or a guard trip. Needs one agent check.
            actions.append("check_release_needed")

    for track, action in (("android", "diagnose_android_failure"), ("ota", "diagnose_ota_failure")):
        run = tracks.get(track)
        if run is not None and run["failed"]:
            actions.append(action)

    terminal_failed_runs = [
        run
        for run in tracks.values()
        if run is not None and run["terminal"] and run["failed"]
    ]
    # A by-design release skip is not a rerun candidate.
    terminal_failed_runs = [
        run
        for run in terminal_failed_runs
        if not (
            run["workflow_name"] == "Production Release"
            and run["conclusion"] == "skipped"
            and not ci_green
        )
    ]
    if terminal_failed_runs:
        if retries_used >= max_retries:
            actions.append("stop_exhausted_retries")
        else:
            actions.append("retry_failed_checks")

    mobile_in_flight = any(
        tracks.get(track) is not None and not tracks[track]["terminal"]
        for track in ("android", "ota")
    )

    if release is not None and release["conclusion"] == "success" and not mobile_in_flight:
        if expect_version:
            live_version = live_markers.get("web_app_version")
            if live_version != expect_version:
                actions.append("verify_production")
            elif not actions:
                actions.append("stop_released")
        elif not actions:
            actions.append("stop_released")

    if not actions:
        actions.append("idle")
    return unique_actions(actions)


def collect_snapshot(args):
    repo = resolve_repo(args.repo)
    sha = resolve_sha(repo, args.sha)
    state_path = Path(args.state_file) if args.state_file else default_state_file_for(repo, sha)
    state, _ = load_state(state_path)

    if not state.get("started_at"):
        state["started_at"] = int(time.time())

    tracks = {}
    diagnosable_runs = []
    for track, workflow_file in TRACKS:
        # CI and release are scoped to the watched SHA via the API. The manual
        # android/ota dispatches are tracked via their latest runs, but only
        # when dispatched from the watched SHA; older runs belong to previous
        # releases and must not block this watch.
        scoped_sha = sha if track in ("ci", "release") else None
        runs = get_workflow_runs(repo, workflow_file, head_sha=scoped_sha)
        raw_latest = runs[0] if runs else None
        # failed_jobs_for_runs reads raw API payloads (numeric `id`), not
        # summarized runs, so keep the raw payload for diagnosis.
        if (
            raw_latest is not None
            and track in ("android", "ota")
            and str(raw_latest.get("head_sha") or "") != sha
        ):
            raw_latest = None
        latest = summarize_run(raw_latest) if raw_latest is not None else None
        tracks[track] = latest
        if raw_latest is not None:
            diagnosable_runs.append(raw_latest)

    failed_jobs = failed_jobs_for_runs(repo, diagnosable_runs)
    live_markers = collect_live_markers()

    retries_used = current_retry_count(state, sha)
    actions = recommend_actions(
        tracks,
        failed_jobs,
        live_markers,
        retries_used,
        args.max_flaky_retries,
        expect_version=args.expect_version,
    )

    state["repo"] = repo
    state["last_seen_sha"] = sha
    state["last_snapshot_at"] = int(time.time())
    save_state(state_path, state)

    return {
        "repo": repo,
        "sha": sha,
        "tracks": tracks,
        "failed_jobs": failed_jobs,
        "live": live_markers,
        "actions": actions,
        "retry_state": {
            "current_sha_retries_used": retries_used,
            "max_flaky_retries": args.max_flaky_retries,
        },
    }, state_path


def terminal_failed_run_ids(snapshot):
    ids = []
    for run in (snapshot.get("tracks") or {}).values():
        if not isinstance(run, dict):
            continue
        if not (run.get("terminal") and run.get("conclusion") in FAILED_RUN_CONCLUSIONS):
            continue
        if (
            run.get("workflow_name") == "Production Release"
            and run.get("conclusion") == "skipped"
        ):
            # By-design skip on red CI (or a no-op guard); rerunning changes nothing.
            continue
        if run.get("run_id") not in (None, ""):
            ids.append(run["run_id"])
    return ids


def retry_failed_now(args):
    snapshot, state_path = collect_snapshot(args)
    sha = snapshot["sha"]
    retries_used = snapshot["retry_state"]["current_sha_retries_used"]
    max_retries = snapshot["retry_state"]["max_flaky_retries"]

    result = {
        "snapshot": snapshot,
        "state_file": str(state_path),
        "rerun_attempted": False,
        "rerun_count": 0,
        "rerun_run_ids": [],
        "reason": None,
    }

    run_ids = terminal_failed_run_ids(snapshot)
    if not run_ids:
        result["reason"] = "no_failed_runs"
        return result
    if retries_used >= max_retries:
        result["reason"] = "retry_budget_exhausted"
        return result

    for run_id in run_ids:
        gh_text(["run", "rerun", str(run_id), "--failed"], repo=snapshot["repo"])
        result["rerun_run_ids"].append(run_id)

    state, _ = load_state(state_path)
    set_retry_count(state, sha, current_retry_count(state, sha) + 1)
    state["last_snapshot_at"] = int(time.time())
    save_state(state_path, state)
    result["rerun_attempted"] = True
    result["rerun_count"] = len(result["rerun_run_ids"])
    result["reason"] = "rerun_triggered"
    return result


def print_json(obj):
    sys.stdout.write(json.dumps(obj, sort_keys=True) + "\n")
    sys.stdout.flush()


def print_event(event, payload):
    print_json({"event": event, "payload": payload})


def snapshot_change_key(snapshot):
    key = [str(snapshot.get("sha") or "")]
    for track in ("ci", "release", "android", "ota"):
        run = (snapshot.get("tracks") or {}).get(track) or {}
        key.append(f"{track}:{run.get('status') or '-'}:{run.get('conclusion') or '-'}")
    live = snapshot.get("live") or {}
    key.append(str(live.get("web_app_version") or "-"))
    android = live.get("android_identity") or {}
    key.append(str(android.get("versionCode") or "-"))
    key.append(",".join(snapshot.get("actions") or []))
    return tuple(key)


def heartbeat_path_for(args, state_path):
    if args.heartbeat_file:
        return Path(args.heartbeat_file)
    return state_path.with_suffix(".log")


def write_heartbeat(path, snapshot, changed):
    """One tiny liveness line per poll. Never fails the watch."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S")
        actions = ",".join(snapshot.get("actions") or [])
        line = (
            f"{timestamp} sha={str(snapshot.get('sha') or '')[:12]} "
            f"changed={str(bool(changed)).lower()} actions={actions}\n"
        )
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(line)
    except OSError:
        pass


STOP_ACTIONS = {"stop_released", "stop_exhausted_retries"}


def run_watch(args):
    # Stdout is precious: the harness wakes the session on process output, so
    # every printed line costs tokens. Print the full snapshot only when
    # something changed (or on a stop event); unchanged polls leave exactly
    # one liveness line in the heartbeat file and print nothing.
    print_event("watch_started", {"poll_seconds": args.poll_seconds})
    last_change_key = None
    heartbeat_path = None
    while True:
        snapshot, state_path = collect_snapshot(args)
        if heartbeat_path is None:
            heartbeat_path = heartbeat_path_for(args, state_path)
        changed = snapshot_change_key(snapshot) != last_change_key
        last_change_key = snapshot_change_key(snapshot)
        write_heartbeat(heartbeat_path, snapshot, changed)
        actions = set(snapshot.get("actions") or [])
        stopping = bool(actions & STOP_ACTIONS)
        if changed or stopping:
            print_event(
                "snapshot",
                {
                    "snapshot": snapshot,
                    "state_file": str(state_path),
                    "heartbeat_file": str(heartbeat_path),
                    "changed": changed,
                    "next_poll_seconds": args.poll_seconds,
                },
            )
        if stopping:
            print_event(
                "stop",
                {"actions": snapshot.get("actions"), "sha": snapshot.get("sha")},
            )
            return 0
        time.sleep(args.poll_seconds)


def main():
    args = parse_args()
    try:
        if args.retry_failed_now:
            print_json(retry_failed_now(args))
            return 0
        if args.watch:
            return run_watch(args)
        snapshot, state_path = collect_snapshot(args)
        snapshot["state_file"] = str(state_path)
        print_json(snapshot)
        return 0
    except (GhCommandError, RuntimeError, ValueError) as err:
        sys.stderr.write(f"gh_release_watch.py error: {err}\n")
        return 1
    except KeyboardInterrupt:
        sys.stderr.write("gh_release_watch.py interrupted\n")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
