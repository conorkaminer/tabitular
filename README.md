# Tabit

A local React and TypeScript web app for viewing TabIt (`.tbt`) files, playing tablature with bundled instrument samples, and exporting MIDI. Create new guitar, bass, and drum scores with the grid editor and save them as `.tbt` files.

## Run

Requires Python 3.9+, Node.js 20+, and a modern browser. Build the React frontend once before starting the Python server.

```sh
npm install
npm run build
python3 server.py
```

For frontend development with hot reload, run `npm run dev` in a second terminal. The Vite development server proxies no API calls; run the Python server on port 8765 as well.

Open [localhost:8765](http://127.0.0.1:8765), then load a `.tbt` file or choose
**New tab**. To preload a sample, run `python3 server.py --sample /path/to/song.tbt`.

If port 8765 is already in use, open the running app or use
`python3 server.py --port 8766` and open http://127.0.0.1:8766.

Imported files are read-only. New compositions use fixed 4/4 time and one tempo;
guitar articulations are displayed but not modeled in playback.

## Tests

```sh
python3 -m unittest -v
node --test test_editor.mjs test_soundbanks.mjs
```

Bundled sample attribution: [NOTICE](static/soundbanks/NOTICE.txt).
