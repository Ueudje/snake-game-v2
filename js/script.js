"use strict";

/* ======================================================================
   SNAKE
    1. Settings       – every tunable number lives here
    2. Content        – game modes, special foods, skins, trophies
    3. Text           – every word on screen, in English and French
    4. Helpers        – seeded random numbers, small utilities
    5. Saved data     – best scores, stats, skin, settings (localStorage)
    6. Sound          – tiny WebAudio beeps (no audio files needed)
    7. Page elements
    8. Game state     – one `state` value: ready, countdown, running, paused, over
    9. Round setup    – rocks, food order, bonuses
   10. Game rules     – movement, collisions, food, levels, effects
   11. Trophies       – achievements and rewards
   12. Drawing        – board, animations, HUD, messages, theme, language, full screen
   13. Menu           – style, trophies, stats, settings
   14. Input          – keyboard, touch, D-pad, buttons
   ====================================================================== */

/* ---------- 1. Settings ---------- */
const GRID_SIZE = 20;
const STARTING_SNAKE = [
  { x: 7, y: 10 },
  { x: 6, y: 10 },
  { x: 5, y: 10 }
];
const START_DIRECTION = { x: 1, y: 0 };

// Speed: every level the snake moves a little faster, down to a floor.
const START_TICK_MS = 130;
const MIN_TICK_MS = 70;
const TICK_STEP_MS = 9;
const FOOD_PER_LEVEL = 5;

const MAX_QUEUED_TURNS = 2;        // buffered turns, so quick inputs are not lost
const START_COUNTDOWN = 3;         // 3-2-1 before a round
const RESUME_COUNTDOWN = 2;        // shorter 2-1 after pausing
const COUNTDOWN_STEP_MS = 350;
const CRASH_PAUSE_MS = 450;        // let the crash flash play before the message appears
const GAME_OVER_LOCK_MS = 700;     // ignore keys right after dying so mashing keys can't skip the result
const SWIPE_MIN_PX = 18;

// Special foods
const BONUS_CHANCE = 0.3;          // chance after each apple that a special food appears
const BONUS_MIN_SCORE = 2;
const BONUS_LIFETIME_MS = 9000;
const BONUS_WARNING_MS = 3000;     // blinks during the last seconds
const GOLDEN_POINTS = 3;
const GOLDEN_GROWTH = 3;
const SLOW_FACTOR = 1.6;           // Slow-mo makes every step this much longer
const CLOCK_BONUS_MS = 5000;

const DAILY_GOAL = 12;

// Player settings (Menu > Settings). The Daily Challenge ignores the speed setting so scores stay comparable.
const SPEED_OFFSET = { relaxed: 30, normal: 0, fast: -25 };   // milliseconds added to the first step
const SPEEDS = ["relaxed", "normal", "fast"];
const THEMES = ["neon", "lcd"];
const LANGUAGES = [{ id: "en", name: "English" }, { id: "fr", name: "Français" }];
const DEFAULT_VOLUME = 80;          // 0-100. 80 is the loudness the game always had.
const VIBRATE_EAT_MS = 12;
const VIBRATE_BONUS_MS = [14, 40, 14];
const VIBRATE_CRASH_MS = 60;

const STORAGE_KEY = "arcade.snake.v1";   // namespaced: GitHub Pages shares storage across your repos
const LEGACY_BEST_KEY = "snakeBestScore";
const MAX_SCORE = GRID_SIZE * GRID_SIZE;

const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };
const LEFT = { x: -1, y: 0 };
const RIGHT = { x: 1, y: 0 };

// event.code is the physical key, so WASD works on AZERTY, Arabic, Cyrillic and other layouts.
const KEY_TO_DIRECTION = new Map([
  ["ArrowUp", UP], ["KeyW", UP],
  ["ArrowDown", DOWN], ["KeyS", DOWN],
  ["ArrowLeft", LEFT], ["KeyA", LEFT],
  ["ArrowRight", RIGHT], ["KeyD", RIGHT]
]);
const DPAD_DIRECTIONS = { up: UP, down: DOWN, left: LEFT, right: RIGHT };

/* ---------- 2. Content ---------- */
// Names and descriptions live in section 3 (looked up by id) so they can be translated.
const MODES = {
  classic: { id: "classic", wrap: false, timeMs: 0, startLevel: 1, obstacles: false, seeded: false },
  time: { id: "time", wrap: true, timeMs: 60000, startLevel: 2, obstacles: false, seeded: false },
  daily: { id: "daily", wrap: false, timeMs: 0, startLevel: 1, obstacles: true, seeded: true }
};

// Each special food has its own colour and shape. `effect` foods last `ms` milliseconds.
const BONUS_TYPES = {
  golden: { weight: 3 },
  slow: { weight: 2, effect: "slow", ms: 6000 },
  double: { weight: 2, effect: "double", ms: 9000 },
  ghost: { weight: 2, effect: "ghost", ms: 5000 },
  clock: { weight: 4, onlyModes: ["time"] }
};
const EFFECTS = {
  ghost: { tone: "violet" },
  slow: { tone: "blue" },
  double: { tone: "orange" }
};

// `unlock` is the trophy that unlocks the skin (null = always available).
const SKINS = [
  { id: "mint", unlock: null },
  { id: "ocean", unlock: "ten" },
  { id: "sunset", unlock: "twentyfive" },
  { id: "violet", unlock: "daily" },
  { id: "gold", unlock: "time20" },
  { id: "candy", unlock: "sweet" },
  { id: "phantom", unlock: "ghost" },
  { id: "rainbow", unlock: "fifty" }
];

// `test` receives a summary of the current round; `data` holds lifetime totals.
const ACHIEVEMENTS = [
  { id: "first_bite", test: c => c.score >= 1 || data.apples > 0 },
  { id: "ten", skin: "ocean", test: c => c.score >= 10 },
  { id: "twentyfive", skin: "sunset", test: c => c.score >= 25 },
  { id: "fifty", skin: "rainbow", test: c => c.score >= 50 },
  { id: "level5", test: c => c.level >= 5 },
  { id: "time20", skin: "gold", test: c => c.mode === "time" && c.score >= 20 },
  { id: "daily", skin: "violet", test: c => c.mode === "daily" && c.score >= DAILY_GOAL },
  { id: "sweet", skin: "candy", progress: () => [data.stats.bonus, 5], test: () => data.stats.bonus >= 5 },
  { id: "ghost", skin: "phantom", test: c => c.ghostPass },
  { id: "marathon", progress: () => [data.games, 25], test: () => data.games >= 25 },
  { id: "master", test: c => c.won }
];

