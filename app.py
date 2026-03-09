from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Flask, current_app, g, jsonify, render_template, request, session

USERS = {
    "raza": {
        "password": "password",
        "display_name": "Raza",
    }
}

BODY_PARTS = [
    {"id": "legs", "label": "Legs"},
    {"id": "shoulders", "label": "Shoulders"},
    {"id": "back", "label": "Back"},
    {"id": "chest", "label": "Chest"},
    {"id": "arms", "label": "Arms"},
    {"id": "abs", "label": "Abs"},
    {"id": "neck", "label": "Neck"},
]

BODY_PART_LABELS = {part["id"]: part["label"] for part in BODY_PARTS}
BODY_PART_ORDER = {part["id"]: index for index, part in enumerate(BODY_PARTS)}
TORONTO_TZ = ZoneInfo("America/Toronto")

SEED_EXERCISES = {
    "legs": [
        "Hip thrusts",
        "Smith squats",
        "Sitting leg curl",
        "Sitting leg extension",
        "Leg abduction",
        "Leg adduction",
    ],
    "shoulders": [
        "Lateral raises",
        "Front raises",
        "Pull ups",
    ],
    "back": [
        "Sitting rows",
        "Standing pull backs",
    ],
    "chest": [
        "Bench press",
        "Bench flys",
        "Machine flys",
    ],
    "arms": [
        "Bicep curls",
        "Dips",
    ],
    "abs": [
        "Lying situps",
        "Incline situps",
    ],
    "neck": [
        "Flexion",
        "Extension",
        "Abduction",
    ],
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def now_utc_iso() -> str:
    return now_utc().isoformat()


def toronto_now() -> datetime:
    return datetime.now(TORONTO_TZ).replace(microsecond=0)


def current_month_key() -> str:
    return toronto_now().strftime("%Y-%m")


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


def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not get_current_username():
            return jsonify({"error": "Authentication required."}), 401
        return view(*args, **kwargs)

    return wrapped_view


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


def seed_exercises() -> None:
    db = get_db()
    timestamp = now_utc_iso()
    for body_part, names in SEED_EXERCISES.items():
        for sort_order, name in enumerate(names, start=1):
            db.execute(
                """
                INSERT OR IGNORE INTO exercises (
                    name,
                    body_part,
                    is_custom,
                    is_active,
                    last_weight,
                    sort_order,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, 0, 1, 0, ?, ?, ?)
                """,
                (name, body_part, sort_order, timestamp, timestamp),
            )
    db.commit()


def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE UNIQUE,
            body_part TEXT NOT NULL,
            is_custom INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            last_weight INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS timeline_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author TEXT NOT NULL,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    db.commit()
    seed_exercises()


def serialize_exercise(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "body_part": row["body_part"],
        "body_part_label": BODY_PART_LABELS[row["body_part"]],
        "is_custom": bool(row["is_custom"]),
        "is_active": bool(row["is_active"]),
        "last_weight": row["last_weight"],
        "sort_order": row["sort_order"],
    }


def exercise_sort_key(row: sqlite3.Row | dict) -> tuple:
    return (
        BODY_PART_ORDER.get(row["body_part"], 999),
        row["sort_order"],
        str(row["name"]).lower(),
    )


def list_exercises() -> list[dict]:
    rows = get_db().execute(
        """
        SELECT id, name, body_part, is_custom, is_active, last_weight, sort_order
        FROM exercises
        """
    ).fetchall()
    sorted_rows = sorted(rows, key=exercise_sort_key)
    return [serialize_exercise(row) for row in sorted_rows]


def serialize_event(row: sqlite3.Row) -> dict:
    payload = json.loads(row["payload"])
    event = {
        "id": row["id"],
        "author": row["author"],
        "author_name": USERS[row["author"]]["display_name"],
        "event_type": row["event_type"],
        "payload": payload,
        "created_at": row["created_at"],
    }

    if row["event_type"] == "workout":
        entries = []
        total_volume = 0
        for entry in payload.get("entries", []):
            total_volume += entry["sets"] * entry["reps"] * entry["weight"]
            entries.append(
                {
                    "exercise_id": entry["exercise_id"],
                    "exercise_name": entry["exercise_name"],
                    "body_part": entry["body_part"],
                    "body_part_label": BODY_PART_LABELS.get(
                        entry["body_part"],
                        entry["body_part"],
                    ),
                    "sets": entry["sets"],
                    "reps": entry["reps"],
                    "weight": entry["weight"],
                }
            )
        event["exercise_count"] = len(entries)
        event["entries"] = entries
        event["total_volume"] = total_volume
    elif row["event_type"] == "meal":
        event["high_protein"] = bool(payload.get("high_protein"))

    return event


def list_timeline() -> list[dict]:
    rows = get_db().execute(
        """
        SELECT id, author, event_type, payload, created_at
        FROM timeline_events
        ORDER BY datetime(created_at) DESC, id DESC
        """
    ).fetchall()
    return [serialize_event(row) for row in rows]


def parse_month_key(value: str | None) -> tuple[int, int]:
    if not value:
        current = toronto_now()
        return current.year, current.month

    try:
        parsed = datetime.strptime(value, "%Y-%m")
    except ValueError as error:
        raise ValueError("Month must use YYYY-MM format.") from error

    return parsed.year, parsed.month


def month_calendar_payload(month_key: str | None) -> dict:
    year, month = parse_month_key(month_key)
    workout_days: set[int] = set()
    rows = get_db().execute(
        """
        SELECT created_at
        FROM timeline_events
        WHERE event_type = 'workout'
        ORDER BY datetime(created_at) DESC, id DESC
        """
    ).fetchall()

    for row in rows:
        local_value = datetime.fromisoformat(row["created_at"]).astimezone(TORONTO_TZ)
        if local_value.year == year and local_value.month == month:
            workout_days.add(local_value.day)

    return {
        "month": f"{year:04d}-{month:02d}",
        "year": year,
        "month_number": month,
        "workout_days": sorted(workout_days),
    }


def create_timeline_event(author: str, event_type: str, payload: dict) -> dict:
    created_at = now_utc_iso()
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO timeline_events (author, event_type, payload, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (author, event_type, json.dumps(payload), created_at),
    )
    db.commit()
    row = db.execute(
        """
        SELECT id, author, event_type, payload, created_at
        FROM timeline_events
        WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    return serialize_event(row)


def dashboard_payload(month_key: str | None) -> dict:
    return {
        "body_parts": BODY_PARTS,
        "exercises": list_exercises(),
        "timeline": list_timeline(),
        "calendar": month_calendar_payload(month_key),
    }


def parse_positive_int(value: object, field_name: str, *, minimum: int = 0) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a whole number.") from error
    if parsed < minimum:
        raise ValueError(f"{field_name} must be at least {minimum}.")
    return parsed


def parse_bool(value: object) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, static_folder="static", template_folder="templates")
    base_dir = Path(app.root_path)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "workout-ledger-dev-secret"),
        DATABASE=str(base_dir / "data" / "workout.db"),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE") == "1",
        PERMANENT_SESSION_LIFETIME=timedelta(days=365),
    )

    if test_config:
        app.config.update(test_config)

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()

    @app.get("/")
    def index():
        return render_template("index.html")

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

    @app.get("/api/dashboard")
    @login_required
    def dashboard():
        month_key = request.args.get("month")
        try:
            payload = dashboard_payload(month_key)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(payload)

    @app.get("/api/calendar")
    @login_required
    def calendar():
        month_key = request.args.get("month")
        try:
            payload = month_calendar_payload(month_key)
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(payload)

    @app.post("/api/workouts")
    @login_required
    def create_workout():
        payload = request.get_json(silent=True) or {}
        raw_entries = payload.get("entries")
        if not isinstance(raw_entries, list) or not raw_entries:
            return jsonify({"error": "Select at least one exercise before logging."}), 400

        db = get_db()
        seen_ids: set[int] = set()
        entries: list[dict] = []

        for raw_entry in raw_entries:
            if not isinstance(raw_entry, dict):
                return jsonify({"error": "Each workout entry must be an object."}), 400

            try:
                exercise_id = parse_positive_int(
                    raw_entry.get("exercise_id"),
                    "Exercise",
                    minimum=1,
                )
                sets = parse_positive_int(raw_entry.get("sets"), "Sets", minimum=1)
                reps = parse_positive_int(raw_entry.get("reps"), "Reps", minimum=1)
                weight = parse_positive_int(raw_entry.get("weight"), "Weight", minimum=0)
            except ValueError as error:
                return jsonify({"error": str(error)}), 400

            if exercise_id in seen_ids:
                return jsonify({"error": "Each exercise can only be logged once per workout."}), 400

            exercise = db.execute(
                """
                SELECT id, name, body_part, last_weight
                FROM exercises
                WHERE id = ?
                """,
                (exercise_id,),
            ).fetchone()
            if exercise is None:
                return jsonify({"error": "One of the selected exercises no longer exists."}), 404

            seen_ids.add(exercise_id)
            entries.append(
                {
                    "exercise_id": exercise["id"],
                    "exercise_name": exercise["name"],
                    "body_part": exercise["body_part"],
                    "sets": sets,
                    "reps": reps,
                    "weight": weight,
                }
            )

        timestamp = now_utc_iso()
        for entry in entries:
            db.execute(
                """
                UPDATE exercises
                SET last_weight = ?, updated_at = ?
                WHERE id = ?
                """,
                (entry["weight"], timestamp, entry["exercise_id"]),
            )
        db.commit()

        event = create_timeline_event(
            get_current_username(),
            "workout",
            {"entries": entries},
        )
        return jsonify({"event": event, "exercises": list_exercises()}), 201

    @app.post("/api/diet/protein-shake")
    @login_required
    def log_protein_shake():
        event = create_timeline_event(
            get_current_username(),
            "protein_shake",
            {"label": "Protein shake"},
        )
        return jsonify({"event": event}), 201

    @app.post("/api/diet/meal")
    @login_required
    def log_meal():
        payload = request.get_json(silent=True) or {}
        high_protein = parse_bool(payload.get("high_protein"))
        event = create_timeline_event(
            get_current_username(),
            "meal",
            {"high_protein": high_protein},
        )
        return jsonify({"event": event}), 201

    @app.post("/api/exercises")
    @login_required
    def add_exercise():
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name", "")).strip()
        body_part = str(payload.get("body_part", "")).strip().lower()

        if not name:
            return jsonify({"error": "Exercise name is required."}), 400
        if body_part not in BODY_PART_LABELS:
            return jsonify({"error": "Select a valid body part."}), 400

        db = get_db()
        next_sort_order = db.execute(
            """
            SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
            FROM exercises
            WHERE body_part = ?
            """,
            (body_part,),
        ).fetchone()["next_sort_order"]
        timestamp = now_utc_iso()

        try:
            cursor = db.execute(
                """
                INSERT INTO exercises (
                    name,
                    body_part,
                    is_custom,
                    is_active,
                    last_weight,
                    sort_order,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, 1, 1, 0, ?, ?, ?)
                """,
                (name, body_part, next_sort_order, timestamp, timestamp),
            )
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({"error": "That exercise already exists."}), 409

        row = db.execute(
            """
            SELECT id, name, body_part, is_custom, is_active, last_weight, sort_order
            FROM exercises
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()
        return jsonify({"exercise": serialize_exercise(row)}), 201

    @app.patch("/api/exercises/<int:exercise_id>")
    @login_required
    def update_exercise(exercise_id: int):
        payload = request.get_json(silent=True) or {}
        if "is_active" not in payload:
            return jsonify({"error": "Only visibility updates are supported."}), 400

        is_active = 1 if parse_bool(payload.get("is_active")) else 0
        db = get_db()
        timestamp = now_utc_iso()
        cursor = db.execute(
            """
            UPDATE exercises
            SET is_active = ?, updated_at = ?
            WHERE id = ?
            """,
            (is_active, timestamp, exercise_id),
        )
        db.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Exercise not found."}), 404

        row = db.execute(
            """
            SELECT id, name, body_part, is_custom, is_active, last_weight, sort_order
            FROM exercises
            WHERE id = ?
            """,
            (exercise_id,),
        ).fetchone()
        return jsonify({"exercise": serialize_exercise(row)})

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.environ.get("FLASK_HOST", "0.0.0.0"),
        port=int(os.environ.get("FLASK_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
