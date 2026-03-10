# Workout Ledger

A small Flask + React workout logging app with persistent login, quick workout entry, diet taps, custom exercise management, light/dark mode, and a calendar that marks workout days.

## Features

- Segrada-style warm card UI with light and dark themes
- Three-part layout:
  - left quick workout builder with collapsible body-part sections
  - center timeline
  - bottom utility panel with diet logging and calendar navigation
- Seeded exercises for legs, shoulders, back, chest, arms, abs, and neck
- Quick set, rep, and weight controls for each selected exercise
- Workout entries saved into the timeline as rendered tables
- Remembers the last logged weight for each exercise and reuses it as the next default
- Add custom exercises and manage whether they appear in quick access
- Diet logging for protein shakes and meals with high-protein yes/no
- SQLite persistence for workouts, diet logs, exercise catalog data, and workout-day calendar markers

## Run

```bash
python3 -m pip install -r requirements.txt
python3 app.py
```

Open [http://127.0.0.1:5000](http://127.0.0.1:5000).

## Test

```bash
python3 -m unittest discover -s tests
```

## Deploy

- Preview URL: `http://187.124.76.222:8091`
- Production domain: `https://workout.bloodapps.com`
- Auto-update: `segrada-update.timer` checks the GitHub repo every 5 minutes
