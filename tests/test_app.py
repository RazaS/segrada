import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile

from app import create_app, get_db


class WorkoutLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_path = Path(self.temp_dir.name)
        self.app = create_app(
            {
                "TESTING": True,
                "SECRET_KEY": "test-secret",
                "DATABASE": str(temp_path / "test.db"),
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def login(self, username="raza", password="password"):
        return self.client.post(
            "/api/login",
            json={"username": username, "password": password},
        )

    def dashboard(self):
        return self.client.get("/api/dashboard").get_json()

    def exercise_by_name(self, name):
        exercises = self.dashboard()["exercises"]
        return next(exercise for exercise in exercises if exercise["name"] == name)

    def test_login_sets_persistent_session(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["user"]["username"], "raza")
        self.assertIn("Expires=", response.headers.get("Set-Cookie", ""))

        with self.client.session_transaction() as session_state:
            self.assertTrue(session_state.permanent)

        session_response = self.client.get("/api/session")
        self.assertEqual(session_response.status_code, 200)
        self.assertTrue(session_response.get_json()["authenticated"])

    def test_dashboard_has_seeded_exercises(self):
        self.login()

        response = self.client.get("/api/dashboard?month=2026-03")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(len(payload["body_parts"]), 7)
        self.assertEqual(len(payload["exercises"]), 21)
        self.assertIsNone(payload["active_queue"])
        self.assertIn("days_since_used", payload["body_parts"][0])
        self.assertIn("last_used_at", payload["body_parts"][0])

        names = {exercise["name"] for exercise in payload["exercises"]}
        self.assertIn("Hip thrusts", names)
        self.assertIn("Bench press", names)
        self.assertIn("Flexion", names)

    def test_workout_logging_builds_queue_updates_defaults_and_calendar(self):
        self.login()
        exercises = {exercise["name"]: exercise for exercise in self.dashboard()["exercises"]}

        first_response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": exercises["Hip thrusts"]["id"],
                        "sets": 4,
                        "reps": 10,
                        "weight": 185,
                    },
                    {
                        "exercise_id": exercises["Smith squats"]["id"],
                        "sets": 3,
                        "reps": 8,
                        "weight": 135,
                    },
                ]
            },
        )
        self.assertEqual(first_response.status_code, 201)
        first_payload = first_response.get_json()
        self.assertEqual(first_payload["session"]["exercise_count"], 2)
        self.assertTrue(first_payload["session"]["has_pr"])
        self.assertTrue(first_payload["active_queue"]["is_active_queue"])

        second_response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": exercises["Hip thrusts"]["id"],
                        "sets": 2,
                        "reps": 8,
                        "weight": 170,
                    }
                ]
            },
        )
        self.assertEqual(second_response.status_code, 201)
        second_payload = second_response.get_json()
        self.assertEqual(second_payload["session"]["id"], first_payload["session"]["id"])
        self.assertEqual(second_payload["session"]["exercise_count"], 3)

        hip_thrusts = next(
            exercise for exercise in second_payload["exercises"] if exercise["name"] == "Hip thrusts"
        )
        self.assertEqual(hip_thrusts["last_weight"], 185)
        self.assertEqual(hip_thrusts["max_weight"], 185)

        month_key = datetime.now().strftime("%Y-%m")
        calendar_response = self.client.get(f"/api/calendar?month={month_key}")
        self.assertEqual(calendar_response.status_code, 200)
        self.assertIn(datetime.now().day, calendar_response.get_json()["workout_days"])

        dashboard_after = self.dashboard()
        legs = next(part for part in dashboard_after["body_parts"] if part["id"] == "legs")
        self.assertEqual(legs["days_since_used"], 0)
        self.assertIsNotNone(legs["last_used_at"])

    def test_negative_weights_can_be_logged_and_session_can_be_edited(self):
        self.login()
        pull_ups = self.exercise_by_name("Pull ups")

        response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": pull_ups["id"],
                        "sets": 3,
                        "reps": 6,
                        "weight": -30,
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 201)
        session = response.get_json()["session"]
        self.assertEqual(session["entries"][0]["weight"], -30)

        update_response = self.client.patch(
            f"/api/workout-sessions/{session['id']}",
            json={
                "entries": [
                    {
                        "id": session["entries"][0]["id"],
                        "sets": 3,
                        "reps": 6,
                        "weight": -25,
                    }
                ]
            },
        )
        self.assertEqual(update_response.status_code, 200)

        updated_session = update_response.get_json()["session"]
        self.assertEqual(updated_session["entries"][0]["weight"], -25)
        self.assertTrue(updated_session["entries"][0]["is_pr"])

        updated_pull_ups = next(
            exercise for exercise in update_response.get_json()["exercises"] if exercise["name"] == "Pull ups"
        )
        self.assertEqual(updated_pull_ups["last_weight"], -25)
        self.assertEqual(updated_pull_ups["max_weight"], -25)

    def test_queue_entry_delete_and_archive_endpoint(self):
        self.login()
        exercises = {exercise["name"]: exercise for exercise in self.dashboard()["exercises"]}

        response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": exercises["Bench press"]["id"],
                        "sets": 3,
                        "reps": 5,
                        "weight": 185,
                    },
                    {
                        "exercise_id": exercises["Bench flys"]["id"],
                        "sets": 3,
                        "reps": 10,
                        "weight": 40,
                    },
                ]
            },
        )
        self.assertEqual(response.status_code, 201)
        session = response.get_json()["session"]

        archive_response = self.client.get("/api/workout-sessions")
        self.assertEqual(archive_response.status_code, 200)
        self.assertEqual(len(archive_response.get_json()["sessions"]), 1)

        delete_response = self.client.delete(f"/api/workout-entries/{session['entries'][0]['id']}")
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.get_json()["active_queue"]["exercise_count"], 1)

        archive_after = self.client.get("/api/workout-sessions").get_json()["sessions"]
        self.assertEqual(len(archive_after), 1)
        self.assertEqual(archive_after[0]["exercise_count"], 1)

    def test_whole_workout_session_can_be_deleted(self):
        self.login()
        bench_press = self.exercise_by_name("Bench press")

        response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": bench_press["id"],
                        "sets": 3,
                        "reps": 5,
                        "weight": 185,
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 201)
        session = response.get_json()["session"]

        delete_response = self.client.delete(f"/api/workout-sessions/{session['id']}")
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.get_json()["ok"])
        self.assertIsNone(delete_response.get_json()["active_queue"])

        sessions = self.client.get("/api/workout-sessions").get_json()["sessions"]
        self.assertEqual(sessions, [])

        bench_press_after = self.exercise_by_name("Bench press")
        self.assertEqual(bench_press_after["last_weight"], 0)
        self.assertEqual(bench_press_after["max_weight"], 0)

    def test_timeline_keeps_diet_events_and_workout_sessions_separate(self):
        self.login()
        hip_thrusts = self.exercise_by_name("Hip thrusts")

        workout_response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": hip_thrusts["id"],
                        "sets": 4,
                        "reps": 10,
                        "weight": 185,
                    }
                ]
            },
        )
        self.assertEqual(workout_response.status_code, 201)

        meal_response = self.client.post(
            "/api/diet/meal",
            json={"high_protein": True},
        )
        self.assertEqual(meal_response.status_code, 201)

        timeline = self.dashboard()["timeline"]
        self.assertIn("meal", [item.get("event_type") for item in timeline[:2]])
        self.assertIn("workout_session", [item.get("item_type") for item in timeline[:2]])
        meal_item = next(item for item in timeline if item.get("event_type") == "meal")
        self.assertTrue(meal_item["high_protein"])

    def test_session_grouping_splits_after_six_hours(self):
        self.login()
        bench_press = self.exercise_by_name("Bench press")

        first_response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": bench_press["id"],
                        "sets": 3,
                        "reps": 5,
                        "weight": 185,
                    }
                ]
            },
        )
        self.assertEqual(first_response.status_code, 201)
        first_session_id = first_response.get_json()["session"]["id"]

        old_timestamp = (datetime.now(timezone.utc) - timedelta(hours=7)).replace(microsecond=0).isoformat()
        with self.app.app_context():
            db = get_db()
            db.execute(
                """
                UPDATE workout_sessions
                SET started_at = ?, last_logged_at = ?, created_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (old_timestamp, old_timestamp, old_timestamp, old_timestamp, first_session_id),
            )
            db.execute(
                """
                UPDATE workout_entries
                SET created_at = ?, updated_at = ?
                WHERE session_id = ?
                """,
                (old_timestamp, old_timestamp, first_session_id),
            )
            db.commit()

        second_response = self.client.post(
            "/api/workouts",
            json={
                "entries": [
                    {
                        "exercise_id": bench_press["id"],
                        "sets": 3,
                        "reps": 6,
                        "weight": 175,
                    }
                ]
            },
        )
        self.assertEqual(second_response.status_code, 201)
        self.assertNotEqual(second_response.get_json()["session"]["id"], first_session_id)

        sessions = self.client.get("/api/workout-sessions").get_json()["sessions"]
        self.assertEqual(len(sessions), 2)
        self.assertIsNotNone(self.dashboard()["active_queue"])

    def test_protected_routes_require_login(self):
        response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
