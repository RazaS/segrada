from __future__ import annotations

import json
import os
import sqlite3
import time
from io import BytesIO
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from uuid import uuid4
from zoneinfo import ZoneInfo

from flask import (
    Flask,
    current_app,
    g,
    jsonify,
    render_template,
    request,
    send_from_directory,
    session,
)
from PIL import Image, ImageOps
from werkzeug.datastructures import FileStorage
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

USERS = {
    "victoria": {
        "password": "sashakitty",
        "display_name": "Victoria",
    },
    "raza": {
        "password": "kojikitty",
        "display_name": "Raza",
    },
}

TASKS = [
    {"id": "feed", "label": "Feed"},
    {"id": "litter_clean", "label": "Litter Clean"},
    {"id": "dog_walk", "label": "Dog Walk"},
]

TASK_LABELS = {task["id"]: task["label"] for task in TASKS}

WEATHER_CODE_LABELS = {
    0: "Clear sky",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light rain showers",
    81: "Rain showers",
    82: "Heavy rain showers",
    85: "Light snow showers",
    86: "Snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail",
}

ALLOWED_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
TORONTO_TZ = ZoneInfo("America/Toronto")


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def format_upload_limit(limit_bytes: int) -> str:
    if limit_bytes >= 1024 * 1024:
        megabytes = limit_bytes / (1024 * 1024)
        if megabytes.is_integer():
            return f"{int(megabytes)} MB"
        return f"{megabytes:.1f} MB"
    if limit_bytes >= 1024:
        kilobytes = limit_bytes / 1024
        if kilobytes.is_integer():
            return f"{int(kilobytes)} KB"
        return f"{kilobytes:.1f} KB"
    return f"{limit_bytes} bytes"


def public_user(username: str | None) -> dict | None:
    if not username or username not in USERS:
        return None
    return {
        "username": username,
        "display_name": USERS[username]["display_name"],
    }


def get_current_username() -> str | None:
    username = session.get("username")
    if username not in USERS:
        return None
    return username


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(current_app.config["DATABASE"])
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        g.db = connection
    return g.db


