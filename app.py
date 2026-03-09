from __future__ import annotations

import json
import os
import re
import sqlite3
import unicodedata
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

DEFAULT_BODY_PARTS = [
    {"id": "legs", "label": "Legs"},
    {"id": "shoulders", "label": "Shoulders"},
    {"id": "back", "label": "Back"},
    {"id": "chest", "label": "Chest"},
    {"id": "arms", "label": "Arms"},
    {"id": "abs", "label": "Abs"},
    {"id": "neck", "label": "Neck"},
]

TORONTO_TZ = ZoneInfo("America/Toronto")
WORKOUT_SESSION_WINDOW = timedelta(hours=6)

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


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


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


def slugify_label(label: str) -> str:
    normalized = unicodedata.normalize("NFKD", label)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug or "section"


def next_body_part_id(label: str) -> str:
    db = get_db()
    base_slug = slugify_label(label)
    candidate = base_slug
    suffix = 2

    while db.execute(
        "SELECT 1 FROM body_parts WHERE id = ?",
        (candidate,),
    ).fetchone():
        candidate = f"{base_slug}-{suffix}"
        suffix += 1

    return candidate


def next_body_part_sort_order() -> int:
    row = get_db().execute(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM body_parts"
    ).fetchone()
    return row["next_sort_order"]


def next_exercise_sort_order(body_part: str) -> int:
    row = get_db().execute(
        """
        SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order
        FROM exercises
        WHERE body_part = ?
        """,
        (body_part,),
    ).fetchone()
    return row["next_sort_order"]


def get_body_part(body_part_id: str) -> sqlite3.Row | None:
    return get_db().execute(
        """
        SELECT id, label, sort_order
        FROM body_parts
        WHERE id = ?
        """,
        (body_part_id,),
    ).fetchone()


def serialize_body_part(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "label": row["label"],
        "sort_order": row["sort_order"],
        "days_since_used": row["days_since_used"] if "days_since_used" in row.keys() else None,
        "last_used_at": row["last_used_at"] if "last_used_at" in row.keys() else None,
    }


def list_body_parts() -> list[dict]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, label, sort_order
        FROM body_parts
        ORDER BY sort_order ASC, lower(label) ASC
        """
    ).fetchall()
    latest_by_part: dict[str, datetime] = {}
    used_rows = db.execute(
        """
        SELECT body_part, MAX(created_at) AS last_used_at
        FROM workout_entries
        GROUP BY body_part
        """
    ).fetchall()
    for used_row in used_rows:
        if used_row["last_used_at"]:
            latest_by_part[used_row["body_part"]] = parse_iso(used_row["last_used_at"]).astimezone(
                TORONTO_TZ
            )

    today = toronto_now().date()
    payload = []
    for row in rows:
        last_used_at = latest_by_part.get(row["id"])
        payload.append(
            {
                "id": row["id"],
                "label": row["label"],
                "sort_order": row["sort_order"],
                "days_since_used": None
                if last_used_at is None
                else (today - last_used_at.date()).days,
                "last_used_at": None if last_used_at is None else last_used_at.isoformat(),
            }
        )
    return payload


def body_part_label_map() -> dict[str, str]:
    return {
        row["id"]: row["label"]
        for row in get_db().execute(
            "SELECT id, label FROM body_parts"
        ).fetchall()
    }


def seed_body_parts() -> None:
    db = get_db()
    timestamp = now_utc_iso()
    for index, part in enumerate(DEFAULT_BODY_PARTS, start=1):
        db.execute(
            """
            INSERT OR IGNORE INTO body_parts (
                id,
                label,
                sort_order,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (part["id"], part["label"], index, timestamp, timestamp),
        )
    db.commit()


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


def ensure_column(table_name: str, column_name: str, ddl: str) -> None:
    db = get_db()
    columns = {row["name"] for row in db.execute(f"PRAGMA table_info({table_name})").fetchall()}
    if column_name not in columns:
        try:
            db.execute(f"ALTER TABLE {table_name} ADD COLUMN {ddl}")
            db.commit()
        except sqlite3.OperationalError as error:
            if "duplicate column name" not in str(error).lower():
                raise