/* ---------- 3. Text (English and French) ---------- */
// Every word the player sees lives here, so a new language is one more block.
// {name} marks a value that the game fills in.
const TEXT = {
  en: {
    "score.level": "Level", "score.score": "Score", "score.best": "Best",
    "btn.start": "Start Game", "btn.again": "Play Again", "btn.pause": "Pause", "btn.resume": "Resume", "btn.restart": "Restart",
    "btn.menu": "Menu", "btn.menuTip": "Style, trophies, stats and settings", "btn.close": "Close menu",
    "btn.fullscreen": "Full screen", "btn.exitFullscreen": "Exit full screen",
    "aria.scores": "Scores", "aria.board": "Snake game board. Steer with the arrow keys or {keys}.",
    "aria.controls": "Game controls", "aria.dpad": "On-screen direction buttons", "aria.mode": "Game mode",
    "aria.menuSections": "Menu sections", "aria.up": "Up", "aria.down": "Down", "aria.left": "Left", "aria.right": "Right",
    "help.or": "or", "help.steer": "to steer", "help.pause": "to pause", "help.mute": "mutes",
    "help.swipe": "Swipe or tap on mobile", "key.space": "Space",

    "mode.classic.label": "Classic", "mode.classic.short": "Classic", "mode.classic.eyebrow": "CLASSIC ARCADE",
    "mode.classic.hint": "Walls are deadly. The snake speeds up every {n} points.",
    "mode.time.label": "Time Attack", "mode.time.short": "Time Attack", "mode.time.eyebrow": "TIME ATTACK",
    "mode.time.hint": "60 seconds on the clock. Walls wrap around. Grab clocks for +5 seconds.",
    "mode.daily.label": "Daily Challenge", "mode.daily.short": "Daily", "mode.daily.eyebrow": "DAILY CHALLENGE",
    "mode.daily.hint": "Same rocks and apples for everyone today. Goal: {goal} points.",

    "bonus.golden": "Golden apple", "bonus.slow": "Slow-mo", "bonus.double": "Double points", "bonus.ghost": "Ghost", "bonus.clock": "+5 seconds",
    "effect.ghost": "Ghost", "effect.slow": "Slow-mo", "effect.double": "x2 points",

    "skin.mint": "Mint", "skin.ocean": "Ocean", "skin.sunset": "Sunset", "skin.violet": "Violet",
    "skin.gold": "Gold", "skin.candy": "Candy", "skin.phantom": "Phantom", "skin.rainbow": "Rainbow",

    "ach.first_bite.name": "First Bite", "ach.first_bite.text": "Eat your first apple.",
    "ach.ten.name": "Getting Hungry", "ach.ten.text": "Score 10 in one game.",
    "ach.twentyfive.name": "Snake Charmer", "ach.twentyfive.text": "Score 25 in one game.",
    "ach.fifty.name": "Serpent King", "ach.fifty.text": "Score 50 in one game.",
    "ach.level5.name": "Speed Demon", "ach.level5.text": "Reach level 5.",
    "ach.time20.name": "Beat the Clock", "ach.time20.text": "Score 20 in Time Attack.",
    "ach.daily.name": "Daily Driver", "ach.daily.text": "Reach {goal} points in the Daily Challenge.",
    "ach.sweet.name": "Sweet Tooth", "ach.sweet.text": "Eat 5 special foods.",
    "ach.ghost.name": "Ghost Walker", "ach.ghost.text": "Slip through your own body while Ghost is active.",
    "ach.marathon.name": "Marathon", "ach.marathon.text": "Play 25 games.",
    "ach.master.name": "Board Master", "ach.master.text": "Fill the entire board.",

    "ready.kicker": "READY?", "ready.title": "Let's play",
    "ready.text": "Steer with arrow keys, {keys} or swipes. Press a direction, tap, or hit Start.",
    "paused.kicker": "PAUSED", "paused.title": "Take a breath",
    "paused.text": "Press Resume, Space or tap to continue. You get a short countdown first.",
    "over.win": "YOU WIN", "over.timeup": "TIME'S UP", "over.gameover": "GAME OVER",
    "over.titleWin": "Board cleared!", "over.titleBest": "New best!", "over.titleTime": "Time's up!", "over.titleTry": "Nice try!",
    "end.wall": "You hit the wall.", "end.rock": "You hit a rock.", "end.self": "You bit your own tail.",
    "end.time": "The clock ran out.", "end.won": "You filled every square on the board.",
    "over.goal": " Goal: {goal} points{check}.", "over.score": "Final score: {score}",
    "over.stats": "{mode} best {best} · Games played {games}", "over.unlocked": "Unlocked: {list}",
    "over.skin": "{name} skin", "over.hint": "Press Enter or an arrow key, or tap, to play again",

    "quick.soundOn": "Sound: on", "quick.soundOff": "Sound: off", "quick.dpadOn": "D-pad: on", "quick.dpadOff": "D-pad: off",
    "share.button": "Share result", "share.copied": "Copied!", "share.line": "Score {score} · Level {level}", "share.goal": " · Goal ✓",

    "toast.trophy": "Trophy unlocked", "toast.trophySkin": "{name} · New skin: {skin}",
    "toast.notice": "Notice", "toast.noFullscreen": "Full screen is not available here.",

    "say.ready": "{mode}. Get ready", "say.paused": "Paused", "say.score": "Score {score}",
    "say.level": "Level {level}. Score {score}", "say.trophy": "Trophy unlocked: {name}",
    "say.soundOn": "Sound on", "say.soundOff": "Sound off", "say.locked": "Locked. {text}",
    "say.win": "You win. Final score {score}", "say.over": "Game over. Final score {score}", "say.best": ". New best",
    "say.reset": "Progress reset", "say.theme": "Theme: {name}", "say.language": "Language: {name}",

    "menu.title": "Menu", "tab.skins": "Style", "tab.trophies": "Trophies", "tab.stats": "Stats", "tab.settings": "Settings",
    "style.theme": "Theme", "theme.neon": "Neon", "theme.lcd": "Retro LCD",
    "theme.neon.note": "The glowing arcade look.", "theme.lcd.note": "Chunky pixels on a green screen.",
    "style.skin": "Snake skin", "style.skinLcd": "Skins show in the Neon theme. Retro LCD is one colour.",
    "skins.count": "{n} of {total} skins unlocked. Earn trophies to unlock more.",
    "skin.inuse": "In use", "skin.tap": "Tap to use", "skin.locked": "Locked: {text}",
    "trophies.count": "{n} of {total} trophies earned.", "trophies.reward": "Reward: {skin} skin",
    "stat.games": "Games played", "stat.apples": "Apples eaten", "stat.bestClassic": "Best Classic",
    "stat.bestTime": "Best Time Attack", "stat.bestDaily": "Daily best ({date})", "stat.longest": "Longest snake",
    "stat.special": "Special foods", "stat.time": "Time played", "stat.boards": "Boards cleared", "stat.trophies": "Trophies",

    "set.group.game": "Game", "set.speed": "Starting speed", "set.speed.note": "The Daily Challenge always uses Normal.",
    "speed.relaxed": "Relaxed", "speed.normal": "Normal", "speed.fast": "Fast",
    "set.blur": "Pause when the window loses focus", "set.blur.note": "Stops the game when you click another window.",
    "set.group.sound": "Sound and feel", "set.sound": "Sound", "set.sound.note": "Short beeps for eating, levels and trophies.",
    "set.volume": "Volume", "set.shake": "Screen shake", "set.shake.note": "A short jolt when the snake crashes.",
    "set.vibrate": "Vibration", "set.vibrate.note": "Phones only: a buzz when you eat or crash.",
    "set.group.display": "Display", "set.language": "Language",
    "set.fullscreen": "Full screen", "set.fullscreen.note": "Also on the F key.",
    "set.fullscreen.none": "Not available in this browser. On iPhone, use Share, then Add to Home Screen.",
    "set.fullscreenEnter": "Enter", "set.fullscreenExit": "Exit",
    "set.dpad": "On-screen D-pad", "set.dpad.note": "Four direction buttons for touch screens.",
    "set.grid": "Grid lines", "set.grid.note": "Faint lines between squares.",
    "set.contrast": "High contrast", "set.contrast.note": "Brighter outlines and colours for small or sunny screens.",
    "on": "On", "off": "Off",
    "set.reset": "Reset all progress", "set.reset.confirm": "Tap again to erase scores, stats and trophies",
    "key.steer": "Arrows or {keys}: steer", "key.pause": "Space, P or Esc: pause", "key.mute": "M: sound on/off",
    "key.full": "F: full screen", "key.mode": "1 / 2 / 3: pick a mode on the start screen", "key.enter": "Enter: start or play again"
  },

  fr: {
    "score.level": "Niveau", "score.score": "Score", "score.best": "Record",
    "btn.start": "Jouer", "btn.again": "Rejouer", "btn.pause": "Pause", "btn.resume": "Reprendre", "btn.restart": "Relancer",
    "btn.menu": "Menu", "btn.menuTip": "Style, trophées, stats et réglages", "btn.close": "Fermer le menu",
    "btn.fullscreen": "Plein écran", "btn.exitFullscreen": "Quitter le plein écran",
    "aria.scores": "Scores", "aria.board": "Plateau de Snake. Dirigez avec les flèches ou {keys}.",
    "aria.controls": "Commandes du jeu", "aria.dpad": "Boutons de direction à l'écran", "aria.mode": "Mode de jeu",
    "aria.menuSections": "Sections du menu", "aria.up": "Haut", "aria.down": "Bas", "aria.left": "Gauche", "aria.right": "Droite",
    "help.or": "ou", "help.steer": "pour diriger", "help.pause": "pour mettre en pause", "help.mute": "coupe le son",
    "help.swipe": "Balayez ou touchez sur mobile", "key.space": "Espace",

    "mode.classic.label": "Classique", "mode.classic.short": "Classique", "mode.classic.eyebrow": "ARCADE CLASSIQUE",
    "mode.classic.hint": "Les murs sont mortels. Le serpent accélère tous les {n} points.",
    "mode.time.label": "Contre-la-montre", "mode.time.short": "Chrono", "mode.time.eyebrow": "CONTRE-LA-MONTRE",
    "mode.time.hint": "60 secondes au chrono. Les murs se traversent. Les horloges ajoutent 5 secondes.",
    "mode.daily.label": "Défi du jour", "mode.daily.short": "Du jour", "mode.daily.eyebrow": "DÉFI DU JOUR",
    "mode.daily.hint": "Mêmes rochers et mêmes pommes pour tout le monde aujourd'hui. Objectif : {goal} points.",

    "bonus.golden": "Pomme dorée", "bonus.slow": "Ralenti", "bonus.double": "Points doubles", "bonus.ghost": "Fantôme", "bonus.clock": "+5 secondes",
    "effect.ghost": "Fantôme", "effect.slow": "Ralenti", "effect.double": "Points x2",

    "skin.mint": "Menthe", "skin.ocean": "Océan", "skin.sunset": "Crépuscule", "skin.violet": "Violet",
    "skin.gold": "Or", "skin.candy": "Bonbon", "skin.phantom": "Spectre", "skin.rainbow": "Arc-en-ciel",

    "ach.first_bite.name": "Première bouchée", "ach.first_bite.text": "Mangez votre première pomme.",
    "ach.ten.name": "Petit creux", "ach.ten.text": "Marquez 10 points en une partie.",
    "ach.twentyfive.name": "Charmeur de serpents", "ach.twentyfive.text": "Marquez 25 points en une partie.",
    "ach.fifty.name": "Roi des serpents", "ach.fifty.text": "Marquez 50 points en une partie.",
    "ach.level5.name": "Démon de vitesse", "ach.level5.text": "Atteignez le niveau 5.",
    "ach.time20.name": "Contre la montre", "ach.time20.text": "Marquez 20 points en Contre-la-montre.",
    "ach.daily.name": "Fidèle du jour", "ach.daily.text": "Atteignez {goal} points au Défi du jour.",
    "ach.sweet.name": "Bec sucré", "ach.sweet.text": "Mangez 5 aliments spéciaux.",
    "ach.ghost.name": "Marcheur fantôme", "ach.ghost.text": "Traversez votre propre corps pendant l'effet Fantôme.",
    "ach.marathon.name": "Marathon", "ach.marathon.text": "Jouez 25 parties.",
    "ach.master.name": "Maître du plateau", "ach.master.text": "Remplissez tout le plateau.",

    "ready.kicker": "PRÊT ?", "ready.title": "On joue !",
    "ready.text": "Dirigez avec les flèches, {keys} ou en balayant. Appuyez sur une direction, touchez l'écran ou cliquez sur Jouer.",
    "paused.kicker": "PAUSE", "paused.title": "Respirez",
    "paused.text": "Appuyez sur Reprendre, Espace ou touchez l'écran pour continuer. Un court compte à rebours précède la reprise.",
    "over.win": "VICTOIRE", "over.timeup": "TEMPS ÉCOULÉ", "over.gameover": "PARTIE TERMINÉE",
    "over.titleWin": "Plateau rempli !", "over.titleBest": "Nouveau record !", "over.titleTime": "Temps écoulé !", "over.titleTry": "Bien essayé !",
    "end.wall": "Vous avez heurté le mur.", "end.rock": "Vous avez heurté un rocher.", "end.self": "Vous vous êtes mordu la queue.",
    "end.time": "Le temps est écoulé.", "end.won": "Vous avez rempli toutes les cases du plateau.",
    "over.goal": " Objectif : {goal} points{check}.", "over.score": "Score final : {score}",
    "over.stats": "Record {mode} : {best} · Parties jouées : {games}", "over.unlocked": "Débloqué : {list}",
    "over.skin": "skin {name}", "over.hint": "Appuyez sur Entrée ou une flèche, ou touchez l'écran, pour rejouer",

    "quick.soundOn": "Son : oui", "quick.soundOff": "Son : non", "quick.dpadOn": "Croix : oui", "quick.dpadOff": "Croix : non",
    "share.button": "Partager le résultat", "share.copied": "Copié !", "share.line": "Score {score} · Niveau {level}", "share.goal": " · Objectif ✓",

    "toast.trophy": "Trophée débloqué", "toast.trophySkin": "{name} · Nouveau skin : {skin}",
    "toast.notice": "Info", "toast.noFullscreen": "Le plein écran n'est pas disponible ici.",

    "say.ready": "{mode}. Prêt ?", "say.paused": "Pause", "say.score": "Score {score}",
    "say.level": "Niveau {level}. Score {score}", "say.trophy": "Trophée débloqué : {name}",
    "say.soundOn": "Son activé", "say.soundOff": "Son coupé", "say.locked": "Verrouillé. {text}",
    "say.win": "Victoire. Score final {score}", "say.over": "Partie terminée. Score final {score}", "say.best": ". Nouveau record",
    "say.reset": "Progression réinitialisée", "say.theme": "Thème : {name}", "say.language": "Langue : {name}",

    "menu.title": "Menu", "tab.skins": "Style", "tab.trophies": "Trophées", "tab.stats": "Stats", "tab.settings": "Réglages",
    "style.theme": "Thème", "theme.neon": "Néon", "theme.lcd": "LCD rétro",
    "theme.neon.note": "L'ambiance arcade lumineuse.", "theme.lcd.note": "De gros pixels sur écran vert.",
    "style.skin": "Skin du serpent", "style.skinLcd": "Les skins s'affichent dans le thème Néon. Le LCD rétro est monochrome.",
    "skins.count": "{n} skins sur {total} débloqués. Gagnez des trophées pour en débloquer d'autres.",
    "skin.inuse": "Utilisé", "skin.tap": "Touchez pour l'utiliser", "skin.locked": "Verrouillé : {text}",
    "trophies.count": "{n} trophées sur {total} obtenus.", "trophies.reward": "Récompense : skin {skin}",
    "stat.games": "Parties jouées", "stat.apples": "Pommes mangées", "stat.bestClassic": "Record Classique",
    "stat.bestTime": "Record Contre-la-montre", "stat.bestDaily": "Record du jour ({date})", "stat.longest": "Plus long serpent",
    "stat.special": "Aliments spéciaux", "stat.time": "Temps de jeu", "stat.boards": "Plateaux remplis", "stat.trophies": "Trophées",

    "set.group.game": "Partie", "set.speed": "Vitesse de départ", "set.speed.note": "Le Défi du jour utilise toujours la vitesse normale.",
    "speed.relaxed": "Détendue", "speed.normal": "Normale", "speed.fast": "Rapide",
    "set.blur": "Pause si la fenêtre perd le focus", "set.blur.note": "Met le jeu en pause quand vous cliquez sur une autre fenêtre.",
    "set.group.sound": "Son et sensations", "set.sound": "Son", "set.sound.note": "Petits bips pour les pommes, les niveaux et les trophées.",
    "set.volume": "Volume", "set.shake": "Tremblement de l'écran", "set.shake.note": "Une secousse quand le serpent s'écrase.",
    "set.vibrate": "Vibration", "set.vibrate.note": "Sur téléphone : une vibration quand vous mangez ou vous écrasez.",
    "set.group.display": "Affichage", "set.language": "Langue",
    "set.fullscreen": "Plein écran", "set.fullscreen.note": "Aussi avec la touche F.",
    "set.fullscreen.none": "Indisponible dans ce navigateur. Sur iPhone, utilisez Partager, puis Sur l'écran d'accueil.",
    "set.fullscreenEnter": "Activer", "set.fullscreenExit": "Quitter",
    "set.dpad": "Croix directionnelle", "set.dpad.note": "Quatre boutons de direction pour les écrans tactiles.",
    "set.grid": "Quadrillage", "set.grid.note": "Fines lignes entre les cases.",
    "set.contrast": "Contraste élevé", "set.contrast.note": "Contours et couleurs plus vifs pour les petits écrans ou le plein soleil.",
    "on": "Activé", "off": "Désactivé",
    "set.reset": "Réinitialiser la progression", "set.reset.confirm": "Touchez encore pour effacer scores, stats et trophées",
    "key.steer": "Flèches ou {keys} : diriger", "key.pause": "Espace, P ou Échap : pause", "key.mute": "M : son activé/coupé",
    "key.full": "F : plein écran", "key.mode": "1 / 2 / 3 : choisir un mode à l'écran d'accueil", "key.enter": "Entrée : jouer ou rejouer"
  }
};

