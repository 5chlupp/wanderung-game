// Minimaler Game-Loop mit responsivem Canvas und einfachem Parallax-Hintergrund

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const actionButton = document.getElementById('actionButton');
const busButton = document.getElementById('busButton');
const pauseButton = document.getElementById('pauseButton');
const orientationHint = document.getElementById('orientationHint');
const debugEl = document.getElementById('debug');

// Grafiken laden
const runnerImage = new Image();
runnerImage.src = './images/punk.png';
const busImage = new Image();
busImage.src = './images/bus.png';
const pauseImage = new Image();
pauseImage.src = './images/pause.png';
const ferryImage = new Image();
ferryImage.src = './images/ferry.png';

// Audio laden
const backgroundMusic = new Audio('./audio/hintergrund.mp3');
const busSound = new Audio('./audio/bus-sound-k.m4a');
const waterSound = new Audio('./audio/water-sound.mp3');
const childLaughterWaterSound = new Audio('./audio/child-laughter-water sound.mp3');
const ferrySound = new Audio('./audio/ferry-sound.mp3');

// Audio-Einstellungen
backgroundMusic.loop = true;
busSound.loop = true;
waterSound.loop = true;
childLaughterWaterSound.loop = true;
ferrySound.loop = true;

// Spielfigur-Status
let isBusMode = false;
let isPaused = false;

// Welt/Viewport
const baseWidth = 1920; // Referenzbreite für Layout
const baseHeight = 1080; // Referenzhöhe
let devicePixelRatioClamped = 1;

// Zeit
let lastTime = 0;

// Kamera
let cameraX = 0;
let runnerWorldX = 0; // tatsächliche Weltposition der Spielfigur auf der X-Achse
let runnerSpeed = 180; // Laufen, px/s relativ zur Basisauflösung
let swimSpeed = 140; // Schwimmen etwas langsamer

// Runner-State
const RunnerState = {
  Running: 'running',
  Swimming: 'swimming',
  OnFerry: 'on_ferry'
};
let runnerState = RunnerState.Running;
let activeRiverIndex = -1; // Index des Flusses, wenn schwimmend/auf Fähre

// Parallax-Layer (hellere, sichtbare Farben)
const layers = [
  { speed: 0.15, color: '#6aa2d8' }, // ferne Berge
  { speed: 0.3, color: '#4d86c5' },  // mittlere Berge
  { speed: 0.6, color: '#326fb5' }   // nahe Hügel
];

// Level: unendlich viele Flüsse
let rivers = [
  { x: 1400, width: 460 },
  { x: 3000, width: 560 },
  { x: 4700, width: 640 },
  { x: 6500, width: 720 }
];

// Fähren pro Fluss (pos in [0,width])
let ferries = rivers.map((r, idx) => ({
  pos: 0,
  dir: 1, // 1 nach rechts (zum fernen Ufer), -1 zurück
  speed: 120 + idx * 10
}));

// Funktion zum Generieren neuer Flüsse (Performance-optimiert)
function generateNewRivers() {
  const lastRiver = rivers[rivers.length - 1];
  const baseDistance = 800; // Basisabstand zwischen Flüssen
  
  // Generiere nur einen neuen Fluss auf einmal für bessere Performance
  const newX = lastRiver.x + lastRiver.width + baseDistance;
  const newWidth = 500 + (rivers.length % 3) * 80; // Zyklische Breiten: 500, 580, 660
  
  rivers.push({ x: newX, width: newWidth });
  // Intelligente Fähren-Position: Starte sehr nah am linken Ufer für bessere Erreichbarkeit
  const ferryStartPos = 50; // Feste Position: 50 Pixel vom linken Ufer
  ferries.push({
    pos: ferryStartPos,
    dir: 1,
    speed: 120 + (rivers.length - 1) * 10
  });
}

const ferryDockThreshold = 72; // Distanz in px, die als "nah genug am Ufer" gilt
const embarkWindow = 600; // Distanz vor dem Ufer, in der ein Sprung auf die Fähre möglich ist (noch weiter erhöht)

// Wassergeometrie: Oberfläche = Boden, Tiefe nach unten
const WATER_DEPTH = 96;

