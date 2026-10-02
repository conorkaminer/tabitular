# Tabit

A React and TypeScript app for viewing TabIt (`.tbt`) files, playing tablature with bundled instrument samples, creating scores, and exporting `.tbt` and MIDI files. File processing runs in your browser, so the same build works on GitHub Pages and a local server. Opened files are not uploaded.

## Local development

Requires Node.js 22+ and pnpm 11.25.0 (install with `npm install -g pnpm@11.25.0`).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL Vite prints. Python is not needed for normal app use. Use a current browser supporting CompressionStream and DecompressionStream.

## Local production server

```sh
pnpm build
pnpm preview
```

Alternatively, serve `dist` with any static HTTP server, such as `python3 -m http.server 8765 --directory dist`, or use the existing Python server:

```sh
python3 server.py
# Optional custom example instead of the bundled riff:
python3 server.py --sample /path/to/song.tbt --port 8766
```

The Python server requires Python 3.9+. It retains its existing API for other clients. Vite uses the bundled example by default; the Python server’s URL uses the file supplied with `--sample`.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` tests, builds, and deploys pushes to `main`; it can also be run manually. In your repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**, then push these changes. For the current repository the expected URL is https://conorkaminer.github.io/tabitular/.

Vite emits relative asset URLs (`base: './'`), so the same `dist` works at `/`, `/tabitular/`, or a custom-domain root. Soundbanks, attribution, configuration, and the example are included. No API host, credentials, or environment variables are required. Serve the build over HTTP(S), rather than opening `index.html` as a local file.

## Modules

- `src/core/binary.mjs`: bounded compression, binary reading, Windows-1252 text, and checksums.
- `src/core/tabit.mjs`: browser TabIt 1.6–2.0 reader and fixed-grid writer.
- `src/core/midi.mjs`: MIDI serialization, including repeats and supported effects.
- `src/core/sample.mjs`: bundled example and optional local sample configuration.
- `static/editor.mjs` and `static/soundbanks.mjs`: score editing and sample playback.
- `src/app-controller.ts`: UI orchestration; `public/`: assets copied into the build.
- `tbt.py` and `server.py`: optional Python API and local hosting.

Imported files are read-only. New compositions use fixed 4/4 time and one tempo; guitar articulations are displayed but not modeled in playback. Browser drafts are separate for each origin (local and GitHub Pages); download `.tbt` files to move between them.

## Tests

```sh
pnpm test # Requires Python 3 for cross-language codec parity tests
python3 -m unittest -v
pnpm build
```

Bundled sample attribution: [NOTICE](public/soundbanks/NOTICE.txt).