let lang = "en";   // set from the saved data at start-up (see "Start")

function t(key, values) {
  let text = (TEXT[lang] && TEXT[lang][key]) ?? TEXT.en[key] ?? key;
  if (values) text = text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match));
  return text;
}

const modeNameOf = item => t(`mode.${item.id}.label`);
const modeShortOf = item => t(`mode.${item.id}.short`);
const modeEyebrowOf = item => t(`mode.${item.id}.eyebrow`);
const modeHintOf = item => t(`mode.${item.id}.hint`, { goal: DAILY_GOAL, n: FOOD_PER_LEVEL });
const bonusName = type => t(`bonus.${type}`);
const effectName = key => t(`effect.${key}`);
const skinName = skin => t(`skin.${skin.id}`);
const trophyName = achievement => t(`ach.${achievement.id}.name`);
const trophyText = achievement => t(`ach.${achievement.id}.text`, { goal: DAILY_GOAL });

/* ---------- 4. Helpers ---------- */
// A small, fast random generator that can be started from a seed (same seed = same numbers).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const cellKey = position => position.y * GRID_SIZE + position.x;
const cellAt = index => ({ x: index % GRID_SIZE, y: Math.floor(index / GRID_SIZE) });
const isOpposite = (a, b) => a.x === -b.x && a.y === -b.y;
const isSame = (a, b) => a.x === b.x && a.y === b.y;
const todayString = () => new Date().toISOString().slice(0, 10);   // UTC date, so friends share one daily

function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

// Builds an element with textContent only (never innerHTML).
function el(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/* ---------- 5. Saved data ---------- */
function cleanNumber(value, max) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, max) : 0;
}

function loadData() {
  const data = loadFreshData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) || {};
      const bests = saved.bests || {};
      // Older saves kept a single `best`; it was the Classic best.
      data.bests.classic = cleanNumber(bests.classic ?? saved.best, MAX_SCORE);
      data.bests.time = cleanNumber(bests.time, MAX_SCORE);
      data.bests.daily = cleanNumber(bests.daily, MAX_SCORE);
      data.daily.date = typeof saved.daily?.date === "string" ? saved.daily.date.slice(0, 10) : "";
      data.daily.plays = cleanNumber(saved.daily?.plays, 1e6);
      data.games = cleanNumber(saved.games, 1e9);
      data.apples = cleanNumber(saved.apples, 1e9);
      data.sound = saved.sound !== false;
      data.volume = typeof saved.volume === "number" ? Math.min(100, cleanNumber(saved.volume, 100)) : DEFAULT_VOLUME;
      data.shake = saved.shake !== false;
      data.vibrate = saved.vibrate !== false;
      data.grid = saved.grid !== false;
      data.contrast = saved.contrast === true;
      data.blurPause = saved.blurPause !== false;
      data.speed = SPEEDS.includes(saved.speed) ? saved.speed : "normal";
      data.theme = THEMES.includes(saved.theme) ? saved.theme : "neon";
      data.lang = LANGUAGES.some(item => item.id === saved.lang) ? saved.lang : data.lang;
      data.dpad = typeof saved.dpad === "boolean" ? saved.dpad : null;
      data.unlocked = Array.isArray(saved.unlocked)
        ? saved.unlocked.filter(id => ACHIEVEMENTS.some(a => a.id === id))
        : [];
      data.stats.bonus = cleanNumber(saved.stats?.bonus, 1e9);
      data.stats.longest = cleanNumber(saved.stats?.longest, MAX_SCORE);
      data.stats.seconds = cleanNumber(saved.stats?.seconds, 1e10);
      data.stats.wins = cleanNumber(saved.stats?.wins, 1e9);
      if (MODES[saved.mode]) data.mode = saved.mode;
      const skin = SKINS.find(s => s.id === saved.skin);
      if (skin && (!skin.unlock || data.unlocked.includes(skin.unlock))) data.skin = skin.id;
    } else {
      // Carry over the best score from the first version of the game.
      data.bests.classic = cleanNumber(localStorage.getItem(LEGACY_BEST_KEY), MAX_SCORE);
    }
  } catch (error) {
    // Storage is optional; the game still works for this session.
  }
  return data;
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Ignore blocked or full storage.
  }
}

const data = loadData();

// The Daily best only counts for today's date.
function refreshDaily() {
  const today = todayString();
  if (data.daily.date !== today) {
    data.daily = { date: today, plays: 0 };
    data.bests.daily = 0;
  }
}

/* ---------- 6. Sound ---------- */
const sound = (() => {
  let context = null;

  // Browsers only allow audio after a click or key press, so this runs on those.
  function unlock() {
    if (!data.sound) return;
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        context = new AudioContextClass();
      }
      if (context.state === "suspended") context.resume();
    } catch (error) {
      context = null;
    }
  }

  function tone(frequency, delay, duration, { type = "triangle", volume = 0.06, slideTo = null } = {}) {
    if (!data.sound || !context || data.volume <= 0) return;
    // Retro LCD: every sound becomes a quiet square-wave beep, like an old handheld.
    if (data.theme === "lcd") {
      type = "square";
      volume *= 0.55;
    }
    volume = Math.max(0.0002, volume * data.volume / DEFAULT_VOLUME);
    try {
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    } catch (error) {
      // Sound is a bonus; never let it break the game.
    }
  }

  return {
    unlock,
    eat(score) { tone(520 + (score % 5) * 70, 0, 0.1, { slideTo: 880 + (score % 5) * 70 }); },
    levelUp() { [523, 659, 784, 1047].forEach((note, i) => tone(note, i * 0.09, 0.14)); },
    bonus() { [880, 1175, 1568].forEach((note, i) => tone(note, i * 0.055, 0.12, { type: "sine", volume: 0.07 })); },
    achievement() { [659, 880, 1109, 1319].forEach((note, i) => tone(note, i * 0.08, 0.2, { type: "sine", volume: 0.07 })); },
    tick() { tone(1000, 0, 0.05, { type: "square", volume: 0.03 }); },
    countdown() { tone(440, 0, 0.1, { type: "sine", volume: 0.07 }); },
    go() { tone(880, 0, 0.22, { type: "square", volume: 0.045 }); },
    gameOver() { tone(330, 0, 0.5, { type: "sawtooth", volume: 0.05, slideTo: 70 }); },
    win() { [523, 659, 784, 1047, 1319].forEach((note, i) => tone(note, i * 0.11, 0.2)); }
  };
})();

// Short buzz on phones that support it (it does nothing on desktop browsers and iPhones).
function vibrate(pattern) {
  if (!data.vibrate) return;
  try { navigator.vibrate?.(pattern); } catch (error) { /* not supported */ }
}

/* ---------- 7. Page elements ---------- */
// If index.html and script.js come from different versions, say so on screen
// instead of leaving buttons that silently do nothing.
const missingElements = [];
function $(selector) {
  const element = document.querySelector(selector);
  if (!element) missingElements.push(selector);
  return element;
}

const board = $("#game-board");
const boardWrap = $("#board-wrap");
const header = $(".game-header");
const controls = $(".controls");
const helpText = $(".help-text");
const modeLabel = $("#mode-label");
const scoreElement = $("#score");
const levelElement = $("#level");
const bestScoreElement = $("#best-score");
const startButton = $("#start-button");
const pauseButton = $("#pause-button");
const restartButton = $("#restart-button");
const menuButton = $("#menu-button");
const overlay = $("#message-overlay");
const messageKicker = $("#message-kicker");
const messageTitle = $("#message-title");
const messageText = $("#message-text");
const finalScore = $("#final-score");
const statsLine = $("#stats-line");
const unlockLine = $("#unlock-line");
const restartHint = $("#restart-hint");
const modePicker = $("#mode-picker");
const modeHint = $("#mode-hint");
const quickSound = $("#quick-sound");
const quickDpad = $("#quick-dpad");
const shareButton = $("#share-button");
const countdownElement = $("#countdown");
const foodElement = $("#food");
const bonusElement = $("#bonus");
const snakeLayer = $("#snake-layer");
const rockLayer = $("#rock-layer");
const floatLayer = $("#float-layer");
const foodEffectElement = $("#food-effect");
const effectsBar = $("#effects");
const clockElement = $("#clock");
const toastElement = $("#toast");
const menu = $("#menu");
const menuTabs = $("#menu-tabs");
const menuBody = $("#menu-body");
const menuClose = $("#menu-close");
const dpad = $("#dpad");
const fullscreenButton = $("#fullscreen-button");
const quickFullscreen = $("#quick-fullscreen");
const srStatus = $("#sr-status");