def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS body_parts (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL COLLATE NOCASE UNIQUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

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

        CREATE TABLE IF NOT EXISTS workout_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author TEXT NOT NULL,
            started_at TEXT NOT NULL,
            last_logged_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workout_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            exercise_id INTEGER,
            exercise_name TEXT NOT NULL,
            body_part TEXT NOT NULL,
            body_part_label TEXT NOT NULL,
            sets INTEGER NOT NULL,
            reps INTEGER NOT NULL,
            weight INTEGER NOT NULL,
            is_pr INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES workout_sessions (id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workout_entries_session_id
        ON workout_entries (session_id);

        CREATE INDEX IF NOT EXISTS idx_workout_entries_exercise_id
        ON workout_entries (exercise_id);

        CREATE INDEX IF NOT EXISTS idx_workout_sessions_author_last_logged
        ON workout_sessions (author, last_logged_at);
        """
    )
    db.commit()
    ensure_column("exercises", "max_weight", "max_weight INTEGER NOT NULL DEFAULT 0")
    seed_body_parts()
    seed_exercises()
    migrate_legacy_workouts()
    recompute_all_workout_aggregates()


def serialize_exercise(row: sqlite3.Row) -> dict:
    label = row["body_part_label"] or row["body_part"]
    return {
        "id": row["id"],
        "name": row["name"],
        "body_part": row["body_part"],
        "body_part_label": label,
        "is_custom": bool(row["is_custom"]),
        "is_active": bool(row["is_active"]),
        "last_weight": row["last_weight"],
        "max_weight": row["max_weight"],
        "sort_order": row["sort_order"],
    }


def list_exercises() -> list[dict]:
    rows = get_db().execute(
        """
        SELECT
            exercises.id,
            exercises.name,
            exercises.body_part,
            body_parts.label AS body_part_label,
            exercises.is_custom,
            exercises.is_active,
            exercises.last_weight,
            exercises.max_weight,
            exercises.sort_order
        FROM exercises
        LEFT JOIN body_parts ON body_parts.id = exercises.body_part
        ORDER BY
            COALESCE(body_parts.sort_order, 999) ASC,
            exercises.sort_order ASC,
            lower(exercises.name) ASC
        """
    ).fetchall()
    return [serialize_exercise(row) for row in rows]


def get_exercise(exercise_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        """
        SELECT
            exercises.id,
            exercises.name,
            exercises.body_part,
            body_parts.label AS body_part_label,
            exercises.is_custom,
            exercises.is_active,
            exercises.last_weight,
            exercises.max_weight,
            exercises.sort_order
        FROM exercises
        LEFT JOIN body_parts ON body_parts.id = exercises.body_part
        WHERE exercises.id = ?
        """,
        (exercise_id,),
    ).fetchone()


def serialize_workout_entry(row: sqlite3.Row, labels: dict[str, str]) -> dict:
    return {
        "id": row["id"],
        "exercise_id": row["exercise_id"],
        "exercise_name": row["exercise_name"],
        "body_part": row["body_part"],
        "body_part_label": row["body_part_label"] or labels.get(row["body_part"], row["body_part"]),
        "sets": row["sets"],
        "reps": row["reps"],
        "weight": row["weight"],
        "is_pr": bool(row["is_pr"]),
        "created_at": row["created_at"],
    }


def get_workout_session_row(session_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        """
        SELECT id, author, started_at, last_logged_at, created_at, updated_at
        FROM workout_sessions
        WHERE id = ?
        """,
        (session_id,),
    ).fetchone()


def list_workout_session_rows(author: str | None = None) -> list[sqlite3.Row]:
    db = get_db()
    if author:
        return db.execute(
            """
            SELECT id, author, started_at, last_logged_at, created_at, updated_at
            FROM workout_sessions
            WHERE author = ?
            ORDER BY datetime(last_logged_at) DESC, id DESC
            """,
            (author,),
        ).fetchall()

    return db.execute(
        """
        SELECT id, author, started_at, last_logged_at, created_at, updated_at
        FROM workout_sessions
        ORDER BY datetime(last_logged_at) DESC, id DESC
        """
    ).fetchall()


def list_session_entries(session_id: int, labels: dict[str, str]) -> list[dict]:
    rows = get_db().execute(
        """
        SELECT
            id,
            session_id,
            exercise_id,
            exercise_name,
            body_part,
            body_part_label,
            sets,
            reps,
            weight,
            is_pr,
            created_at,
            updated_at
        FROM workout_entries
        WHERE session_id = ?
        ORDER BY datetime(created_at) ASC, id ASC
        """,
        (session_id,),
    ).fetchall()
    return [serialize_workout_entry(row, labels) for row in rows]


def serialize_workout_session(row: sqlite3.Row, labels: dict[str, str]) -> dict:
    entries = list_session_entries(row["id"], labels)
    body_parts: list[str] = []
    seen_parts: set[str] = set()
    total_volume = 0
    for entry in entries:
        total_volume += entry["sets"] * entry["reps"] * abs(entry["weight"])
        label = entry["body_part_label"]
        if label not in seen_parts:
            seen_parts.add(label)
            body_parts.append(label)

    return {
        "id": row["id"],
        "item_type": "workout_session",
        "author": row["author"],
        "author_name": USERS[row["author"]]["display_name"],
        "started_at": row["started_at"],
        "last_logged_at": row["last_logged_at"],
        "created_at": row["last_logged_at"],
        "entries": entries,
        "exercise_count": len(entries),
        "total_volume": total_volume,
        "has_pr": any(entry["is_pr"] for entry in entries),
        "body_parts": body_parts,
        "is_active_queue": parse_iso(row["last_logged_at"]) >= now_utc() - WORKOUT_SESSION_WINDOW,
    }


def list_workout_sessions(author: str | None = None) -> list[dict]:
    labels = body_part_label_map()
    return [serialize_workout_session(row, labels) for row in list_workout_session_rows(author)]


def get_workout_session(session_id: int, *, author: str | None = None) -> dict | None:
    row = get_workout_session_row(session_id)
    if row is None:
        return None
    if author and row["author"] != author:
        return None
    return serialize_workout_session(row, body_part_label_map())


def get_active_workout_session_row(author: str, *, reference_time: datetime | None = None) -> sqlite3.Row | None:
    row = get_db().execute(
        """
        SELECT id, author, started_at, last_logged_at, created_at, updated_at
        FROM workout_sessions
        WHERE author = ?
        ORDER BY datetime(last_logged_at) DESC, id DESC
        LIMIT 1
        """,
        (author,),
    ).fetchone()
    if row is None:
        return None

    current_time = reference_time or now_utc()
    if current_time - parse_iso(row["last_logged_at"]) <= WORKOUT_SESSION_WINDOW:
        return row
    return None


def get_active_workout_session(author: str) -> dict | None:
    row = get_active_workout_session_row(author)
    if row is None:
        return None
    return serialize_workout_session(row, body_part_label_map())


def create_workout_session(author: str, timestamp: str) -> int:
    cursor = get_db().execute(
        """
        INSERT INTO workout_sessions (author, started_at, last_logged_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (author, timestamp, timestamp, timestamp, timestamp),
    )
    get_db().commit()
    return cursor.lastrowid


def sync_workout_session(session_id: int) -> None:
    db = get_db()
    summary = db.execute(
        """
        SELECT MIN(created_at) AS started_at, MAX(created_at) AS last_logged_at
        FROM workout_entries
        WHERE session_id = ?
        """,
        (session_id,),
    ).fetchone()

    if not summary or summary["started_at"] is None or summary["last_logged_at"] is None:
        db.execute("DELETE FROM workout_sessions WHERE id = ?", (session_id,))
        db.commit()
        return

    db.execute(
        """
        UPDATE workout_sessions
        SET started_at = ?, last_logged_at = ?, updated_at = ?
        WHERE id = ?
        """,
        (summary["started_at"], summary["last_logged_at"], now_utc_iso(), session_id),
    )
    db.commit()


def recompute_pr_flags(exercise_ids: set[int]) -> None:
    db = get_db()
    for exercise_id in exercise_ids:
        if not exercise_id:
            continue
        rows = db.execute(
            """
            SELECT id, weight
            FROM workout_entries
            WHERE exercise_id = ?
            ORDER BY datetime(created_at) ASC, id ASC
            """,
            (exercise_id,),
        ).fetchall()
        running_max: int | None = None
        for row in rows:
            is_pr = 1 if running_max is None or row["weight"] > running_max else 0
            if running_max is None or row["weight"] > running_max:
                running_max = row["weight"]
            db.execute(
                "UPDATE workout_entries SET is_pr = ?, updated_at = ? WHERE id = ?",
                (is_pr, now_utc_iso(), row["id"]),
            )
    db.commit()


def recompute_exercise_aggregates(exercise_ids: set[int]) -> None:
    if not exercise_ids:
        return

    db = get_db()
    recompute_pr_flags(exercise_ids)
    timestamp = now_utc_iso()

    for exercise_id in exercise_ids:
        if not exercise_id:
            continue

        max_row = db.execute(
            """
            SELECT COALESCE(MAX(weight), 0) AS max_weight
            FROM workout_entries
            WHERE exercise_id = ?
            """,
            (exercise_id,),
        ).fetchone()

        latest_session_row = db.execute(
            """
            SELECT workout_sessions.id
            FROM workout_entries
            JOIN workout_sessions ON workout_sessions.id = workout_entries.session_id
            WHERE workout_entries.exercise_id = ?
            ORDER BY datetime(workout_sessions.last_logged_at) DESC, workout_sessions.id DESC
            LIMIT 1
            """,
            (exercise_id,),
        ).fetchone()

        last_weight = 0
        if latest_session_row is not None:
            session_max = db.execute(
                """
                SELECT COALESCE(MAX(weight), 0) AS last_weight
                FROM workout_entries
                WHERE exercise_id = ? AND session_id = ?
                """,
                (exercise_id, latest_session_row["id"]),
            ).fetchone()
            last_weight = session_max["last_weight"]

        db.execute(
            """
            UPDATE exercises
            SET last_weight = ?, max_weight = ?, updated_at = ?
            WHERE id = ?
            """,
            (last_weight, max_row["max_weight"], timestamp, exercise_id),
        )

    db.commit()


def recompute_all_workout_aggregates() -> None:
    rows = get_db().execute(
        "SELECT id FROM exercises"
    ).fetchall()
    recompute_exercise_aggregates({row["id"] for row in rows})


def migrate_legacy_workouts() -> None:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, author, payload, created_at
        FROM timeline_events
        WHERE event_type = 'workout'
        ORDER BY author ASC, datetime(created_at) ASC, id ASC
        """
    ).fetchall()
    if not rows:
        return

    active_sessions: dict[str, tuple[int, datetime]] = {}
    labels = body_part_label_map()

    for row in rows:
        author = row["author"]
        created_at = parse_iso(row["created_at"])
        payload = json.loads(row["payload"])
        current = active_sessions.get(author)

        if current is None or created_at - current[1] > WORKOUT_SESSION_WINDOW:
            session_id = create_workout_session(author, row["created_at"])
        else:
            session_id = current[0]

        for entry in payload.get("entries", []):
            body_part = entry.get("body_part") or ""
            db.execute(
                """
                INSERT INTO workout_entries (
                    session_id,
                    exercise_id,
                    exercise_name,
                    body_part,
                    body_part_label,
                    sets,
                    reps,
                    weight,
                    is_pr,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    entry.get("exercise_id"),
                    entry.get("exercise_name") or "Exercise",
                    body_part,
                    entry.get("body_part_label") or labels.get(body_part, body_part),
                    int(entry.get("sets", 1)),
                    int(entry.get("reps", 1)),
                    int(entry.get("weight", 0)),
                    0,
                    row["created_at"],
                    row["created_at"],
                ),
            )

        db.execute(
            """
            UPDATE workout_sessions
            SET last_logged_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (row["created_at"], row["created_at"], session_id),
        )
        active_sessions[author] = (session_id, created_at)

    db.execute(
        """
        UPDATE timeline_events
        SET event_type = 'workout_legacy'
        WHERE event_type = 'workout'
        """
    )
    db.commit()


def serialize_timeline_event(row: sqlite3.Row) -> dict:
    payload = json.loads(row["payload"])
    event = {
        "id": row["id"],
        "item_type": "timeline_event",
        "author": row["author"],
        "author_name": USERS[row["author"]]["display_name"],
        "event_type": row["event_type"],
        "payload": payload,
        "created_at": row["created_at"],
    }

    if row["event_type"] == "meal":
        event["high_protein"] = bool(payload.get("high_protein"))

    return event


def list_timeline(author: str | None = None) -> list[dict]:
    db = get_db()
    if author:
        diet_rows = db.execute(
            """
            SELECT id, author, event_type, payload, created_at
            FROM timeline_events
            WHERE author = ? AND event_type != 'workout' AND event_type != 'workout_legacy'
            ORDER BY datetime(created_at) DESC, id DESC
            """,
            (author,),
        ).fetchall()
    else:
        diet_rows = db.execute(
            """
            SELECT id, author, event_type, payload, created_at
            FROM timeline_events
            WHERE event_type != 'workout' AND event_type != 'workout_legacy'
            ORDER BY datetime(created_at) DESC, id DESC
            """
        ).fetchall()

    items: list[dict] = []
    for session_payload in list_workout_sessions(author):
        items.append(
            {
                **session_payload,
                "_sort_at": session_payload["last_logged_at"],
                "_sort_rank": session_payload["id"],
            }
        )
    for row in diet_rows:
        event = serialize_timeline_event(row)
        items.append(
            {
                **event,
                "_sort_at": event["created_at"],
                "_sort_rank": event["id"],
            }
        )

    items.sort(key=lambda item: (item["_sort_at"], item["_sort_rank"]), reverse=True)
    for item in items:
        item.pop("_sort_at", None)
        item.pop("_sort_rank", None)
    return items


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
        FROM workout_entries
        ORDER BY datetime(created_at) DESC, id DESC
        """
    ).fetchall()

    for row in rows:
        local_value = parse_iso(row["created_at"]).astimezone(TORONTO_TZ)
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
    return serialize_timeline_event(row)


def dashboard_payload(month_key: str | None, author: str) -> dict:
    return {
        "body_parts": list_body_parts(),
        "exercises": list_exercises(),
        "timeline": list_timeline(author),
        "calendar": month_calendar_payload(month_key),
        "active_queue": get_active_workout_session(author),
    }


def parse_int(value: object, field_name: str, *, minimum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{field_name} must be a whole number.") from error

    if minimum is not None and parsed < minimum:
        raise ValueError(f"{field_name} must be at least {minimum}.")

    return parsed


def parse_bool(value: object) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def ensure_owned_session(session_id: int, username: str) -> sqlite3.Row | None:
    row = get_workout_session_row(session_id)
    if row is None or row["author"] != username:
        return None
    return row


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
            payload = dashboard_payload(month_key, get_current_username())
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

    @app.get("/api/workout-sessions")
    @login_required
    def workout_sessions():
        return jsonify({"sessions": list_workout_sessions(get_current_username())})

    @app.post("/api/body-parts")
    @login_required
    def add_body_part():
        payload = request.get_json(silent=True) or {}
        label = str(payload.get("label", "")).strip()

        if not label:
            return jsonify({"error": "Section name is required."}), 400

        db = get_db()
        if db.execute(
            "SELECT 1 FROM body_parts WHERE label = ? COLLATE NOCASE",
            (label,),
        ).fetchone():
            return jsonify({"error": "That section already exists."}), 409

        timestamp = now_utc_iso()
        body_part_id = next_body_part_id(label)
        sort_order = next_body_part_sort_order()
        db.execute(
            """
            INSERT INTO body_parts (id, label, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (body_part_id, label, sort_order, timestamp, timestamp),
        )
        db.commit()

        row = get_body_part(body_part_id)
        return jsonify({"body_part": serialize_body_part(row)}), 201

    @app.post("/api/workouts")
    @login_required
    def create_workout():
        payload = request.get_json(silent=True) or {}
        raw_entries = payload.get("entries")
        if not isinstance(raw_entries, list) or not raw_entries:
            return jsonify({"error": "Select at least one exercise before logging."}), 400

        username = get_current_username()
        db = get_db()
        seen_ids: set[int] = set()
        entries: list[dict] = []
        affected_exercise_ids: set[int] = set()

        for raw_entry in raw_entries:
            if not isinstance(raw_entry, dict):
                return jsonify({"error": "Each workout entry must be an object."}), 400

            try:
                exercise_id = parse_int(raw_entry.get("exercise_id"), "Exercise", minimum=1)
                sets = parse_int(raw_entry.get("sets"), "Sets", minimum=1)
                reps = parse_int(raw_entry.get("reps"), "Reps", minimum=1)
                weight = parse_int(raw_entry.get("weight"), "Weight")
            except ValueError as error:
                return jsonify({"error": str(error)}), 400

            if exercise_id in seen_ids:
                return jsonify({"error": "Each exercise can only be logged once at a time."}), 400

            exercise = db.execute(
                """
                SELECT
                    exercises.id,
                    exercises.name,
                    exercises.body_part,
                    body_parts.label AS body_part_label
                FROM exercises
                LEFT JOIN body_parts ON body_parts.id = exercises.body_part
                WHERE exercises.id = ?
                """,
                (exercise_id,),
            ).fetchone()
            if exercise is None:
                return jsonify({"error": "One of the selected exercises no longer exists."}), 404

            seen_ids.add(exercise_id)
            affected_exercise_ids.add(exercise_id)
            entries.append(
                {
                    "exercise_id": exercise["id"],
                    "exercise_name": exercise["name"],
                    "body_part": exercise["body_part"],
                    "body_part_label": exercise["body_part_label"] or exercise["body_part"],
                    "sets": sets,
                    "reps": reps,
                    "weight": weight,
                }
            )

        timestamp = now_utc_iso()
        active_session = get_active_workout_session_row(username, reference_time=parse_iso(timestamp))
        session_id = active_session["id"] if active_session is not None else create_workout_session(username, timestamp)

        for entry in entries:
            db.execute(
                """
                INSERT INTO workout_entries (
                    session_id,
                    exercise_id,
                    exercise_name,
                    body_part,
                    body_part_label,
                    sets,
                    reps,
                    weight,
                    is_pr,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                """,
                (
                    session_id,
                    entry["exercise_id"],
                    entry["exercise_name"],
                    entry["body_part"],
                    entry["body_part_label"],
                    entry["sets"],
                    entry["reps"],
                    entry["weight"],
                    timestamp,
                    timestamp,
                ),
            )

        db.execute(
            """
            UPDATE workout_sessions
            SET last_logged_at = ?, updated_at = ?
            WHERE id = ?
            """,
            (timestamp, timestamp, session_id),
        )
        db.commit()

        recompute_exercise_aggregates(affected_exercise_ids)

        return jsonify(
            {
                "session": get_workout_session(session_id, author=username),
                "active_queue": get_active_workout_session(username),
                "exercises": list_exercises(),
                "body_parts": list_body_parts(),
            }
        ), 201

    @app.patch("/api/workout-sessions/<int:session_id>")
    @login_required
    def update_workout_session(session_id: int):
        username = get_current_username()
        session_row = ensure_owned_session(session_id, username)
        if session_row is None:
            return jsonify({"error": "Workout session not found."}), 404

        payload = request.get_json(silent=True) or {}
        raw_entries = payload.get("entries")
        if not isinstance(raw_entries, list) or not raw_entries:
            return jsonify({"error": "Provide session entries to update."}), 400

        db = get_db()
        affected_exercise_ids: set[int] = set()

        existing_rows = db.execute(
            """
            SELECT id, exercise_id
            FROM workout_entries
            WHERE session_id = ?
            """,
            (session_id,),
        ).fetchall()
        existing_ids = {row["id"] for row in existing_rows}
        exercise_by_entry = {row["id"]: row["exercise_id"] for row in existing_rows}

        for raw_entry in raw_entries:
            if not isinstance(raw_entry, dict):
                return jsonify({"error": "Each updated entry must be an object."}), 400

            try:
                entry_id = parse_int(raw_entry.get("id"), "Entry", minimum=1)
                sets = parse_int(raw_entry.get("sets"), "Sets", minimum=1)
                reps = parse_int(raw_entry.get("reps"), "Reps", minimum=1)
                weight = parse_int(raw_entry.get("weight"), "Weight")
            except ValueError as error:
                return jsonify({"error": str(error)}), 400

            if entry_id not in existing_ids:
                return jsonify({"error": "One of the session entries no longer exists."}), 404

            db.execute(
                """
                UPDATE workout_entries
                SET sets = ?, reps = ?, weight = ?, updated_at = ?
                WHERE id = ?
                """,
                (sets, reps, weight, now_utc_iso(), entry_id),
            )
            if exercise_by_entry[entry_id]:
                affected_exercise_ids.add(exercise_by_entry[entry_id])

        db.commit()
        recompute_exercise_aggregates(affected_exercise_ids)

        return jsonify(
            {
                "session": get_workout_session(session_id, author=username),
                "active_queue": get_active_workout_session(username),
                "exercises": list_exercises(),
                "body_parts": list_body_parts(),
            }
        )

    @app.delete("/api/workout-sessions/<int:session_id>")
    @login_required
    def delete_workout_session(session_id: int):
        username = get_current_username()
        session_row = ensure_owned_session(session_id, username)
        if session_row is None:
            return jsonify({"error": "Workout session not found."}), 404

        db = get_db()
        exercise_rows = db.execute(
            """
            SELECT DISTINCT exercise_id
            FROM workout_entries
            WHERE session_id = ? AND exercise_id IS NOT NULL
            """,
            (session_id,),
        ).fetchall()
        affected_exercise_ids = {
            row["exercise_id"] for row in exercise_rows if row["exercise_id"] is not None
        }

        db.execute("DELETE FROM workout_sessions WHERE id = ?", (session_id,))
        db.commit()

        recompute_exercise_aggregates(affected_exercise_ids)

        return jsonify(
            {
                "ok": True,
                "active_queue": get_active_workout_session(username),
                "exercises": list_exercises(),
                "body_parts": list_body_parts(),
            }
        )

    @app.delete("/api/workout-entries/<int:entry_id>")
    @login_required
    def delete_workout_entry(entry_id: int):
        username = get_current_username()
        db = get_db()
        row = db.execute(
            """
            SELECT
                workout_entries.id,
                workout_entries.session_id,
                workout_entries.exercise_id,
                workout_sessions.author
            FROM workout_entries
            JOIN workout_sessions ON workout_sessions.id = workout_entries.session_id
            WHERE workout_entries.id = ?
            """,
            (entry_id,),
        ).fetchone()
        if row is None or row["author"] != username:
            return jsonify({"error": "Workout entry not found."}), 404

        db.execute("DELETE FROM workout_entries WHERE id = ?", (entry_id,))
        db.commit()
        sync_workout_session(row["session_id"])
        if row["exercise_id"]:
            recompute_exercise_aggregates({row["exercise_id"]})

        return jsonify(
            {
                "ok": True,
                "active_queue": get_active_workout_session(username),
                "exercises": list_exercises(),
                "body_parts": list_body_parts(),
            }
        )

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
        if not get_body_part(body_part):
            return jsonify({"error": "Select a valid section."}), 400

        timestamp = now_utc_iso()
        sort_order = next_exercise_sort_order(body_part)
        db = get_db()

        try:
            cursor = db.execute(
                """
                INSERT INTO exercises (
                    name,
                    body_part,
                    is_custom,
                    is_active,
                    last_weight,
                    max_weight,
                    sort_order,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, 1, 1, 0, 0, ?, ?, ?)
                """,
                (name, body_part, sort_order, timestamp, timestamp),
            )
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({"error": "That exercise already exists."}), 409

        row = get_exercise(cursor.lastrowid)
        return jsonify({"exercise": serialize_exercise(row)}), 201

    @app.patch("/api/exercises/<int:exercise_id>")
    @login_required
    def update_exercise(exercise_id: int):
        payload = request.get_json(silent=True) or {}
        if "is_active" not in payload and "body_part" not in payload:
            return jsonify({"error": "Provide a visibility or section update."}), 400

        existing = get_exercise(exercise_id)
        if existing is None:
            return jsonify({"error": "Exercise not found."}), 404

        updates: list[str] = []
        parameters: list[object] = []

        if "is_active" in payload:
            updates.append("is_active = ?")
            parameters.append(1 if parse_bool(payload.get("is_active")) else 0)

        if "body_part" in payload:
            target_body_part = str(payload.get("body_part", "")).strip().lower()
            target = get_body_part(target_body_part)
            if target is None:
                return jsonify({"error": "Select a valid section."}), 400

            if target_body_part != existing["body_part"]:
                updates.append("body_part = ?")
                parameters.append(target_body_part)
                updates.append("sort_order = ?")
                parameters.append(next_exercise_sort_order(target_body_part))

        if not updates:
            row = get_exercise(exercise_id)
            return jsonify({"exercise": serialize_exercise(row)})

        updates.append("updated_at = ?")
        parameters.append(now_utc_iso())
        parameters.append(exercise_id)

        db = get_db()
        db.execute(
            f"""
            UPDATE exercises
            SET {", ".join(updates)}
            WHERE id = ?
            """,
            tuple(parameters),
        )
        db.commit()

        row = get_exercise(exercise_id)
        return jsonify({"exercise": serialize_exercise(row)})

    return app


app = create_app()


if __name__ == "__main__":
    app.run(
        host=os.environ.get("FLASK_HOST", "0.0.0.0"),
        port=int(os.environ.get("FLASK_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