// Resize/Orientation
function fitCanvas() {
  const { innerWidth: w, innerHeight: h } = window;
  devicePixelRatioClamped = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(w * devicePixelRatioClamped);
  canvas.height = Math.floor(h * devicePixelRatioClamped);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(devicePixelRatioClamped, 0, 0, devicePixelRatioClamped, 0, 0);

  // Orientierungshinweis nur als sanfter Hinweis, beide Modi unterstützt
  const portrait = h >= w;
  orientationHint.hidden = true; // beide unterstützt, daher default hidden
}

window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', fitCanvas);
// Warte, bis DOM wirklich bereit ist
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fitCanvas, { once: true });
} else {
  fitCanvas();
}

// Input (nur Platzhalter – löst derzeit nur Feedback aus)
function handleAction() {
  buttonFlash();
  tryEmbarkFerry();
}

// BUS-Button Funktionalität
function toggleBusMode() {
  isBusMode = !isBusMode;
  if (isBusMode) {
    busButton.textContent = 'WANDERN';
    busButton.style.background = '#4caf50'; // Grüne Farbe für WANDERN
    // Bus-Sound starten
    busSound.currentTime = 0;
    busSound.play().catch(e => console.log('Bus-Sound konnte nicht abgespielt werden:', e));
  } else {
    busButton.textContent = 'BUS';
    busButton.style.background = '#ff6b35'; // Orange Farbe für BUS
    // Bus-Sound stoppen
    busSound.pause();
    busSound.currentTime = 0;
  }
}

// Spiel zurücksetzen
function resetGame() {
  // Alle Variablen zurücksetzen
  runnerWorldX = 0;
  cameraX = 0;
  runnerState = RunnerState.Running;
  activeRiverIndex = -1;
  isBusMode = false;
  isPaused = false;
  
  // Alle Sounds stoppen und zurücksetzen
  backgroundMusic.pause();
  backgroundMusic.currentTime = 0;
  busSound.pause();
  busSound.currentTime = 0;
  waterSound.pause();
  waterSound.currentTime = 0;
  childLaughterWaterSound.pause();
  childLaughterWaterSound.currentTime = 0;
  ferrySound.pause();
  ferrySound.currentTime = 0;
  
  // Fähren zurücksetzen
  ferries.forEach(f => {
    f.pos = 0;
    f.dir = 1;
  });
  
  // Button-Status zurücksetzen
  busButton.textContent = 'BUS';
  busButton.style.background = '#ff6b35';
  pauseButton.textContent = 'PAUSE';
  pauseButton.style.background = '#9c27b0';
  
  // Hintergrundmusik neu starten
  backgroundMusic.play().catch(e => console.log('Hintergrundmusik konnte nicht gestartet werden:', e));
}

// PAUSE-Button Funktionalität
function togglePause() {
  isPaused = !isPaused;
  if (isPaused) {
    pauseButton.textContent = 'WEITER';
    pauseButton.style.background = '#ff9800'; // Orange Farbe für WEITER
    // Alle Sounds pausieren
    backgroundMusic.pause();
    busSound.pause();
    waterSound.pause();
    childLaughterWaterSound.pause();
    ferrySound.pause();
  } else {
    pauseButton.textContent = 'PAUSE';
    pauseButton.style.background = '#9c27b0'; // Lila Farbe für PAUSE
    
    // Prüfe, ob wir nach dem 4. Fluss sind - dann Spiel zurücksetzen
    if (rivers.length === 4) {
      resetGame();
    } else {
      // Normale Fortsetzung
      backgroundMusic.play().catch(e => console.log('Hintergrundmusik konnte nicht fortgesetzt werden:', e));
      if (isBusMode) {
        busSound.play().catch(e => console.log('Bus-Sound konnte nicht fortgesetzt werden:', e));
      }
      // Wasser-Sounds fortsetzen, falls sie vorher liefen
      if (runnerState === RunnerState.Swimming && !isBusMode) {
        waterSound.play().catch(e => console.log('Wasser-Sound konnte nicht fortgesetzt werden:', e));
        childLaughterWaterSound.play().catch(e => console.log('Kinderlachen-Wasser-Sound konnte nicht fortgesetzt werden:', e));
      }
      // Fähren-Sound fortsetzen, falls er vorher lief
      if (runnerState === RunnerState.OnFerry) {
        ferrySound.play().catch(e => console.log('Fähren-Sound konnte nicht fortgesetzt werden:', e));
      }
    }
  }
}