if (missingElements.length) {
  const notice = document.createElement("div");
  notice.setAttribute("role", "alert");
  notice.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:99;max-width:560px;margin:0 auto;padding:14px 16px;border-radius:12px;background:#7f1d1d;color:#fff;font:600 14px/1.5 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.4)";
  notice.textContent = "The game files don't match each other (missing " + missingElements.join(", ") + "). Replace index.html, style.css and script.js together, then refresh with Ctrl+F5 (Cmd+Shift+R on Mac).";
  document.body.appendChild(notice);
  throw new Error("Game files are out of sync. Missing: " + missingElements.join(", "));
}

document.documentElement.style.setProperty("--grid", GRID_SIZE);

const motionPreference = window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };

/* ---------- 8. Game state ---------- */
// "ready" -> "countdown" -> "running" <-> "paused", and "over" after a crash, a timeout or a win.
let state = "ready";
let mode = MODES[data.mode];
let menuOpen = false;
lang = data.lang;
const WASD_CODES = ["KeyW", "KeyA", "KeyS", "KeyD"];
let keyLabels = defaultKeyLabels();   // what the steering keys are printed as (AZERTY keyboards print Z Q S D)

let snake;
let food;
let bonus;                 // { x, y, type, remainingMs } or null
let direction;
let directionQueue = [];   // upcoming turns, consumed one per step
let pendingGrowth;         // segments still to be added to the tail
let growthEaten;
let score;
let level;
let bestScore = 0;
let bestAtRoundStart = 0;
let effects = { ghost: 0, slow: 0, double: 0 };   // milliseconds left for each effect
let timeLeftMs = 0;
let elapsedMs = 0;
let roundApples = 0;
let roundGhostPass = false;
let roundUnlocks = [];
let stepLeveledUp = false;

let rocks = [];
let rockSet = new Set();
let foodOrder = [];
let foodPointer = 0;
let foodRandom = Math.random;
let bonusRandom = Math.random;

let resuming = false;      // true while the 2-1 countdown after a pause is running
let gameOverAt = 0;
let touchOrigin = null;
let scheduledInterval = START_TICK_MS;
let lastEndSummary = null;

let timerId = null;
let countdownId = null;
let countdownHideId = null;
let overlayTimerId = null;
let restartHintId = null;
let toastTimerId = null;
let nextTickAt = 0;

let segmentElements = [];
const movementAnimations = new Map();
let foodEffectAnimation = null;
let countdownAnimation = null;
const hudCache = {};
const effectPills = {};
const toastQueue = [];

/* ---------- 9. Round setup ---------- */
const levelForScore = value => mode.startLevel + Math.floor(value / FOOD_PER_LEVEL);
const speedOffset = () => (mode.seeded ? 0 : SPEED_OFFSET[data.speed] || 0);
const tickForLevel = value => Math.max(MIN_TICK_MS, START_TICK_MS + speedOffset() - (value - 1) * TICK_STEP_MS);
const stepIntervalMs = () => Math.round(tickForLevel(level) * (effects.slow > 0 ? SLOW_FACTOR : 1));
const bestFor = modeId => data.bests[modeId] || 0;

function resetGame() {
  clearTimeout(timerId);
  clearTimeout(countdownId);
  clearTimeout(overlayTimerId);
  clearTimeout(restartHintId);
  timerId = countdownId = overlayTimerId = restartHintId = null;
  hideCountdown();
  cancelAnimations();
  snakeLayer.classList.remove("crashed");

  mode = MODES[data.mode];
  refreshDaily();

  // Daily uses a seed made from today's date, so everyone gets the same rocks and apple order.
  const seed = mode.seeded ? hashString("snake-daily-" + todayString()) : (Math.random() * 4294967296) >>> 0;
  foodRandom = mulberry32(seed);
  bonusRandom = mulberry32(seed ^ 0x9e3779b9);
  rocks = mode.obstacles ? generateRocks(mulberry32(seed ^ 0x85ebca6b)) : [];
  rockSet = new Set(rocks.map(cellKey));
  foodOrder = shuffle(Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index), foodRandom);
  foodPointer = 0;

  snake = STARTING_SNAKE.map(segment => ({ ...segment }));
  direction = { ...START_DIRECTION };
  directionQueue = [];
  pendingGrowth = 0;
  growthEaten = 0;
  score = 0;
  level = mode.startLevel;
  effects = { ghost: 0, slow: 0, double: 0 };
  timeLeftMs = mode.timeMs;
  elapsedMs = 0;
  roundApples = 0;
  roundGhostPass = false;
  roundUnlocks = [];
  resuming = false;
  bonus = null;
  food = null;
  food = nextFoodCell();
  bestScore = bestFor(mode.id);
  bestAtRoundStart = bestScore;
  state = "ready";

  scoreElement.textContent = score;
  levelElement.textContent = level;
  bestScoreElement.textContent = bestScore;
  modeLabel.textContent = modeEyebrowOf(mode);
  boardWrap.dataset.mode = mode.id;
  Object.keys(hudCache).forEach(key => delete hudCache[key]);

  renderRocks();
  refreshModePicker();
  updateControls();
  showMessage(() => ({ kicker: t("ready.kicker"), title: t("ready.title"), text: t("ready.text", { keys: keysText().replace(/ /g, "") }) }), "ready");
  drawBoard();
  updateHud();
}

// Rocks for the Daily Challenge: small clusters, never in the start area, never sealing off any square.
function generateRocks(random) {
  const start = STARTING_SNAKE[0];
  const blocked = new Set();
  const inStartArea = (x, y) => x <= 13 && y >= 7 && y <= 13;
  const wanted = 10 + Math.floor(random() * 5);
  let clusters = 0;
  for (let attempt = 0; attempt < 400 && clusters < wanted; attempt += 1) {
    const cells = [];
    // Start inside the board (not on the edge) so rocks actually get in the way.
    let x = 1 + Math.floor(random() * (GRID_SIZE - 2));
    let y = 1 + Math.floor(random() * (GRID_SIZE - 2));
    const size = 2 + Math.floor(random() * 3);
    for (let i = 0; i < size; i += 1) {
      cells.push({ x, y });
      const step = [UP, DOWN, LEFT, RIGHT][Math.floor(random() * 4)];
      x += step.x;
      y += step.y;
      if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) break;
    }
    const trial = new Set(blocked);
    let valid = true;
    for (const cell of cells) {
      if (inStartArea(cell.x, cell.y) || trial.has(cellKey(cell))) { valid = false; break; }
      trial.add(cellKey(cell));
    }
    if (!valid || !allFreeCellsConnected(trial, start)) continue;
    cells.forEach(cell => blocked.add(cellKey(cell)));
    clusters += 1;
  }
  return [...blocked].sort((a, b) => a - b).map(cellAt);
}