def close_db(_: object | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    db = get_db()
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            image_path TEXT,
            post_type TEXT NOT NULL DEFAULT 'post',
            task_type TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    db.commit()


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not get_current_username():
            return jsonify({"error": "Authentication required."}), 401
        return view(*args, **kwargs)

    return wrapped_view


def serialize_post(row: sqlite3.Row, current_username: str | None) -> dict:
    return {
        "id": row["id"],
        "author": row["author"],
        "author_name": USERS[row["author"]]["display_name"],
        "content": row["content"],
        "image_url": f"/uploads/{row['image_path']}" if row["image_path"] else None,
        "post_type": row["post_type"],
        "task_type": row["task_type"],
        "task_label": TASK_LABELS.get(row["task_type"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "can_edit": current_username == row["author"],
    }


def get_post(post_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        """
        SELECT id, author, content, image_path, post_type, task_type, created_at, updated_at
        FROM posts
        WHERE id = ?
        """,
        (post_id,),
    ).fetchone()


def parse_bool(value: object) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def save_upload(file_storage: FileStorage | None) -> str | None:
    if not file_storage or not file_storage.filename:
        return None

    original_name = secure_filename(file_storage.filename)
    extension = Path(original_name).suffix.lower()
    if extension not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValueError("Unsupported image format. Use JPG, PNG, GIF, or WEBP.")

    max_dimension = int(current_app.config["MAX_IMAGE_DIMENSION"])

    try:
        file_storage.stream.seek(0)
        file_bytes = file_storage.read()
        with Image.open(BytesIO(file_bytes)) as image:
            image.load()
            processed = ImageOps.exif_transpose(image)
            processed.thumbnail(
                (max_dimension, max_dimension),
                Image.Resampling.LANCZOS,
            )

            if extension in {".jpg", ".jpeg"}:
                stored_name = f"{uuid4().hex}.jpg"
                destination = Path(current_app.config["UPLOAD_FOLDER"]) / stored_name
                rgb_image = processed.convert("RGB")
                rgb_image.save(
                    destination,
                    format="JPEG",
                    quality=current_app.config["JPEG_QUALITY"],
                    optimize=True,
                )
            elif extension == ".png":
                stored_name = f"{uuid4().hex}.png"
                destination = Path(current_app.config["UPLOAD_FOLDER"]) / stored_name
                processed.save(destination, format="PNG", optimize=True)
            elif extension == ".webp":
                stored_name = f"{uuid4().hex}.webp"
                destination = Path(current_app.config["UPLOAD_FOLDER"]) / stored_name
                webp_image = processed
                if webp_image.mode not in {"RGB", "RGBA"}:
                    webp_image = webp_image.convert("RGBA")
                webp_image.save(
                    destination,
                    format="WEBP",
                    quality=current_app.config["WEBP_QUALITY"],
                    method=6,
                )
            else:
                stored_name = f"{uuid4().hex}.gif"
                destination = Path(current_app.config["UPLOAD_FOLDER"]) / stored_name
                processed.save(destination, format="GIF", optimize=True)
    except Exception as error:
        raise ValueError("Could not process the uploaded image.") from error

    return stored_name


def delete_upload(stored_name: str | None) -> None:
    if not stored_name:
        return
    destination = Path(current_app.config["UPLOAD_FOLDER"]) / stored_name
    if destination.exists():
        destination.unlink()


def task_status_snapshot() -> list[dict]:
    rows = get_db().execute(
        """
        SELECT task_type, MAX(created_at) AS last_completed_at
        FROM posts
        WHERE post_type = 'task'
        GROUP BY task_type
        """
    ).fetchall()
    last_completed_map = {
        row["task_type"]: row["last_completed_at"]
        for row in rows
        if row["task_type"] in TASK_LABELS
    }
    return [
        {
            "id": task["id"],
            "label": task["label"],
            "last_completed_at": last_completed_map.get(task["id"]),
        }
        for task in TASKS
    ]


def fetch_weather_snapshot() -> dict:
    cache = current_app.extensions.setdefault(
        "weather_cache",
        {"data": None, "expires_at": 0.0},
    )
    now = time.time()
    if cache["data"] and now < cache["expires_at"]:
        return cache["data"]

    toronto_now = datetime.now(TORONTO_TZ).replace(microsecond=0)
    params = urlencode(
        {
            "latitude": 43.6532,
            "longitude": -79.3832,
            "current": "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
            "timezone": "America/Toronto",
        }
    )

    data = {
        "city": "Toronto",
        "timezone": "America/Toronto",
        "fetched_at": toronto_now.isoformat(),
        "available": False,
        "condition": "Unavailable",
        "temperature_c": None,
        "apparent_temperature_c": None,
        "wind_kph": None,
        "observed_at": None,
    }

    try:
        with urlopen(
            f"https://api.open-meteo.com/v1/forecast?{params}",
            timeout=5,
        ) as response:
            payload = json.load(response)

        current = payload.get("current") or {}
        observed_at = current.get("time")
        observed_at_iso = None
        if observed_at:
            observed_at_iso = (
                datetime.fromisoformat(observed_at)
                .replace(tzinfo=TORONTO_TZ)
                .isoformat()
            )

        data = {
            "city": "Toronto",
            "timezone": "America/Toronto",
            "fetched_at": toronto_now.isoformat(),
            "available": True,
            "condition": WEATHER_CODE_LABELS.get(
                current.get("weather_code"),
                "Current conditions",
            ),
            "temperature_c": current.get("temperature_2m"),
            "apparent_temperature_c": current.get("apparent_temperature"),
            "wind_kph": current.get("wind_speed_10m"),
            "observed_at": observed_at_iso,
        }
    except Exception:
        pass

    cache["data"] = data
    cache["expires_at"] = now + current_app.config["WEATHER_CACHE_SECONDS"]
    return data


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    base_dir = Path(app.root_path)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "pet-timeline-dev-secret"),
        DATABASE=str(base_dir / "data" / "pets.db"),
        UPLOAD_FOLDER=str(base_dir / "uploads"),
        WEATHER_CACHE_SECONDS=600,
        MAX_IMAGE_DIMENSION=1600,
        JPEG_QUALITY=82,
        WEBP_QUALITY=82,
        MAX_CONTENT_LENGTH=25 * 1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE") == "1",
        PERMANENT_SESSION_LIFETIME=timedelta(days=365),
    )

    if test_config:
        app.config.update(test_config)

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)

    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.errorhandler(RequestEntityTooLarge)
    def handle_too_large(_: RequestEntityTooLarge):
        limit_label = format_upload_limit(current_app.config["MAX_CONTENT_LENGTH"])
        return (
            jsonify(
                {
                    "error": f"Photo upload is too large. Keep it under {limit_label}."
                }
            ),
            413,
        )

    @app.get("/uploads/<path:filename>")
    @login_required
    def uploaded_file(filename: str):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    @app.get("/api/session")
    def session_state():
        username = get_current_username()
        return jsonify(
            {
                "authenticated": bool(username),
                "user": public_user(username),
            }
        )

    @app.post("/api/login")
    def login():
        payload = request.get_json(silent=True) or {}
        username = str(payload.get("username", "")).strip().lower()
        password = str(payload.get("password", ""))
        user = USERS.get(username)
        if not user or user["password"] != password:
            return jsonify({"error": "Invalid username or password."}), 401

        session.permanent = True
        session["username"] = username
        return jsonify({"user": public_user(username)})

    @app.post("/api/logout")
    def logout():
        session.clear()
        return jsonify({"ok": True})

    @app.get("/api/posts")
    @login_required
    def list_posts():
        current_username = get_current_username()
        rows = get_db().execute(
            """
            SELECT id, author, content, image_path, post_type, task_type, created_at, updated_at
            FROM posts
            ORDER BY datetime(created_at) DESC, id DESC
            """
        ).fetchall()
        return jsonify(
            {
                "posts": [
                    serialize_post(row, current_username)
                    for row in rows
                ]
            }
        )

    @app.post("/api/posts")
    @login_required
    def create_post():
        content = request.form.get("content", "").strip()
        photo = request.files.get("photo")
        if not content and not (photo and photo.filename):
            return jsonify({"error": "Add some text or attach a photo."}), 400

        try:
            image_path = save_upload(photo)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        timestamp = now_utc_iso()
        db = get_db()
        cursor = db.execute(
            """
            INSERT INTO posts (author, content, image_path, post_type, task_type, created_at, updated_at)
            VALUES (?, ?, ?, 'post', NULL, ?, ?)
            """,
            (
                get_current_username(),
                content,
                image_path,
                timestamp,
                timestamp,
            ),
        )
        db.commit()

        created = get_post(cursor.lastrowid)
        return jsonify({"post": serialize_post(created, get_current_username())}), 201

    @app.route("/api/posts/<int:post_id>", methods=["PUT", "PATCH"])
    @login_required
    def update_post(post_id: int):
        existing = get_post(post_id)
        if not existing:
            return jsonify({"error": "Post not found."}), 404
        if existing["author"] != get_current_username():
            return jsonify({"error": "You can only edit your own posts."}), 403

        content = request.form.get("content", existing["content"]).strip()
        remove_photo = parse_bool(request.form.get("removePhoto"))
        new_photo = request.files.get("photo")
        next_image_path = existing["image_path"]

        try:
            if new_photo and new_photo.filename:
                saved_name = save_upload(new_photo)
                delete_upload(existing["image_path"])
                next_image_path = saved_name
            elif remove_photo:
                delete_upload(existing["image_path"])
                next_image_path = None
        except ValueError as error:
            return jsonify({"error": str(error)}), 400

        if existing["post_type"] == "post" and not content and not next_image_path:
            return jsonify({"error": "A regular post needs text or a photo."}), 400

        timestamp = now_utc_iso()
        db = get_db()
        db.execute(
            """
            UPDATE posts
            SET content = ?, image_path = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                content,
                next_image_path,
                timestamp,
                post_id,
            ),
        )
        db.commit()

        updated = get_post(post_id)
        return jsonify({"post": serialize_post(updated, get_current_username())})

    @app.delete("/api/posts/<int:post_id>")
    @login_required
    def delete_post(post_id: int):
        existing = get_post(post_id)
        if not existing:
            return jsonify({"error": "Post not found."}), 404
        if existing["author"] != get_current_username():
            return jsonify({"error": "You can only delete your own posts."}), 403

        db = get_db()
        db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        db.commit()
        delete_upload(existing["image_path"])
        return jsonify({"ok": True})

    @app.post("/api/quick-log")
    @login_required
    def quick_log():
        payload = request.get_json(silent=True) or {}
        task_type = str(payload.get("task", "")).strip()
        notes = str(payload.get("notes", "")).strip()
        if task_type not in TASK_LABELS:
            return jsonify({"error": "Unknown task."}), 400

        timestamp = now_utc_iso()
        db = get_db()
        cursor = db.execute(
            """
            INSERT INTO posts (author, content, image_path, post_type, task_type, created_at, updated_at)
            VALUES (?, ?, NULL, 'task', ?, ?, ?)
            """,
            (
                get_current_username(),
                notes,
                task_type,
                timestamp,
                timestamp,
            ),
        )
        db.commit()

        created = get_post(cursor.lastrowid)
        return jsonify({"post": serialize_post(created, get_current_username())}), 201

    @app.get("/api/tasks")
    @login_required
    def task_status():
        return jsonify({"tasks": task_status_snapshot()})

    @app.get("/api/weather")
    @login_required
    def weather():
        return jsonify(fetch_weather_snapshot())

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.environ.get("FLASK_HOST", "0.0.0.0"),
        port=int(os.environ.get("FLASK_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
