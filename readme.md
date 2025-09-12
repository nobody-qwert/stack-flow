# Data Flow Designer

A tiny, no‑build, in‑browser tool for sketching data flows. Add a few nodes, connect them, export when you’re done.

Live demo: https://nobody-qwert.github.io/stack-flow/

## Why this exists

I wanted a super lightweight way to map how things talk to each other — APIs, tables, little modules — without opening a heavy diagramming suite or setting up a project. This runs in the browser, saves locally, and can export a single standalone HTML you can send to anyone.

## How to use it

- Open the live site above (or clone and double‑click `index.html`)
- Click “+ Module” to drop nodes
- Drag from variable ports to connect things
- Edit details in the Inspector on the right
- Export:
  - JSON — to keep working later
  - PNG — snapshot of what you see
  - HTML — one self‑contained file that works offline (and can even re‑export)

Tip: the exported HTML includes the app itself, so you can open it from Finder/Explorer and keep tweaking or re‑exporting without a server.

## Links

- Author: https://github.com/nobody-qwert  
- Repo: https://github.com/nobody-qwert/stack-flow  
- Discussions (questions/ideas/feedback): https://github.com/nobody-qwert/stack-flow/discussions

## License (plain English)

MIT License. Permissive and company-friendly:

- Commercial and noncommercial use allowed.
- You can modify, distribute, and sublicense, including as part of paid products/services.
- Requirement: keep the copyright and permission notice in copies/substantial portions.
- Comes without warranty (see LICENSE for full text).

Full text: see [LICENSE](./LICENSE)

## Dev notes

It’s just vanilla JS + ES modules. No build step. Open `index.html` in a modern browser.