function allFreeCellsConnected(blocked, start) {
  const seen = new Set([cellKey(start)]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.pop();
    for (const step of [UP, DOWN, LEFT, RIGHT]) {
      const next = { x: cell.x + step.x, y: cell.y + step.y };
      if (next.x < 0 || next.y < 0 || next.x >= GRID_SIZE || next.y >= GRID_SIZE) continue;
      const key = cellKey(next);
      if (blocked.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen.size === GRID_SIZE * GRID_SIZE - blocked.size;
}

function occupiedCells() {
  const taken = new Set(rockSet);
  snake.forEach(segment => taken.add(cellKey(segment)));
  if (food) taken.add(cellKey(food));
  if (bonus) taken.add(cellKey(bonus));
  return taken;
}

// Apples follow a pre-shuffled order, so a seeded round always shows the same apples in the same order.
function nextFoodCell() {
  const taken = occupiedCells();
  for (let i = 0; i < foodOrder.length; i += 1) {
    const index = foodOrder[(foodPointer + i) % foodOrder.length];
    if (!taken.has(index)) {
      foodPointer = (foodPointer + i + 1) % foodOrder.length;
      return cellAt(index);
    }
  }
  // Only a special food is left in the way: remove it and try once more.
  if (bonus) {
    bonus = null;
    return nextFoodCell();
  }
  return null;
}

function maybeSpawnBonus() {
  if (bonus || score < BONUS_MIN_SCORE || bonusRandom() > BONUS_CHANCE) return;
  const types = Object.keys(BONUS_TYPES).filter(type => !BONUS_TYPES[type].onlyModes || BONUS_TYPES[type].onlyModes.includes(mode.id));
  const totalWeight = types.reduce((sum, type) => sum + BONUS_TYPES[type].weight, 0);
  let roll = bonusRandom() * totalWeight;
  let chosen = types[0];
  for (const type of types) {
    roll -= BONUS_TYPES[type].weight;
    if (roll < 0) { chosen = type; break; }
  }
  const taken = occupiedCells();
  const free = [];
  for (let index = 0; index < GRID_SIZE * GRID_SIZE; index += 1) if (!taken.has(index)) free.push(index);
  if (!free.length) return;
  const cell = cellAt(free[Math.floor(bonusRandom() * free.length)]);
  bonus = { ...cell, type: chosen, remainingMs: BONUS_LIFETIME_MS };
}

/* ---------- 10. Game rules ---------- */
function beginRound() {
  if (state !== "ready") return;
  sound.unlock();
  bestAtRoundStart = bestScore;
  resuming = false;
  hideMessage();
  announce(t("say.ready", { mode: modeNameOf(mode) }));
  board.focus({ preventScroll: true });
  runCountdown(START_COUNTDOWN);
}

function resumeGame() {
  if (state !== "paused") return;
  sound.unlock();
  resuming = true;
  hideMessage();
  board.focus({ preventScroll: true });
  runCountdown(RESUME_COUNTDOWN);
}

function runCountdown(step) {
  state = "countdown";
  updateControls();
  if (step === 0) {
    startRunning();
    return;
  }
  showCountdown(String(step));
  sound.countdown();
  countdownId = setTimeout(() => runCountdown(step - 1), COUNTDOWN_STEP_MS);
}

function startRunning() {
  state = "running";
  updateControls();
  if (resuming) {
    resumeAnimations();
    resuming = false;
  }
  showCountdown("GO!", 450);
  sound.go();
  scheduleNextTick(true);
}

// Timing uses a self-correcting timeout instead of setInterval so the speed can change at any time.
function scheduleNextTick(isFirst = false) {
  const interval = stepIntervalMs();
  const now = performance.now();
  scheduledInterval = interval;
  nextTickAt = isFirst ? now + interval : nextTickAt + interval;
  // If the browser stalled, skip ahead instead of firing a burst of catch-up moves.
  if (nextTickAt < now) nextTickAt = now;
  timerId = setTimeout(gameLoop, Math.max(0, nextTickAt - now));
}

function gameLoop() {
  if (state !== "running") return;
  step();
  if (state === "running") scheduleNextTick();
}

function step() {
  const interval = scheduledInterval;
  const previousSnake = snake.map(segment => ({ ...segment }));
  direction = directionQueue.shift() || direction;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (mode.wrap) {
    head.x = (head.x + GRID_SIZE) % GRID_SIZE;
    head.y = (head.y + GRID_SIZE) % GRID_SIZE;
  } else if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
    endGame({ reason: "wall" });
    return;
  }
  if (rockSet.has(cellKey(head))) {
    endGame({ reason: "rock" });
    return;
  }

  const eatsFood = food !== null && head.x === food.x && head.y === food.y;
  const eatsBonus = bonus !== null && head.x === bonus.x && head.y === bonus.y;
  const gain = (eatsFood ? 1 : 0) + (eatsBonus && bonus.type === "golden" ? GOLDEN_GROWTH : 0);
  const willGrow = pendingGrowth + gain > 0;

  // Moving into the current tail is allowed when it will move away this turn.
  const bodyToCheck = willGrow ? snake : snake.slice(0, -1);
  if (bodyToCheck.some(segment => segment.x === head.x && segment.y === head.y)) {
    if (effects.ghost > 0) {
      roundGhostPass = true;   // Ghost lets the snake pass through itself
    } else {
      endGame({ reason: "self" });
      return;
    }
  }

  snake.unshift(head);
  pendingGrowth += gain;
  growthEaten += gain;
  if (pendingGrowth > 0) pendingGrowth -= 1;
  else snake.pop();
  elapsedMs += interval;

  let cue = null;
  stepLeveledUp = false;
  if (eatsFood) {
    handleApple({ ...food });
    cue = "eat";
  }
  if (eatsBonus) {
    handleBonus({ ...bonus });
    cue = "bonus";
  }
  if (stepLeveledUp) cue = "levelUp";
  if (cue === "eat") sound.eat(score);
  else if (cue === "bonus") sound.bonus();
  else if (cue === "levelUp") sound.levelUp();

  tickTimers(interval);
  if (roundGhostPass) checkAchievements(roundSummary());
  drawBoard(previousSnake, true);
  updateHud();

  // A missing food means every cell is filled: the board is cleared.
  if (!food) {
    endGame({ won: true });
  } else if (mode.timeMs && timeLeftMs <= 0) {
    endGame({ reason: "time" });
  }
}

function handleApple(position) {
  roundApples += 1;
  const gained = addScore(1);
  if (gained > 1) popText(position, `+${gained}`, "orange");
  food = nextFoodCell();
  playFoodCollectionEffect(position);
  if (food) popFood();
  maybeSpawnBonus();
  vibrate(VIBRATE_EAT_MS);
  announce(t("say.score", { score }));
  checkAchievements(roundSummary());
}

function handleBonus(eaten) {
  const info = BONUS_TYPES[eaten.type];
  bonus = null;
  data.stats.bonus += 1;
  if (eaten.type === "golden") {
    popText(eaten, `+${addScore(GOLDEN_POINTS)}`, "gold");
  } else if (eaten.type === "clock") {
    timeLeftMs += CLOCK_BONUS_MS;
    popText(eaten, "+5s", "white");
  } else {
    effects[info.effect] = Math.max(effects[info.effect], info.ms);
    popText(eaten, effectName(info.effect).toUpperCase(), EFFECTS[info.effect].tone);
  }
  playFoodCollectionEffect(eaten);
  vibrate(VIBRATE_BONUS_MS);
  announce(bonusName(eaten.type));
  saveData();
  checkAchievements(roundSummary());
}

function addScore(points) {
  const gained = points * (effects.double > 0 ? 2 : 1);
  score += gained;
  scoreElement.textContent = score;
  pulse(scoreElement.parentElement);
  updateBestScore();
  const newLevel = levelForScore(score);
  if (newLevel > level) {
    level = newLevel;
    levelElement.textContent = level;
    pulse(levelElement.parentElement);
    stepLeveledUp = true;
    announce(t("say.level", { level, score }));
  }
  return gained;
}

// Effects, the clock and the special food's life all count down in game time, so pausing freezes them.
function tickTimers(interval) {
  Object.keys(effects).forEach(key => {
    if (effects[key] > 0) effects[key] = Math.max(0, effects[key] - interval);
  });
  if (bonus) {
    bonus.remainingMs -= interval;
    if (bonus.remainingMs <= 0) bonus = null;
  }
  if (mode.timeMs) {
    const before = Math.ceil(timeLeftMs / 1000);
    timeLeftMs = Math.max(0, timeLeftMs - interval);
    const after = Math.ceil(timeLeftMs / 1000);
    if (after !== before && after <= 5 && after > 0) sound.tick();
  }
}

function setDirection(newDirection) {
  // Compare to the last queued turn, or current heading when the queue is empty.
  const lastDirection = directionQueue.length ? directionQueue[directionQueue.length - 1] : direction;
  if (isSame(newDirection, lastDirection) || isOpposite(newDirection, lastDirection)) return;
  if (directionQueue.length >= MAX_QUEUED_TURNS) return;
  directionQueue.push({ ...newDirection });
}

function pauseGame() {
  if (state === "countdown") {
    // Leaving during a fresh 3-2-1 returns to the ready screen; during a resume 2-1 it stays paused.
    if (!resuming) {
      resetGame();
      return;
    }
    clearTimeout(countdownId);
  } else if (state !== "running") {
    return;
  }
  clearTimeout(timerId);
  timerId = null;
  hideCountdown();
  resuming = false;
  state = "paused";
  pauseAnimations();
  updateControls();
  showMessage(() => ({ kicker: t("paused.kicker"), title: t("paused.title"), text: t("paused.text") }), "paused");
  announce(t("say.paused"));
}

function togglePause() {
  if (state === "running") pauseGame();
  else if (state === "paused") resumeGame();
}

function endGame({ won = false, reason = "" } = {}) {
  clearTimeout(timerId);
  timerId = null;
  cancelAnimations();
  hideCountdown();
  state = "over";
  gameOverAt = performance.now();
  const outcome = won ? "won" : reason || "wall";

  const newBest = score > bestAtRoundStart;
  data.games += 1;
  data.apples += roundApples;
  data.stats.longest = Math.max(data.stats.longest, snake.length);
  data.stats.seconds += Math.round(elapsedMs / 1000);
  if (won) data.stats.wins += 1;
  if (mode.id === "daily") data.daily.plays += 1;
  data.bests[mode.id] = bestScore;
  checkAchievements({ ...roundSummary(), won });
  saveData();

  updateControls();
  updateHud();
  drawBoard();
  if (won) {
    sound.win();
  } else {
    snakeLayer.classList.add("crashed");
    shakeBoard();
    sound.gameOver();
    vibrate(VIBRATE_CRASH_MS);
  }

  lastEndSummary = { score, level, outcome, newBest };
  // The result is rebuilt from these saved values, so it can change language while it is on screen.
  const result = { score, games: data.games, best: bestScore, unlocks: [...roundUnlocks], modeItem: mode };
  const showResult = () => {
    showMessage(() => {
      const goalMet = result.modeItem.id === "daily" ? result.score >= DAILY_GOAL : false;
      const goalText = result.modeItem.id === "daily" ? t("over.goal", { goal: DAILY_GOAL, check: goalMet ? " ✓" : "" }) : "";
      return {
        kicker: won ? t("over.win") : outcome === "time" ? t("over.timeup") : t("over.gameover"),
        title: won ? t("over.titleWin") : newBest ? t("over.titleBest") : outcome === "time" ? t("over.titleTime") : t("over.titleTry"),
        text: t(`end.${outcome}`) + goalText,
        scoreText: t("over.score", { score: result.score }),
        statsText: t("over.stats", { mode: modeNameOf(result.modeItem), best: result.best, games: result.games }),
        unlockText: result.unlocks.length
          ? t("over.unlocked", { list: result.unlocks.map(id => t("over.skin", { name: skinName(SKINS.find(item => item.id === id)) })).join(", ") })
          : ""
      };
    }, "over");
    announce(t(won ? "say.win" : "say.over", { score: result.score }) + (newBest ? t("say.best") : ""));
  };
  overlayTimerId = setTimeout(showResult, motionPreference.matches || won ? 0 : CRASH_PAUSE_MS);
  restartHintId = setTimeout(() => { if (state === "over") restartHint.hidden = false; }, GAME_OVER_LOCK_MS);
}

function canRestart() {
  return performance.now() - gameOverAt >= GAME_OVER_LOCK_MS;
}

function updateBestScore() {
  if (score > bestScore) {
    bestScore = score;
    bestScoreElement.textContent = bestScore;
    data.bests[mode.id] = bestScore;
    saveData();
  }
}

function setMode(id) {
  if (!MODES[id] || menuOpen) return;
  data.mode = id;
  saveData();
  resetGame();
}

/* ---------- 11. Trophies ---------- */
const roundSummary = () => ({ score, level, mode: mode.id, length: snake.length, ghostPass: roundGhostPass, won: false });
const isSkinUnlocked = skin => !skin.unlock || data.unlocked.includes(skin.unlock);

function checkAchievements(summary) {
  ACHIEVEMENTS.forEach(achievement => {
    if (data.unlocked.includes(achievement.id) || !achievement.test(summary)) return;
    data.unlocked.push(achievement.id);
    const skin = SKINS.find(item => item.unlock === achievement.id);
    if (skin) roundUnlocks.push(skin.id);
    saveData();
    showToast(t("toast.trophy"), skin ? t("toast.trophySkin", { name: trophyName(achievement), skin: skinName(skin) }) : trophyName(achievement));
    sound.achievement();
    announce(t("say.trophy", { name: trophyName(achievement) }));
  });
}

/* ---------- 12. Drawing ---------- */
function drawBoard(previousSnake = null, animateMovement = false) {
  if (food) {
    positionElement(foodElement, food);
    foodElement.hidden = false;
  } else {
    foodElement.hidden = true;
  }

  if (bonus) {
    positionElement(bonusElement, bonus);
    bonusElement.className = `bonus bonus-${bonus.type}${bonus.remainingMs <= BONUS_WARNING_MS ? " expiring" : ""}`;
    bonusElement.hidden = false;
  } else {
    bonusElement.hidden = true;
  }

  while (segmentElements.length < snake.length) {
    const segment = document.createElement("div");
    segment.className = "snake-segment";
    snakeLayer.appendChild(segment);
    segmentElements.push(segment);
  }

  while (segmentElements.length > snake.length) {
    const segment = segmentElements.pop();
    movementAnimations.get(segment)?.cancel();
    movementAnimations.delete(segment);
    segment.remove();
  }

  // Sliding takes exactly one step, so motion looks continuous at every speed.
  const slideMs = stepIntervalMs();

  segmentElements.forEach((element, index) => {
    const target = snake[index];
    // Existing segment elements keep their own previous position as the animation start.
    // A new tail has no prior element, so it appears at the old tail's current position.
    const previous = previousSnake
      ? previousSnake[index] || (index === previousSnake.length ? target : null)
      : null;
    // A jump of more than one cell is a wrap-around: show it instantly instead of sliding across the board.
    const distance = previous ? Math.abs(previous.x - target.x) + Math.abs(previous.y - target.y) : 0;
    const hasMoved = previous && distance > 0 && distance <= 1;
    element.classList.toggle("snake-head", index === 0);
    paintSegment(element, index);

    movementAnimations.get(element)?.cancel();
    movementAnimations.delete(element);

    if (animateMovement && !motionPreference.matches && hasMoved) {
      const fromLeft = `${previous.x * 100 / GRID_SIZE}%`;
      const fromTop = `${previous.y * 100 / GRID_SIZE}%`;
      const toLeft = `${target.x * 100 / GRID_SIZE}%`;
      const toTop = `${target.y * 100 / GRID_SIZE}%`;

      // Collision checks use snake[]; this animation only changes the visual position.
      element.style.left = fromLeft;
      element.style.top = fromTop;
      const animation = element.animate(
        [{ left: fromLeft, top: fromTop }, { left: toLeft, top: toTop }],
        { duration: slideMs, easing: "linear", fill: "forwards" }
      );
      element.style.left = toLeft;
      element.style.top = toTop;
      movementAnimations.set(element, animation);
    } else {
      positionElement(element, target);
    }
  });
}

function positionElement(element, position) {
  element.style.left = `${position.x * 100 / GRID_SIZE}%`;
  element.style.top = `${position.y * 100 / GRID_SIZE}%`;
}

// Most skins are plain CSS colours; Rainbow colours every segment by its place in the snake.
function paintSegment(element, index) {
  if (data.skin === "rainbow" && data.theme !== "lcd") {
    const hue = (index * 24) % 360;
    element.style.background = index === 0 ? `hsl(${hue} 95% 84%)` : `hsl(${hue} 85% 60%)`;
    element.style.boxShadow = `0 0 9px hsl(${hue} 90% 60% / 0.45)`;
  } else if (element.style.background) {
    element.style.background = "";
    element.style.boxShadow = "";
  }
}

function applySkin() {
  snakeLayer.dataset.skin = data.skin;
  segmentElements.forEach(paintSegment);
}

function renderRocks() {
  rockLayer.textContent = "";
  rocks.forEach(position => {
    const rock = el("div", "rock");
    positionElement(rock, position);
    rockLayer.appendChild(rock);
  });
}

function playFoodCollectionEffect(position) {
  if (motionPreference.matches) return;
  foodEffectAnimation?.cancel();
  positionElement(foodEffectElement, position);
  foodEffectAnimation = foodEffectElement.animate(
    [
      { transform: "scale(0.55)", opacity: 0.9 },
      { transform: "scale(1.8)", opacity: 0 }
    ],
    { duration: 300, easing: "ease-out", fill: "forwards" }
  );
  const currentAnimation = foodEffectAnimation;
  currentAnimation.onfinish = () => {
    if (foodEffectAnimation === currentAnimation) {
      currentAnimation.cancel();
      foodEffectAnimation = null;
    }
  };
}

// New food grows in so the eye can find it quickly.
function popFood() {
  if (motionPreference.matches) return;
  foodElement.animate(
    [{ transform: "scale(0.2)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
    { duration: 240, easing: "ease-out" }
  );
}

function pulse(element) {
  if (motionPreference.matches) return;
  element.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }],
    { duration: 280, easing: "ease-out" }
  );
}

function shakeBoard() {
  if (motionPreference.matches || !data.shake) return;
  boardWrap.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: "translate(-6px, 2px)" },
      { transform: "translate(5px, -2px)" },
      { transform: "translate(-3px, 1px)" },
      { transform: "translate(0, 0)" }
    ],
    { duration: 300, easing: "ease-out" }
  );
}

