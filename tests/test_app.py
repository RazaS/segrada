import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from app import create_app


class PetTimelineAppTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        temp_path = Path(self.temp_dir.name)

        self.app = create_app(
            {
                "TESTING": True,
                "SECRET_KEY": "test-secret",
                "DATABASE": str(temp_path / "test.db"),
                "UPLOAD_FOLDER": str(temp_path / "uploads"),
                "WEATHER_CACHE_SECONDS": 0,
                "MAX_IMAGE_DIMENSION": 1200,
            }
        )
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def login(self, username="victoria", password="sashakitty"):
        return self.client.post(
            "/api/login",
            json={"username": username, "password": password},
        )

    def test_login_sets_session(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["user"]["username"], "victoria")

        session_response = self.client.get("/api/session")
        self.assertEqual(session_response.status_code, 200)
        self.assertTrue(session_response.get_json()["authenticated"])

    def test_create_edit_and_delete_post_with_photo(self):
        self.login()

        source_image = io.BytesIO()
        Image.new("RGB", (2400, 1800), color=(120, 160, 200)).save(
            source_image,
            format="JPEG",
        )
        source_image.seek(0)

        create_response = self.client.post(
            "/api/posts",
            data={
                "content": "Poppy did a dramatic flop.",
                "photo": (source_image, "poppy.jpg"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(create_response.status_code, 201)
        created_post = create_response.get_json()["post"]
        self.assertEqual(created_post["author"], "victoria")
        self.assertIsNotNone(created_post["image_url"])

        stored_name = created_post["image_url"].split("/")[-1]
        stored_path = Path(self.app.config["UPLOAD_FOLDER"]) / stored_name
        self.assertTrue(stored_path.exists())
        with Image.open(stored_path) as stored_image:
            width, height = stored_image.size
        self.assertLessEqual(max(width, height), self.app.config["MAX_IMAGE_DIMENSION"])

        update_response = self.client.put(
            f"/api/posts/{created_post['id']}",
            data={
                "content": "Poppy did a dramatic flop on the blanket.",
                "removePhoto": "true",
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(update_response.status_code, 200)
        updated_post = update_response.get_json()["post"]
        self.assertIsNone(updated_post["image_url"])
        self.assertFalse(stored_path.exists())

        delete_response = self.client.delete(f"/api/posts/{created_post['id']}")
        self.assertEqual(delete_response.status_code, 200)

        posts_response = self.client.get("/api/posts")
        self.assertEqual(posts_response.status_code, 200)
        self.assertEqual(posts_response.get_json()["posts"], [])

    def test_quick_log_updates_task_status_and_owner_permissions(self):
        self.login()

        quick_log_response = self.client.post(
            "/api/quick-log",
            json={"task": "feed", "notes": "Breakfast served."},
        )
        self.assertEqual(quick_log_response.status_code, 201)
        created_post = quick_log_response.get_json()["post"]
        self.assertEqual(created_post["task_type"], "feed")

        task_response = self.client.get("/api/tasks")
        self.assertEqual(task_response.status_code, 200)
        feed_task = next(
            task
            for task in task_response.get_json()["tasks"]
            if task["id"] == "feed"
        )
        self.assertIsNotNone(feed_task["last_completed_at"])

        self.client.post("/api/logout")
        self.login(username="raza", password="kojikitty")

        forbidden_response = self.client.delete(f"/api/posts/{created_post['id']}")
        self.assertEqual(forbidden_response.status_code, 403)

    def test_posts_persist_across_clients_and_uploads_require_login(self):
        first_client = self.app.test_client()
        second_client = self.app.test_client()
        anonymous_client = self.app.test_client()

        login_response = first_client.post(
            "/api/login",
            json={"username": "victoria", "password": "sashakitty"},
        )
        self.assertEqual(login_response.status_code, 200)

        source_image = io.BytesIO()
        Image.new("RGB", (1800, 1200), color=(80, 120, 190)).save(
            source_image,
            format="JPEG",
        )
        source_image.seek(0)

        create_response = first_client.post(
            "/api/posts",
            data={
                "content": "Shared across clients.",
                "photo": (source_image, "shared.jpg"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(create_response.status_code, 201)
        created_post = create_response.get_json()["post"]

        second_login = second_client.post(
            "/api/login",
            json={"username": "raza", "password": "kojikitty"},
        )
        self.assertEqual(second_login.status_code, 200)

        shared_feed_response = second_client.get("/api/posts")
        self.assertEqual(shared_feed_response.status_code, 200)
        posts = shared_feed_response.get_json()["posts"]
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["content"], "Shared across clients.")

        image_url = created_post["image_url"]
        anonymous_image_response = anonymous_client.get(image_url)
        self.assertEqual(anonymous_image_response.status_code, 401)
        anonymous_image_response.close()

        authenticated_image_response = second_client.get(image_url)
        self.assertEqual(authenticated_image_response.status_code, 200)
        authenticated_image_response.close()


if __name__ == "__main__":
    unittest.main()
