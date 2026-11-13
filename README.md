# Snake Game v2

A dependency-free Snake game in plain HTML, CSS and JavaScript. Open `index.html` and play, English and French.

Three modes, special foods, skins, trophies, two themes, full screen and a settings menu. The first version of the game lives in the [snake-game](https://github.com/Ueudje/snake-game) repository.

## Project structure

```text
.
├── index.html        # Page structure and accessibility labels
├── css/
│   └── style.css     # Look and layout, themes (Neon, Retro LCD), phone and landscape layouts
├── js/
│   └── script.js     # Numbered sections: settings, content, text (EN/FR), saved data, sound, rules, drawing, menu, input
├── LICENSE           # MIT
└── README.md
```

Keep the three files from the same version together. If they differ, the game shows a red message at the bottom instead of failing silently.

## Modes

| Mode | Rules |
|---|---|
| **Classic** | Walls are deadly. The snake speeds up every 5 points. |
| **Time Attack** | 60 seconds. Walls wrap around. Clock foods add 5 seconds. |
| **Daily Challenge** | Same rocks and apple order for everyone on a given (UTC) day. Reach 12 points. One best score per day. Always plays at Normal speed. |

Pick a mode on the start screen (or press **1 / 2 / 3**).

## Special foods

They appear now and then and vanish after 9 seconds (they blink at the end). Each one has its own colour and shape.

| Food | Effect |
|---|---|
| Golden star | +3 points and +3 length |
| Blue diamond | **Slow-mo** for 6 s |
| Orange hexagon | **Double points** for 9 s |
| Violet ring | **Ghost**: pass through your own body for 5 s |
| White clock | +5 s (Time Attack only) |

## Themes, skins and trophies

- **Themes** (Menu > Style): **Neon** (the glowing default) and **Retro LCD** (square pixels on a green handheld screen, with quiet square-wave beeps). Skins only recolour the snake in Neon; Retro LCD is one colour.
- **Skins and trophies:** 11 trophies and 8 snake skins. Earning a trophy can unlock a skin.
- Everything is saved in your browser.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Steer | Arrow keys or W A S D (physical keys, so AZERTY, Arabic and other layouts work; the on-screen labels switch to Z Q S D on AZERTY) | Swipe, or the on-screen D-pad |
| Start / play again | Enter, Space, or a direction key | Tap the message |
| Pause / resume | Space, P or Esc | Pause button |
| Sound | M | Menu or start screen |
| Full screen | F | Full screen button (start screen, controls row on wide screens, Menu > Settings) |

The D-pad turns on automatically on touch screens. The game also pauses when you leave the tab, and resuming gives a short 2-1 countdown.

## Settings (Menu > Settings)

- **Game:** starting speed (Relaxed / Normal / Fast), pause when the window loses focus.
- **Sound and feel:** sound on/off, volume, screen shake, vibration (phones).
- **Display:** language (English / Français), full screen, on-screen D-pad, grid lines, high contrast.

Resetting progress keeps these settings.

Full screen is not available on iPhone Safari (Apple does not allow it for web pages). On iPhone, use Share > Add to Home Screen.

## Run it

Open `index.html` in Chrome, Edge, Firefox or Safari. No build step and no install.

For a local server instead (optional):

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Publish on GitHub Pages

1. Push this repository to GitHub.
2. Open **Settings > Pages**, choose **Deploy from a branch**, then the `main` branch and the `/ (root)` folder, and save.
3. After a minute or two the game is live at `https://<your-name>.github.io/snake-game-v2/`.

All paths are relative, so it also works from a sub-folder. After updating, refresh with Ctrl+F5 (Cmd+Shift+R on Mac) to skip the browser cache.

## Tweaking

- The top of `js/script.js` holds every number you are likely to change: speeds, levels, special-food chances and timings, the Daily goal, board size.
- Every word on screen is in the **Text** section of `js/script.js`, in English and French. Adding a language means copying the `fr` block, translating it, and adding it to `LANGUAGES`.
- Modes, special foods, skins and trophies are plain lists in the **Content** section.
- Colours live as variables at the top of `css/style.css`. A theme is one block that replaces those variables (see "Themes" at the end of the file). New skin colours go in as one `[data-skin="name"]` line.

## Ideas for later

Leaderboards need a server to check scores, because anything stored in the browser can be edited. The game is ready for that: rounds already run from a seed, so a server could replay a recorded run and verify it.