// A short floating label ("+3", "GHOST", "+5s") where something was picked up.
function popText(position, text, tone) {
  if (motionPreference.matches) return;
  const label = el("div", `float-text ${tone}`, text);
  positionElement(label, position);
  floatLayer.appendChild(label);
  const animation = label.animate(
    [{ transform: "translate(-25%, -35%)", opacity: 1 }, { transform: "translate(-25%, -175%)", opacity: 0 }],
    { duration: 850, easing: "ease-out" }
  );
  animation.onfinish = () => label.remove();
}

function showCountdown(text, hideAfterMs = null) {
  clearTimeout(countdownHideId);
  countdownAnimation?.cancel();
  countdownElement.textContent = text;
  countdownElement.hidden = false;
  if (!motionPreference.matches) {
    countdownAnimation = countdownElement.animate(
      [
        { opacity: 0, transform: "scale(1.5)" },
        { opacity: 1, transform: "scale(1)", offset: 0.28 },
        { opacity: 0.85, transform: "scale(0.96)", offset: 0.8 },
        { opacity: 0, transform: "scale(0.9)" }
      ],
      { duration: hideAfterMs || COUNTDOWN_STEP_MS, easing: "ease-out", fill: "forwards" }
    );
  }
  if (hideAfterMs) countdownHideId = setTimeout(hideCountdown, hideAfterMs);
}

function hideCountdown() {
  clearTimeout(countdownHideId);
  countdownAnimation?.cancel();
  countdownAnimation = null;
  countdownElement.hidden = true;
}

function pauseAnimations() {
  movementAnimations.forEach(animation => {
    if (animation.playState === "running" || animation.playState === "pending") animation.pause();
  });
  if (foodEffectAnimation && (foodEffectAnimation.playState === "running" || foodEffectAnimation.playState === "pending")) {
    foodEffectAnimation.pause();
  }
}

function resumeAnimations() {
  movementAnimations.forEach(animation => {
    if (animation.playState === "paused") animation.play();
  });
  if (foodEffectAnimation?.playState === "paused") foodEffectAnimation.play();
}

function cancelAnimations() {
  movementAnimations.forEach(animation => animation.cancel());
  movementAnimations.clear();
  foodEffectAnimation?.cancel();
  foodEffectAnimation = null;
}

// Effect badges, the Time Attack clock and the board tints.
function buildHud() {
  Object.keys(EFFECTS).forEach(key => {
    const pill = el("span", `pill pill-${key}`);
    pill.hidden = true;
    const value = el("b");
    const label = document.createTextNode(effectName(key));
    pill.append(label, value);
    effectsBar.appendChild(pill);
    effectPills[key] = { root: pill, value, label };
  });
}

function updateHud() {
  Object.keys(EFFECTS).forEach(key => {
    const seconds = Math.ceil(effects[key] / 1000);
    if (hudCache[key] === seconds) return;
    hudCache[key] = seconds;
    effectPills[key].root.hidden = seconds <= 0;
    effectPills[key].value.textContent = `${seconds}s`;
  });
  snakeLayer.classList.toggle("ghost", effects.ghost > 0);
  snakeLayer.classList.toggle("double", effects.double > 0);
  boardWrap.classList.toggle("slow", effects.slow > 0);

  clockElement.hidden = !mode.timeMs;
  if (mode.timeMs) {
    const text = formatClock(timeLeftMs);
    if (hudCache.clock !== text) {
      hudCache.clock = text;
      clockElement.textContent = text;
    }
    clockElement.classList.toggle("low", timeLeftMs <= 10000 && state !== "ready");
  }
}

// `builder` returns the texts, so the message can be written again when the language changes.
let messageBuilder = null;

function showMessage(builder, view = "paused") {
  messageBuilder = builder;
  overlay.dataset.view = view;
  renderMessage();
  overlay.classList.remove("hidden");
}

function renderMessage() {
  if (!messageBuilder) return;
  const { kicker, title, text, scoreText = "", statsText = "", unlockText = "" } = messageBuilder();
  messageKicker.textContent = kicker;
  messageTitle.textContent = title;
  messageText.textContent = text;
  finalScore.hidden = !scoreText;
  finalScore.textContent = scoreText;
  statsLine.hidden = !statsText;
  statsLine.textContent = statsText;
  unlockLine.hidden = !unlockText;
  unlockLine.textContent = unlockText;
  // The "play again" hint only appears once restarting is allowed (see canRestart).
  restartHint.hidden = !(state === "over" && canRestart());
  shareButton.textContent = t("share.button");
}

function hideMessage() {
  clearTimeout(overlayTimerId);
  overlay.classList.add("hidden");
}

function updateControls() {
  startButton.textContent = t(state === "over" ? "btn.again" : "btn.start");
  startButton.disabled = !(state === "ready" || state === "over");
  pauseButton.textContent = t(state === "paused" ? "btn.resume" : "btn.pause");
  pauseButton.disabled = !(state === "running" || state === "paused");
  refreshQuickToggles();
}

function refreshModePicker() {
  modePicker.querySelectorAll(".chip").forEach(chip => {
    chip.setAttribute("aria-checked", String(chip.dataset.mode === mode.id));
    chip.textContent = modeShortOf(MODES[chip.dataset.mode]);
  });
  modeHint.textContent = modeHintOf(mode);
}

function buildModePicker() {
  Object.values(MODES).forEach(item => {
    const chip = el("button", "chip", modeShortOf(item));
    chip.type = "button";
    chip.dataset.mode = item.id;
    chip.setAttribute("role", "radio");
    chip.addEventListener("click", () => setMode(item.id));
    modePicker.appendChild(chip);
  });
}

const dpadVisible = () => (data.dpad === null
  ? Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
  : data.dpad);

function applyDpad() {
  document.documentElement.classList.toggle("dpad-on", dpadVisible());
  refreshQuickToggles();
}

function refreshQuickToggles() {
  quickSound.setAttribute("aria-pressed", String(data.sound));
  quickSound.textContent = t(data.sound ? "quick.soundOn" : "quick.soundOff");
  quickDpad.setAttribute("aria-pressed", String(dpadVisible()));
  quickDpad.textContent = t(dpadVisible() ? "quick.dpadOn" : "quick.dpadOff");
  quickFullscreen.hidden = !fullscreenSupported;
  quickFullscreen.setAttribute("aria-pressed", String(isFullscreen()));
  quickFullscreen.textContent = t(isFullscreen() ? "btn.exitFullscreen" : "btn.fullscreen");
}

function toggleSound() {
  data.sound = !data.sound;
  saveData();
  refreshQuickToggles();
  if (data.sound) {
    sound.unlock();
    sound.eat(1);
  }
  announce(t(data.sound ? "say.soundOn" : "say.soundOff"));
}

function toggleDpad() {
  data.dpad = !dpadVisible();
  saveData();
  applyDpad();
}

// Trophy toasts queue up so two unlocks at once are both seen.
function showToast(title, text) {
  toastQueue.push({ title, text });
  if (!toastTimerId) nextToast();
}

function nextToast() {
  const item = toastQueue.shift();
  if (!item) {
    toastTimerId = null;
    toastElement.hidden = true;
    return;
  }
  toastElement.textContent = "";
  toastElement.append(el("strong", "", item.title), el("span", "", item.text));
  toastElement.hidden = false;
  if (!motionPreference.matches) {
    toastElement.animate(
      [{ opacity: 0, transform: "translate(-50%, -12px)" }, { opacity: 1, transform: "translate(-50%, 0)" }],
      { duration: 220, easing: "ease-out" }
    );
  }
  toastTimerId = setTimeout(nextToast, 2800);
}

// Screen readers hear short status updates; the visual UI is unchanged.
function announce(text) {
  srStatus.textContent = text;
}

async function shareResult() {
  if (!lastEndSummary) return;
  const link = /^https?:$/.test(location.protocol) ? `${location.origin}${location.pathname}` : "";
  const dayText = mode.id === "daily" ? ` ${todayString()}` : "";
  const text = [
    `Snake · ${modeNameOf(mode)}${dayText}`,
    t("share.line", { score: lastEndSummary.score, level: lastEndSummary.level }) + (mode.id === "daily" && lastEndSummary.score >= DAILY_GOAL ? t("share.goal") : ""),
    link
  ].filter(Boolean).join("\n");
  try {
    const touchDevice = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (navigator.share && touchDevice) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    shareButton.textContent = t("share.copied");
  } catch (error) {
    if (error && error.name === "AbortError") return;
    // Clipboard blocked: show the text so it can be copied by hand.
    statsLine.hidden = false;
    statsLine.textContent = text.replace(/\n/g, " · ");
  }
}

