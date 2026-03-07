# Pet Timeline

A small Flask + React app for logging pet updates in a shared household timeline.

## Features

- Login screen with the two requested users:
  - `victoria` / `sashakitty`
  - `raza` / `kojikitty`
- Three-panel layout:
  - left: quick task logging for feed, litter clean, and dog walk
  - middle: timeline with text/photo posts
  - right: Toronto time and current Toronto weather
- Left and right panels can be collapsed in desktop and mobile layouts
- Photo uploads are resized automatically before storage
- Data is shared across logged-in users connecting to the same running server
- Stored posts and uploaded photos require login to access
- Posts editable and deletable only by the user who created them
- SQLite persistence

## Run

1. Install dependencies:

   ```bash
   python3 -m pip install -r requirements.txt
   ```

2. Start the app:

   ```bash
   python3 app.py
   ```

3. Open [http://127.0.0.1:5000](http://127.0.0.1:5000) on the machine running the app, or use that machine's LAN IP from another device on the same network.

## Test

```bash
python3 -m unittest discover -s tests
```

## Notes

- Uploaded images are stored in `/Users/sraza/Documents/segrada/uploads`.
- The frontend uses React from a CDN and the backend fetches weather from Open-Meteo.
- The server now listens on `0.0.0.0` by default. Use `FLASK_HOST`, `FLASK_PORT`, or `FLASK_DEBUG=1` to override runtime behavior.
