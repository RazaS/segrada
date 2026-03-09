import unittest
from datetime import datetime
from pathlib import Path
import tempfile

from app import create_app


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
        self.assertIn("days_since_used", payload["body_parts"][0])

        names = {exercise["name"] for exercise in payload["exercises"]}
        self.assertIn("Hip thrusts", names)
        self.assertIn("Bench press", names)
        self.assertIn("Flexion", names)

    def test_workout_logging_updates_defaults_and_calendar(self):
        self.login()

        dashboard = self.client.get("/api/dashboard").get_json()
        exercises = {exercise["name"]: exercise for exercise in dashboard["exercises"]}

        response = self.client.post(
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
        self.assertEqual(response.status_code, 201)
        payload = response.get_json()
        self.assertEqual(payload["event"]["event_type"], "workout")
        self.assertEqual(payload["event"]["exercise_count"], 2)
        self.assertTrue(payload["event"]["has_pr"])
        self.assertTrue(payload["event"]["entries"][0]["is_pr"])

        hip_thrusts = next(
            exercise for exercise in payload["exercises"] if exercise["name"] == "Hip thrusts"
        )
        self.assertEqual(hip_thrusts["last_weight"], 185)
        self.assertEqual(hip_thrusts["max_weight"], 185)

        month_key = datetime.now().strftime("%Y-%m")
        calendar_response = self.client.get(f"/api/calendar?month={month_key}")
        self.assertEqual(calendar_response.status_code, 200)
        self.assertIn(datetime.now().day, calendar_response.get_json()["workout_days"])

        dashboard_after = self.client.get("/api/dashboard").get_json()
        legs = next(part for part in dashboard_after["body_parts"] if part["id"] == "legs")
        self.assertEqual(legs["days_since_used"], 0)

    def test_diet_logs_appear_in_timeline(self):
        self.login()

        shake_response = self.client.post("/api/diet/protein-shake")
        self.assertEqual(shake_response.status_code, 201)

        meal_response = self.client.post(
            "/api/diet/meal",
            json={"high_protein": True},
        )
        self.assertEqual(meal_response.status_code, 201)

        dashboard = self.client.get("/api/dashboard").get_json()
        event_types = [event["event_type"] for event in dashboard["timeline"]]
        self.assertEqual(event_types[:2], ["meal", "protein_shake"])
        self.assertTrue(dashboard["timeline"][0]["high_protein"])

    def test_custom_section_and_exercise_can_be_added_moved_and_hidden(self):
        self.login()

        body_part_response = self.client.post(
            "/api/body-parts",
            json={"label": "Cardio"},
        )
        self.assertEqual(body_part_response.status_code, 201)
        body_part = body_part_response.get_json()["body_part"]
        self.assertEqual(body_part["label"], "Cardio")

        create_response = self.client.post(
            "/api/exercises",
            json={"name": "Cable curls", "body_part": body_part["id"]},
        )
        self.assertEqual(create_response.status_code, 201)
        exercise = create_response.get_json()["exercise"]
        self.assertTrue(exercise["is_active"])
        self.assertTrue(exercise["is_custom"])
        self.assertEqual(exercise["body_part_label"], "Cardio")

        move_response = self.client.patch(
            f"/api/exercises/{exercise['id']}",
            json={"body_part": "arms"},
        )
        self.assertEqual(move_response.status_code, 200)
        self.assertEqual(move_response.get_json()["exercise"]["body_part"], "arms")

        hide_response = self.client.patch(
            f"/api/exercises/{exercise['id']}",
            json={"is_active": False},
        )
        self.assertEqual(hide_response.status_code, 200)
        self.assertFalse(hide_response.get_json()["exercise"]["is_active"])

        dashboard = self.client.get("/api/dashboard").get_json()
        labels = {part["label"] for part in dashboard["body_parts"]}
        self.assertIn("Cardio", labels)
        stored = next(
            item for item in dashboard["exercises"] if item["name"] == "Cable curls"
        )
        self.assertFalse(stored["is_active"])
        self.assertEqual(stored["body_part"], "arms")

    def test_protected_routes_require_login(self):
        response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