// ---- Look, language and full screen ----
function applyTheme() {
  document.documentElement.dataset.look = data.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = data.theme === "lcd" ? "#181c17" : "#0f172a";
  segmentElements.forEach(paintSegment);
}

function applyDisplayPrefs() {
  board.classList.toggle("no-grid", !data.grid);
  document.documentElement.classList.toggle("hc", data.contrast);
}

// The steering keys are physical, so AZERTY keyboards (Z Q S D) need different labels than QWERTY (W A S D).
function defaultKeyLabels() {
  return lang === "fr"
    ? { KeyW: "Z", KeyA: "Q", KeyS: "S", KeyD: "D" }
    : { KeyW: "W", KeyA: "A", KeyS: "S", KeyD: "D" };
}
let layoutKnown = false;
const keysText = () => WASD_CODES.map(code => keyLabels[code]).join(" ");

function applyKeyLabels() {
  document.querySelectorAll("kbd[data-key]").forEach(key => { key.textContent = keyLabels[key.dataset.key]; });
  applyStaticText();
  if (state === "ready") renderMessage();
  if (menuOpen && activeTab === "settings") selectTab("settings", false, true);
}

function learnKeyLabel(event) {
  if (!WASD_CODES.includes(event.code) || !/^[a-z]$/i.test(event.key || "")) return;
  const label = event.key.toUpperCase();
  if (keyLabels[event.code] === label) return;
  keyLabels[event.code] = label;
  layoutKnown = true;
  applyKeyLabels();
}

// Chrome can tell us the real layout before the first key press.
try {
  navigator.keyboard?.getLayoutMap?.().then(map => {
    const found = {};
    for (const code of WASD_CODES) {
      const letter = map.get(code);
      if (!letter || !/^[a-z]$/i.test(letter)) return;
      found[code] = letter.toUpperCase();
    }
    keyLabels = found;
    layoutKnown = true;
    applyKeyLabels();
  }).catch(() => { /* not allowed here: keep the guess */ });
} catch (error) { /* not supported */ }

function applyStaticText() {
  document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach(node => { node.setAttribute("aria-label", t(node.dataset.i18nAria, { keys: keysText() })); });
  document.querySelectorAll("[data-i18n-title]").forEach(node => { node.title = t(node.dataset.i18nTitle); });
}

function applyLanguage() {
  lang = data.lang;
  document.documentElement.lang = lang;
  if (!layoutKnown) keyLabels = defaultKeyLabels();
  document.querySelectorAll("kbd[data-key]").forEach(key => { key.textContent = keyLabels[key.dataset.key]; });
  applyStaticText();
  Object.entries(effectPills).forEach(([key, pill]) => { pill.label.nodeValue = effectName(key); });
  MENU_TABS.forEach(tab => {
    const button = document.getElementById(`tab-${tab.id}`);
    if (button) button.textContent = t(tab.key);
  });
  modeLabel.textContent = modeEyebrowOf(mode);
  refreshModePicker();
  updateControls();
  renderMessage();
  refreshFullscreenUi();
  if (menuOpen) selectTab(activeTab, false, true);
}

function setLanguage(id) {
  if (!LANGUAGES.some(item => item.id === id) || data.lang === id) return;
  data.lang = id;
  saveData();
  applyLanguage();
  announce(t("say.language", { name: LANGUAGES.find(item => item.id === id).name }));
}

const fullscreenSupported = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFullscreen = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);

async function toggleFullscreen() {
  const root = document.documentElement;
  try {
    if (!fullscreenSupported) throw new Error("unsupported");
    if (isFullscreen()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  } catch (error) {
    showToast(t("toast.notice"), t("toast.noFullscreen"));
  }
}

function refreshFullscreenUi() {
  const on = isFullscreen();
  document.documentElement.classList.toggle("is-fullscreen", on);
  const label = t(on ? "btn.exitFullscreen" : "btn.fullscreen");
  fullscreenButton.hidden = !fullscreenSupported;
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.setAttribute("aria-pressed", String(on));
  fullscreenButton.title = label;
  const settingsButton = document.getElementById("set-fullscreen");
  if (settingsButton) settingsButton.textContent = t(on ? "set.fullscreenExit" : "set.fullscreenEnter");
  refreshQuickToggles();
}

document.addEventListener("fullscreenchange", refreshFullscreenUi);
document.addEventListener("webkitfullscreenchange", refreshFullscreenUi);

/* ---------- 13. Menu ---------- */
const MENU_TABS = [
  { id: "skins", key: "tab.skins", render: renderSkins },
  { id: "trophies", key: "tab.trophies", render: renderTrophies },
  { id: "stats", key: "tab.stats", render: renderStats },
  { id: "settings", key: "tab.settings", render: renderSettings }
];
let activeTab = "skins";
let resetArmed = false;

function buildMenuTabs() {
  MENU_TABS.forEach(tab => {
    const button = el("button", "menu-tab", t(tab.key));
    button.type = "button";
    button.id = `tab-${tab.id}`;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => selectTab(tab.id));
    menuTabs.appendChild(button);
  });
}

function selectTab(id, focus = false, keepScroll = false) {
  const scrollTop = keepScroll ? menuBody.scrollTop : 0;
  activeTab = id;
  resetArmed = false;
  menuTabs.querySelectorAll(".menu-tab").forEach(button => {
    const selected = button.id === `tab-${id}`;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  });
  menuBody.setAttribute("aria-labelledby", `tab-${id}`);
  menuBody.textContent = "";
  MENU_TABS.find(tab => tab.id === id).render(menuBody);
  menuBody.scrollTop = scrollTop;
}

function setInert(on) {
  [header, controls, dpad, helpText, board, overlay].forEach(element => { element.inert = on; });
}

function openMenu(tab = activeTab) {
  if (menuOpen) return;
  if (state === "running" || state === "countdown") pauseGame();
  menuOpen = true;
  menu.hidden = false;
  setInert(true);
  selectTab(tab, true);
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menu.hidden = true;
  setInert(false);
  menuButton.focus({ preventScroll: true });
}

function renderSkins(body) {
  body.append(el("h3", "set-group", t("style.theme")));
  const themeGrid = el("div", "skin-grid");
  THEMES.forEach(id => {
    const card = el("button", "skin-card");
    card.type = "button";
    card.setAttribute("aria-pressed", String(data.theme === id));
    const preview = el("span", "theme-preview");
    preview.dataset.look = id;
    preview.append(el("i"), el("i"), el("i"), el("b"));
    card.append(preview, el("span", "skin-name", t(`theme.${id}`)), el("span", "skin-note", t(`theme.${id}.note`)));
    card.addEventListener("click", () => {
      if (data.theme === id) return;
      data.theme = id;
      saveData();
      applyTheme();
      announce(t("say.theme", { name: t(`theme.${id}`) }));
      selectTab("skins", false, true);
      menuBody.querySelectorAll(".theme-grid .skin-card")[THEMES.indexOf(id)]?.focus();
    });
    themeGrid.appendChild(card);
  });
  themeGrid.classList.add("theme-grid");
  body.appendChild(themeGrid);

  body.append(el("h3", "set-group", t("style.skin")));
  const unlockedCount = SKINS.filter(isSkinUnlocked).length;
  body.append(el("p", "menu-note", t("skins.count", { n: unlockedCount, total: SKINS.length })));
  if (data.theme === "lcd") body.append(el("p", "menu-note", t("style.skinLcd")));
  const grid = el("div", "skin-grid");
  SKINS.forEach(skin => {
    const unlocked = isSkinUnlocked(skin);
    const card = el("button", `skin-card${unlocked ? "" : " locked"}`);
    card.type = "button";
    card.setAttribute("aria-pressed", String(data.skin === skin.id));
    const preview = el("span", "skin-preview");
    preview.dataset.skin = skin.id;
    for (let i = 0; i < 5; i += 1) preview.appendChild(document.createElement("span"));
    const trophy = ACHIEVEMENTS.find(item => item.id === skin.unlock);
    card.append(
      preview,
      el("span", "skin-name", skinName(skin)),
      el("span", "skin-note", unlocked ? t(data.skin === skin.id ? "skin.inuse" : "skin.tap") : t("skin.locked", { text: trophyText(trophy) }))
    );
    card.addEventListener("click", () => {
      if (!unlocked) {
        announce(t("say.locked", { text: trophyText(trophy) }));
        return;
      }
      data.skin = skin.id;
      saveData();
      applySkin();
      selectTab("skins", false, true);
      menuBody.querySelectorAll(".skin-grid:not(.theme-grid) .skin-card")[SKINS.indexOf(skin)]?.focus();
    });
    grid.appendChild(card);
  });
  body.appendChild(grid);
}

function renderTrophies(body) {
  body.append(el("p", "menu-note", t("trophies.count", { n: data.unlocked.length, total: ACHIEVEMENTS.length })));
  ACHIEVEMENTS.forEach(achievement => {
    const done = data.unlocked.includes(achievement.id);
    const row = el("div", `trophy${done ? " done" : ""}`);
    const info = el("div");
    info.append(el("span", "trophy-name", trophyName(achievement)), el("span", "trophy-text", trophyText(achievement)));
    const skin = SKINS.find(item => item.unlock === achievement.id);
    if (skin) info.append(el("span", "trophy-reward", t("trophies.reward", { skin: skinName(skin) })));
    if (achievement.progress && !done) {
      const [value, target] = achievement.progress();
      const bar = el("span", "trophy-bar");
      const fill = document.createElement("i");
      fill.style.width = `${Math.min(100, Math.round(value / target * 100))}%`;
      bar.appendChild(fill);
      info.append(el("span", "trophy-text", `${Math.min(value, target)} / ${target}`), bar);
    }
    row.append(el("span", "trophy-icon", done ? "✓" : "•"), info);
    body.appendChild(row);
  });
}

function renderStats(body) {
  refreshDaily();
  const tiles = [
    [t("stat.games"), data.games],
    [t("stat.apples"), data.apples],
    [t("stat.bestClassic"), data.bests.classic],
    [t("stat.bestTime"), data.bests.time],
    [t("stat.bestDaily", { date: data.daily.date.slice(5) }), data.bests.daily],
    [t("stat.longest"), data.stats.longest || STARTING_SNAKE.length],
    [t("stat.special"), data.stats.bonus],
    [t("stat.time"), formatDuration(data.stats.seconds)],
    [t("stat.boards"), data.stats.wins],
    [t("stat.trophies"), `${data.unlocked.length} / ${ACHIEVEMENTS.length}`]
  ];
  const grid = el("div", "stat-grid");
  tiles.forEach(([label, value]) => {
    const tile = el("div", "stat");
    tile.append(el("span", "", label), el("strong", "", String(value)));
    grid.appendChild(tile);
  });
  body.appendChild(grid);
}