actionButton.addEventListener('click', handleAction);
actionButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleAction(); }, { passive: false });

busButton.addEventListener('click', toggleBusMode);
busButton.addEventListener('touchstart', (e) => { e.preventDefault(); toggleBusMode(); }, { passive: false });

pauseButton.addEventListener('click', togglePause);
pauseButton.addEventListener('touchstart', (e) => { e.preventDefault(); togglePause(); }, { passive: false });

let flashUntil = 0;
function buttonFlash() {
  flashUntil = performance.now() + 120;
}

// Render Utilities
function drawBackgroundGradient(w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#bfe3ff'); // heller Himmel oben
  g.addColorStop(1, '#eaf5ff'); // noch heller unten
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawParallax(w, h, timeSec) {
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    ctx.fillStyle = layer.color;
    const y = h * (0.6 + i * 0.08);
    const height = h * 0.6;
    // einfache wellige Linie
    const offset = -((cameraX * layer.speed) % w);
    ctx.beginPath();
    ctx.moveTo(offset - w, y);
    for (let x = -w; x <= w * 2; x += 64) {
      const wave = Math.sin((x + timeSec * 20) * 0.02 + i) * 18 * (i + 1);
      ctx.lineTo(offset + x, y - wave);
    }
    ctx.lineTo(w * 2, h);
    ctx.lineTo(-w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround(w, h) {
  ctx.fillStyle = '#2e7d32'; // grün
  const groundY = h * 0.82;
  ctx.fillRect(0, groundY, w, h - groundY);
}

function drawRunner(w, h, timeSec) {
  const groundY = h * 0.82;
  const waterTop = groundY; // Wasser liegt auf Bodenniveau
  const waterHeight = WATER_DEPTH;
  const runnerX = w * 0.28; // Kamera folgt, Runner bleibt eher links
  
  // Bob-Bewegung nur wenn nicht pausiert
  const bob = isPaused ? 0 : Math.sin(timeSec * 8) * 6;

  // Basis-Y ist Boden. Bei Schwimmen oder Fähre anpassen.
  let topY = groundY - 90 + bob;
  if (runnerState === RunnerState.Swimming) {
    // Figur halb eingetaucht (Oberkörper über der Oberfläche)
    topY = waterTop - 60 + bob;
  } else if (runnerState === RunnerState.OnFerry && activeRiverIndex !== -1) {
    const ferryY = waterTop + waterHeight * 0.25 - 26 / 2; // Fähre knapp unter Oberfläche
    topY = ferryY - 90 + bob;
  }

  // Zeichne die Spielfigur mit der entsprechenden Grafik
  if (isPaused && pauseImage.complete) {
    // Pause-Modus: Verwende pause.png (790x465)
    // Skaliere auf eine angemessene Größe für das Spiel
    const imageWidth = 120; // Breite der Pause-Figur
    const imageHeight = 71; // Höhe der Pause-Figur (proportional zu 790x465)
    
    // Positioniere die Pause-Figur so, dass sie auf dem Boden steht
    const drawY = topY - imageHeight + 90;
    
    ctx.drawImage(
      pauseImage, 
      runnerX - imageWidth/2, 
      drawY, 
      imageWidth, 
      imageHeight
    );
  } else if (isBusMode && busImage.complete) {
    // Bus-Modus: Verwende bus.png (678x214)
    // Skaliere auf eine angemessene Größe für das Spiel
    const imageWidth = 120; // Breite des Busses (doppelt so breit wie die Figur)
    const imageHeight = 38; // Höhe des Busses (proportional zu 678x214)
    
    // Positioniere den Bus so, dass er auf dem Boden steht
    const drawY = topY - imageHeight + 90;
    
    ctx.drawImage(
      busImage, 
      runnerX - imageWidth/2, 
      drawY, 
      imageWidth, 
      imageHeight
    );
  } else if (runnerImage.complete) {
    // Wander-Modus: Verwende punk.png (240x448)
    // Skaliere auf eine angemessene Größe für das Spiel
    const imageWidth = 60; // Breite der Figur
    const imageHeight = 112; // Höhe der Figur (proportional zu 240x448)
    
    // Positioniere die Figur so, dass sie auf dem Boden steht
    // topY ist der obere Rand, wir brauchen den unteren Rand auf Bodenhöhe
    const drawY = topY - imageHeight + 90; // 90 war die ursprüngliche Höhe
    
    ctx.drawImage(
      runnerImage, 
      runnerX - imageWidth/2, 
      drawY, 
      imageWidth, 
      imageHeight
    );
  } else {
    // Fallback: helle Silhouette falls Bild noch nicht geladen
    ctx.fillStyle = runnerState === RunnerState.Swimming ? '#bbf' : '#ffffff';
    ctx.fillRect(runnerX - 18, topY, 36, 90);
    ctx.fillStyle = '#dce6ff';
    ctx.fillRect(runnerX - 12, topY + 30, 24, 60);
    ctx.fillStyle = '#a7b7ff';
    ctx.fillRect(runnerX - 4, topY + 70, 8, 20);
  }
}

function worldToScreenX(worldX, screenW) {
  const runnerScreenX = screenW * 0.28;
  return worldX - runnerWorldX + runnerScreenX;
}

function drawRivers(w, h) {
  const groundY = h * 0.82;
  const waterTop = groundY; // Oberfläche auf Bodenhöhe
  const waterHeight = WATER_DEPTH; // Tiefe nach unten
  for (let i = 0; i < rivers.length; i++) {
    const r = rivers[i];
    const sx = worldToScreenX(r.x, w);
    const sw = r.width;
    // Wasser
    ctx.fillStyle = '#4aa3ff';
    ctx.fillRect(sx, waterTop, sw, waterHeight);
    // Uferlinie
    ctx.fillStyle = '#1f5fae';
    ctx.fillRect(sx - 2, waterTop, 2, 4); // Oberflächenkante links
    ctx.fillRect(sx + sw, waterTop, 2, 4); // Oberflächenkante rechts

    // Fähre
    const f = ferries[i];
    const ferryW = 120; // Größere Fähre für bessere Sichtbarkeit
    const ferryH = 60;
    const ferryX = worldToScreenX(r.x + f.pos, w) - ferryW / 2;
    const ferryY = waterTop + waterHeight * 0.25 - ferryH / 2; // knapp unter Oberfläche
    
    // Zeichne die Fähre mit der ferry.png Grafik
    if (ferryImage.complete) {
      ctx.drawImage(
        ferryImage,
        ferryX,
        ferryY,
        ferryW,
        ferryH
      );
    } else {
      // Fallback: dunkles Rechteck falls Bild noch nicht geladen
      ctx.fillStyle = '#0f2642';
      ctx.fillRect(ferryX, ferryY, ferryW, ferryH);
    }
  }
}

function drawSwimmingOverlay(w, h) {
  if (runnerState !== RunnerState.Swimming || activeRiverIndex === -1) return;
  const groundY = h * 0.82;
  const waterTop = groundY;
  const waterHeight = WATER_DEPTH;
  const r = rivers[activeRiverIndex];
  const sx = worldToScreenX(r.x, w);
  // Halbdurchsichtiges Wasser über die untere Hälfte der Figur legen
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#1b6fd1';
  ctx.fillRect(sx, waterTop, r.width, waterHeight * 0.6);
  ctx.restore();
}

function getRiverIndexAt(worldX) {
  for (let i = 0; i < rivers.length; i++) {
    const r = rivers[i];
    if (worldX >= r.x && worldX < r.x + r.width) return i;
  }
  return -1;
}

function getUpcomingRiverIndex(worldX, windowPx) {
  for (let i = 0; i < rivers.length; i++) {
    const r = rivers[i];
    if (worldX < r.x && r.x - worldX <= windowPx) return i;
  }
  return -1;
}

function tryEmbarkFerry() {
  if (runnerState !== RunnerState.Running) return;
  // Ist ein Fluss unmittelbar vor uns und die Fähre am nahen Ufer?
  const idx = getUpcomingRiverIndex(runnerWorldX, embarkWindow);
  if (idx === -1) return;
  const f = ferries[idx];
  // Erlaube auch einen Sprung, wenn die Figur bereits minimal im Wasser ist
  const alreadyInWater = runnerWorldX >= rivers[idx].x && runnerWorldX < rivers[idx].x + 12;
  if (f.pos <= ferryDockThreshold || alreadyInWater) {
    runnerState = RunnerState.OnFerry;
    activeRiverIndex = idx;
    
    // Fähren-Sound starten
    startFerrySound();
    
    // Bus-Sound pausieren, falls Bus-Modus aktiv ist
    if (isBusMode) {
      busSound.pause();
    }
  }
}

// Game Loop
function tick(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;

  const scaleX = canvas.width / devicePixelRatioClamped;
  const scaleY = canvas.height / devicePixelRatioClamped;
  const w = scaleX;
  const h = scaleY;

  // Fähren bewegen (nur wenn nicht pausiert)
  if (!isPaused) {
    for (let i = 0; i < ferries.length; i++) {
      const f = ferries[i];
      const r = rivers[i];
      f.pos += f.dir * f.speed * dt;
      if (f.pos >= r.width) { f.pos = r.width; f.dir = -1; }
      if (f.pos <= 0) { f.pos = 0; f.dir = 1; }
    }
  }

    // Runner updaten je nach State (nur wenn nicht pausiert)
  if (!isPaused) {
    if (runnerState === RunnerState.OnFerry) {
      const r = rivers[activeRiverIndex];
      const f = ferries[activeRiverIndex];
      runnerWorldX = r.x + f.pos;
      // Abstieg am fernen Ufer
      if (f.pos >= r.width - 1) {
        runnerState = RunnerState.Running;
        activeRiverIndex = -1;
        // Wasser-Sounds stoppen (falls sie liefen)
        stopWaterSounds();
        // Fähren-Sound stoppen
        stopFerrySound();
        
        // Bus-Sound wieder starten, falls Bus-Modus aktiv ist
        if (isBusMode) {
          busSound.play().catch(e => console.log('Bus-Sound konnte nicht fortgesetzt werden:', e));
        }
      }
    } else if (runnerState === RunnerState.Swimming) {
      runnerWorldX += swimSpeed * dt;
      const r = rivers[activeRiverIndex];
      if (runnerWorldX >= r.x + r.width) {
        runnerState = RunnerState.Running;
        activeRiverIndex = -1;
        // Wasser-Sounds stoppen
        stopWaterSounds();
      }
    } else {
      // Running
      runnerWorldX += runnerSpeed * dt;
      // Falls wir in Wasser eintreten (keine Interaktion erfolgt), automatisch schwimmen
      const ri = getRiverIndexAt(runnerWorldX);
      if (ri !== -1) {
        runnerState = RunnerState.Swimming;
        activeRiverIndex = ri;
        // Wasser-Sounds starten (nur wenn nicht Bus-Modus)
        if (!isBusMode) {
          startWaterSounds();
        }
      }
    }
    
    // Nach dem 4. Fluss automatisch pausieren
    if (rivers.length === 4) {
      const lastRiver = rivers[3]; // 4. Fluss (Index 3)
      if (runnerWorldX > lastRiver.x + lastRiver.width + 200) {
        // Automatisch pausieren
        isPaused = true;
        pauseButton.textContent = 'WEITER';
        pauseButton.style.background = '#ff9800'; // Orange Farbe für WEITER
        
        // Alle Sounds pausieren
        backgroundMusic.pause();
        busSound.pause();
        waterSound.pause();
        childLaughterWaterSound.pause();
        ferrySound.pause();
      }
    } else {
      // Neue Flüsse generieren, wenn der Spieler voranschreitet (Performance-optimiert)
      const lastRiver = rivers[rivers.length - 1];
      
      // Einfache Bedingung: Generiere neuen Fluss, wenn Spieler weit genug vorangeschritten ist
      if (runnerWorldX > lastRiver.x + lastRiver.width + 500) {
        generateNewRivers();
      }
    }
    
    // Debug: Zeige immer den Abstand zum letzten Fluss an
    const lastRiver = rivers[rivers.length - 1];
    const distanceToLastRiver = lastRiver.x + lastRiver.width - runnerWorldX;
    if (distanceToLastRiver < 1000) {
      // Zeige in der HUD anstelle der Konsole
      ctx.fillText(`dist: ${Math.round(distanceToLastRiver)}px`, 20, 120);
    }
  }

  // Kamera folgt der Figur (nur wenn nicht pausiert)
  if (!isPaused) {
    cameraX = runnerWorldX;
  }

  // Render
  drawBackgroundGradient(w, h);
  drawParallax(w, h, ts / 1000);
  drawGround(w, h);
  drawRivers(w, h);
  drawRunner(w, h, ts / 1000);
  drawSwimmingOverlay(w, h);

  // HUD: kleine Laufzeit-Anzeige links oben
  ctx.fillStyle = '#083358';
  ctx.fillRect(12, 10, 120, 140);
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  ctx.fillText(`t=${(ts/1000).toFixed(1)}s`, 20, 30);
  ctx.fillText(`state=${runnerState}`, 20, 48);
  ctx.fillText(`rivers=${rivers.length}`, 20, 66);
  
  // Debug: Zeige nächsten Fluss und Fähren-Position
  if (rivers.length > 0) {
    const nextRiver = rivers.find(r => r.x > runnerWorldX);
    if (nextRiver) {
      const riverIndex = rivers.indexOf(nextRiver);
      const ferry = ferries[riverIndex];
      ctx.fillText(`next: ${Math.round(nextRiver.x - runnerWorldX)}px`, 20, 84);
      ctx.fillText(`ferry: ${Math.round(ferry.pos)}px`, 20, 102);
    }
    
    // Zeige auch den letzten Fluss an
    const lastRiver = rivers[rivers.length - 1];
    ctx.fillText(`last: ${Math.round(lastRiver.x + lastRiver.width - runnerWorldX)}px`, 20, 120);
  }

  if (debugEl) {
    debugEl.hidden = false;
    debugEl.textContent = `w:${Math.round(w)} h:${Math.round(h)} dpr:${devicePixelRatioClamped.toFixed(2)} dt:${dt.toFixed(3)}`;
  }

  // leichter Button-Flash-Ring
  if (ts < flashUntil) {
    const alpha = (flashUntil - ts) / 120;
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    const cx = w * 0.5;
    const cy = h * 0.92;
    const r = Math.min(w * 0.35, 420) * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  requestAnimationFrame(tick);
}

// Hintergrundmusik beim Spielstart starten
function startBackgroundMusic() {
  backgroundMusic.play().catch(e => console.log('Hintergrundmusik konnte nicht gestartet werden:', e));
}

// Wasser-Sounds starten
function startWaterSounds() {
  waterSound.play().catch(e => console.log('Wasser-Sound konnte nicht gestartet werden:', e));
  childLaughterWaterSound.play().catch(e => console.log('Kinderlachen-Wasser-Sound konnte nicht gestartet werden:', e));
}

// Wasser-Sounds stoppen
function stopWaterSounds() {
  waterSound.pause();
  waterSound.currentTime = 0;
  childLaughterWaterSound.pause();
  childLaughterWaterSound.currentTime = 0;
}

// Fähren-Sound starten
function startFerrySound() {
  ferrySound.play().catch(e => console.log('Fähren-Sound konnte nicht gestartet werden:', e));
}

// Fähren-Sound stoppen
function stopFerrySound() {
  ferrySound.pause();
  ferrySound.currentTime = 0;
}

const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');

// Prüfen, ob alle Assets geladen sind
function assetsLoaded() {
  return runnerImage.complete && busImage.complete && pauseImage.complete && ferryImage.complete;
}

function startGame() {
  if (!assetsLoaded()) {
    console.log("Assets noch nicht fertig, warte...");
    setTimeout(startGame, 200);
    return;
  }

  requestAnimationFrame(tick);
  backgroundMusic.play().catch(e => console.log("Musik konnte nicht starten:", e));
  startScreen.style.display = 'none';
}

startButton.addEventListener('click', startGame);