function renderSettings(body) {
  const group = key => body.appendChild(el("h3", "set-group", t(key)));
  const row = (label, note, control) => {
    const line = el("div", "setting");
    const text = el("span", "setting-label", label);
    if (note) text.appendChild(el("small", "", note));
    line.append(text, control);
    body.appendChild(line);
  };
  const toggle = (isOn, onClick) => {
    const button = el("button", "chip-button", isOn() ? t("on") : t("off"));
    button.type = "button";
    button.setAttribute("aria-pressed", String(isOn()));
    button.addEventListener("click", () => {
      onClick();
      button.textContent = isOn() ? t("on") : t("off");
      button.setAttribute("aria-pressed", String(isOn()));
    });
    return button;
  };
  const preference = (name, after) => toggle(() => data[name], () => {
    data[name] = !data[name];
    saveData();
    if (after) after();
  });
  const segmented = (name, label, options, current, onPick) => {
    const box = el("div", "segmented");
    box.dataset.seg = name;
    box.setAttribute("role", "radiogroup");
    box.setAttribute("aria-label", label);
    options.forEach(([id, text]) => {
      const button = el("button", "chip-button", text);
      button.type = "button";
      button.dataset.id = id;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(current() === id));
      button.addEventListener("click", () => {
        onPick(id);
        box.querySelectorAll("button").forEach(other => other.setAttribute("aria-checked", String(other === button)));
      });
      box.appendChild(button);
    });
    return box;
  };

  group("set.group.game");
  row(t("set.speed"), t("set.speed.note"),
    segmented("speed", t("set.speed"), SPEEDS.map(id => [id, t(`speed.${id}`)]), () => data.speed, id => { data.speed = id; saveData(); }));
  row(t("set.blur"), t("set.blur.note"), preference("blurPause"));

  group("set.group.sound");
  row(t("set.sound"), t("set.sound.note"), toggle(() => data.sound, toggleSound));
  const volume = el("input", "slider");
  volume.type = "range";
  volume.min = "0";
  volume.max = "100";
  volume.step = "5";
  volume.value = String(data.volume);
  volume.id = "set-volume";
  volume.setAttribute("aria-label", t("set.volume"));
  const volumeValue = el("output", "slider-value", `${data.volume}%`);
  volume.addEventListener("input", () => {
    data.volume = Number(volume.value);
    volumeValue.textContent = `${data.volume}%`;
  });
  volume.addEventListener("change", () => {
    saveData();
    sound.unlock();
    sound.eat(1);   // a sample beep, so the new loudness can be heard
  });
  const volumeBox = el("div", "slider-box");
  volumeBox.append(volume, volumeValue);
  row(t("set.volume"), "", volumeBox);
  row(t("set.shake"), t("set.shake.note"), preference("shake"));
  if (typeof navigator.vibrate === "function") {
    row(t("set.vibrate"), t("set.vibrate.note"), preference("vibrate", () => vibrate(VIBRATE_BONUS_MS)));
  }

  group("set.group.display");
  row(t("set.language"), "", segmented("lang", t("set.language"), LANGUAGES.map(item => [item.id, item.name]), () => data.lang, setLanguage));
  if (fullscreenSupported) {
    const full = el("button", "chip-button", t(isFullscreen() ? "set.fullscreenExit" : "set.fullscreenEnter"));
    full.type = "button";
    full.id = "set-fullscreen";
    full.addEventListener("click", toggleFullscreen);
    row(t("set.fullscreen"), t("set.fullscreen.note"), full);
  } else {
    body.append(el("p", "menu-note", t("set.fullscreen.none")));
  }
  row(t("set.dpad"), t("set.dpad.note"), toggle(dpadVisible, toggleDpad));
  row(t("set.grid"), t("set.grid.note"), preference("grid", applyDisplayPrefs));
  row(t("set.contrast"), t("set.contrast.note"), preference("contrast", applyDisplayPrefs));

  body.appendChild(el("ul", "shortcut-list")).append(
    ...[
      t("key.steer", { keys: keysText() }),
      t("key.pause"),
      t("key.mute"),
      t("key.full"),
      t("key.mode"),
      t("key.enter")
    ].map(text => el("li", "", text))
  );

  const reset = el("button", "button button-danger", t("set.reset"));
  reset.type = "button";
  reset.addEventListener("click", () => {
    if (!resetArmed) {
      resetArmed = true;
      reset.textContent = t("set.reset.confirm");
      return;
    }
    resetProgress();
  });
  body.appendChild(reset);
}

// Settings (sound, language, theme, ...) survive a reset; scores, stats, trophies and the chosen skin do not.
const PREFERENCE_KEYS = ["sound", "volume", "shake", "vibrate", "grid", "contrast", "speed", "blurPause", "lang", "theme", "dpad"];

function resetProgress() {
  const kept = {};
  PREFERENCE_KEYS.forEach(key => { kept[key] = data[key]; });
  const fresh = loadFreshData();
  Object.keys(data).forEach(key => delete data[key]);
  Object.assign(data, fresh, kept);
  saveData();
  applySkin();
  applyDpad();
  closeMenu();
  resetGame();
  announce(t("say.reset"));
}

function detectLanguage() {
  try {
    const code = (navigator.languages && navigator.languages[0]) || navigator.language || "en";
    return /^fr/i.test(code) ? "fr" : "en";
  } catch (error) {
    return "en";
  }
}

function loadFreshData() {
  return {
    bests: { classic: 0, time: 0, daily: 0 },
    daily: { date: "", plays: 0 },
    games: 0, apples: 0, sound: true, dpad: null,
    volume: DEFAULT_VOLUME, shake: true, vibrate: true, grid: true, contrast: false, blurPause: true,
    speed: "normal", theme: "neon", lang: detectLanguage(),
    skin: "mint", mode: "classic", unlocked: [],
    stats: { bonus: 0, longest: 0, seconds: 0, wins: 0 }
  };
}

/* ---------- 14. Input ---------- */
function handleDirectionInput(newDirection) {
  if (menuOpen) return;
  switch (state) {
    case "ready":
    case "over":
      // A direction the snake cannot take (straight back into its body) does nothing.
      if (isOpposite(newDirection, START_DIRECTION)) return;
      if (state === "over") {
        if (!canRestart()) return;
        resetGame();
      }
      beginRound();
      setDirection(newDirection);
      break;
    case "countdown":
    case "running":
      setDirection(newDirection);
      break;
    default:
      break; // paused: ignore
  }
}

// Enter, Space, a tap on the message, etc.
function primaryAction() {
  if (menuOpen) return;
  if (state === "ready") {
    beginRound();
  } else if (state === "over") {
    if (!canRestart()) return;
    resetGame();
    beginRound();
  } else if (state === "paused") {
    resumeGame();
  }
}

function isEditable(target) {
  return Boolean(target && target.closest && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

document.addEventListener("keydown", event => {
  // Esc closes the Menu even while the volume slider has focus.
  if (menuOpen && event.code === "Escape") {
    event.preventDefault();
    closeMenu();
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey || isEditable(event.target)) return;
  const code = event.code || event.key;
  learnKeyLabel(event);

  if (code === "KeyF" && !event.repeat) {
    event.preventDefault();
    toggleFullscreen();
    return;
  }

  if (menuOpen) {
    if (code === "Escape") {
      event.preventDefault();
      closeMenu();
    }
    return;
  }

  const newDirection = KEY_TO_DIRECTION.get(code);
  if (newDirection) {
    // Arrow keys do nothing on a focused button, so steering always works.
    event.preventDefault();
    handleDirectionInput(newDirection);
    return;
  }

  if (event.repeat) return;
  if (code === "KeyM") {
    toggleSound();
    return;
  }
  if ((state === "ready" || state === "over") && /^Digit[123]$/.test(code)) {
    setMode(Object.keys(MODES)[Number(code.slice(5)) - 1]);
    return;
  }

  // Space and Enter keep their normal meaning on buttons and links.
  const onActivatable = event.target.closest && event.target.closest("button, a[href], summary, [role='button']");
  if ((code === "Space" || code === "Enter") && !onActivatable) {
    event.preventDefault();
    if (code === "Space" && (state === "running" || state === "paused")) togglePause();
    else primaryAction();
  } else if (code === "KeyP" || code === "Escape") {
    togglePause();
  }
});

// Pause automatically when the player looks away.
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(); });
// Losing window focus only pauses a game in progress; it never cancels a countdown.
window.addEventListener("blur", () => { if (data.blurPause && state === "running") pauseGame(); });

function handleMotionPreferenceChange(event) {
  if (!event.matches) return;
  cancelAnimations();
  drawBoard();
}

if (motionPreference.addEventListener) {
  motionPreference.addEventListener("change", handleMotionPreferenceChange);
} else if (motionPreference.addListener) {
  motionPreference.addListener(handleMotionPreferenceChange);
}

// Touch listens on the whole board area (including the message overlay) so swipes work on every screen.
boardWrap.addEventListener("touchstart", event => {
  if (menuOpen) return;
  const touch = event.changedTouches[0];
  touchOrigin = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

boardWrap.addEventListener("touchmove", event => {
  if (!touchOrigin || menuOpen) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchOrigin.x;
  const dy = touch.clientY - touchOrigin.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
  // Steer as soon as the finger has moved far enough, then allow another swipe in the same touch.
  touchOrigin = { x: touch.clientX, y: touch.clientY };
  handleDirectionInput(
    Math.abs(dx) > Math.abs(dy)
      ? { x: Math.sign(dx), y: 0 }
      : { x: 0, y: Math.sign(dy) }
  );
}, { passive: true });

const endTouch = () => { touchOrigin = null; };
boardWrap.addEventListener("touchend", endTouch, { passive: true });
boardWrap.addEventListener("touchcancel", endTouch, { passive: true });

// On-screen D-pad: pointerdown reacts instantly, with no waiting for a tap to finish.
dpad.addEventListener("pointerdown", event => {
  const button = event.target.closest("[data-dir]");
  if (!button) return;
  event.preventDefault();
  handleDirectionInput(DPAD_DIRECTIONS[button.dataset.dir]);
});
dpad.addEventListener("click", event => {
  // Mouse and touch are handled by pointerdown; this only covers keyboard activation.
  const button = event.target.closest("[data-dir]");
  if (button && event.detail === 0) handleDirectionInput(DPAD_DIRECTIONS[button.dataset.dir]);
});

// Click or tap on the message (but not on its buttons) to continue.
overlay.addEventListener("click", event => {
  if (event.target.closest("button")) return;
  primaryAction();
});

startButton.addEventListener("click", () => {
  if (state === "over") resetGame();
  beginRound();
});
pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", () => {
  resetGame();
  board.focus({ preventScroll: true });
});
menuButton.addEventListener("click", () => openMenu());
menuClose.addEventListener("click", closeMenu);
quickSound.addEventListener("click", toggleSound);
quickDpad.addEventListener("click", toggleDpad);
quickFullscreen.addEventListener("click", toggleFullscreen);
fullscreenButton.addEventListener("click", toggleFullscreen);
shareButton.addEventListener("click", shareResult);

menuTabs.addEventListener("keydown", event => {
  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  event.preventDefault();
  const index = MENU_TABS.findIndex(tab => tab.id === activeTab);
  selectTab(MENU_TABS[(index + step + MENU_TABS.length) % MENU_TABS.length].id, true);
});

/* ---------- Start ---------- */
buildHud();
buildModePicker();
buildMenuTabs();
applyTheme();
applyDisplayPrefs();
applySkin();
applyDpad();
applyLanguage();
resetGame();
