// ===============================
// Constants
// ===============================
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const OCTAVE_NAMES = ["₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

// ===============================
// Elements
// ===============================
const noteDisplay = document.getElementById('note-display');
const feedbackDisplay = document.getElementById('feedback-display');
const statusDisplay = document.getElementById('status');
const status2Display = document.getElementById('status2');
const modeSwitcher = document.getElementById('mode-switcher');
const modeButtons = document.querySelectorAll('.mode-button');
const pianoContainer = document.getElementById('piano-container');
const rangeBelowSlider = document.getElementById('range-below-slider');
const rangeAboveSlider = document.getElementById('range-above-slider');
const rangeBelowValue = document.getElementById('range-below-value');
const rangeAboveValue = document.getElementById('range-above-value');
const easyModeToggle = document.getElementById('easy-mode-toggle');
const replayButton = document.getElementById('replay-note');

// ===============================
// State
// ===============================
let audioContext;
let piano;
let chromaticNotes = [];
let majorScaleNotes = [];
let blackKeyNotes = [];
let currentMode = 'identify-major';
let currentNote = null;
let currentChord = null;
let awaitingNextNote = false;

// ===============================
// Audio
// ===============================
async function initPiano() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        piano = await Soundfont.instrument(audioContext, 'acoustic_grand_piano');
    }
}

async function playNote(midiNote, duration = 1.5) {
    if (!piano) await initPiano();
    const name = NOTE_NAMES[midiNote % 12];
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = `${name}${octave}`;
    piano.play(noteName, audioContext.currentTime, { duration });
}

// ===============================
// Note & Chord Helpers
// ===============================
function getChordName(rootNote, intervals) {
    const baseName = NOTE_NAMES[rootNote.midi % 12];
    if (intervals.join() === "0,4,7") return baseName + " Major";
    if (intervals.join() === "0,3,7") return baseName + " Minor";
    return baseName + " Chord";
}

function clearKeyHighlights() {
    document.querySelectorAll('.piano-key').forEach(k => {
        k.classList.remove('correct', 'incorrect', 'target');
    });
}

// ===============================
// Piano UI
// ===============================
function updateNotePoolsAndPiano() {
    const middleC = 60;
    const rangeBelow = parseInt(rangeBelowSlider.value);
    const rangeAbove = parseInt(rangeAboveSlider.value);
    const startNote = middleC - rangeBelow;
    const endNote = middleC + rangeAbove;

    rangeBelowValue.textContent = rangeBelow;
    rangeAboveValue.textContent = rangeAbove;

    chromaticNotes = Array.from({ length: endNote - startNote + 1 }, (_, i) => {
        const midi = startNote + i;
        const octave = Math.floor(midi / 12) - 1;
        const name = NOTE_NAMES[midi % 12];
        return { name: `${name}${OCTAVE_NAMES[octave]}`, midi };
    });

    majorScaleNotes = chromaticNotes.filter(n => !n.name.includes('#'));
    blackKeyNotes = chromaticNotes.filter(n => n.name.includes('#'));

    generatePianoKeys();
    selectRandomNote();
}

function generatePianoKeys() {
    pianoContainer.innerHTML = '';
    const whiteKeys = chromaticNotes.filter(n => !n.name.includes('#'));
    const keyWidth = 100 / whiteKeys.length;

    chromaticNotes.forEach(note => {
        const key = document.createElement('div');
        key.dataset.midi = note.midi;
        key.classList.add('piano-key', 'transition-all', 'duration-100');

        if (note.name.includes('#')) {
            key.classList.add('b-key', 'absolute', 'h-2/3', 'bg-gray-900', 'border-2', 'border-gray-700', 'rounded-b-md', 'z-10');
            key.style.width = `${keyWidth * 0.6}%`;
            const whiteKeyIndex = whiteKeys.findIndex(n => n.midi > note.midi) - 1;
            key.style.left = `${(whiteKeyIndex + 1) * keyWidth - (keyWidth * 0.3)}%`;
        } else {
            key.classList.add('w-key', 'h-full', 'bg-gray-200', 'border-2', 'border-gray-400', 'rounded-md');
            key.style.width = `${keyWidth}%`;
        }

        key.addEventListener('mousedown', () => handleNoteInput(note.midi));
        pianoContainer.appendChild(key);
    });
}

function midiToVexKey(midi) {
  const noteNames = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  const octave = Math.floor(midi / 12) - 1;  // MIDI octave numbering
  const noteName = noteNames[midi % 12];
  return `${noteName}/${octave}`;
}

function renderNotesOnStave(notes) {
  const musicDiv = document.getElementById('music');
  musicDiv.innerHTML = "";

  const renderer = new Vex.Flow.Renderer(musicDiv, Vex.Flow.Renderer.Backends.SVG);
  renderer.resize(500, 150);
  const context = renderer.getContext();

  const staveWidth = 200;
  const staveX = (500 - staveWidth) / 2;
  const stave = new Vex.Flow.Stave(staveX, 20, staveWidth);
  stave.addClef("treble").setContext(context).draw();

  const keys = notes.map(n => n.vexKey);
  const vfNotes = [ new Vex.Flow.StaveNote({ keys, duration: "q" }) ];

  Vex.Flow.Formatter.FormatAndDraw(context, stave, vfNotes);
}

// ===============================
// Game Logic
// ===============================
function selectRandomNote() {
    clearKeyHighlights();
    let notePool;

    switch (currentMode) {
        case 'identify-major': notePool = majorScaleNotes; break;
        case 'identify-chromatic': notePool = chromaticNotes; break;
        case 'black-keys': notePool = blackKeyNotes; break;
        case 'ear-training': notePool = chromaticNotes; break;
        case 'chords-major':
        case 'chords-minor':
            notePool = majorScaleNotes; break;
        default: notePool = majorScaleNotes;
    }

    if (notePool.length === 0) return;

    currentChord = null;
    currentNote = null;

    if (currentMode === 'chords-major' || currentMode === 'chords-minor') {
        const intervals = currentMode === 'chords-major' ? [0, 4, 7] : [0, 3, 7];
        const minMidi = chromaticNotes[0].midi;
        const maxMidi = chromaticNotes[chromaticNotes.length - 1].midi;

        const validRoots = notePool.filter(root =>
            root.midi + Math.max(...intervals) <= maxMidi &&
            root.midi + Math.min(...intervals) >= minMidi
        );

        if (validRoots.length === 0) return;

        const root = validRoots[Math.floor(Math.random() * validRoots.length)];
        currentChord = intervals
            .map(semi => chromaticNotes.find(n => n.midi === root.midi + semi))
            .filter(Boolean);

        const chordName = getChordName(root, intervals);
        noteDisplay.textContent = chordName + " (" + currentChord.map(n => n.name).join(" - ") + ")";
        feedbackDisplay.textContent = '';
        noteDisplay.classList.remove('text-cyan-400');

        setTimeout(() => currentChord.forEach(n => playNote(n.midi, 2)), 300);

        if (easyModeToggle.checked) {
            currentChord.forEach(n => {
                const targetKey = document.querySelector(`.piano-key[data-midi="${n.midi}"]`);
                if (targetKey) targetKey.classList.add('target');
            });
        }
    renderNotesOnStave(currentChord.map(n => ({ vexKey: midiToVexKey(n.midi) })));

    } else {
        let newNote;
        do {
            newNote = notePool[Math.floor(Math.random() * notePool.length)];
        } while (newNote === currentNote && notePool.length > 1);

        currentNote = newNote;
        feedbackDisplay.textContent = '';
        noteDisplay.classList.remove('text-cyan-400');

        noteDisplay.textContent = (currentMode === 'ear-training') ? '?' : currentNote.name;
        setTimeout(() => playNote(currentNote.midi, 1.8), 300);

        if (easyModeToggle.checked && currentMode !== 'ear-training') {
            const targetKey = document.querySelector(`.piano-key[data-midi="${currentNote.midi}"]`);
            if (targetKey) targetKey.classList.add('target');
        }
    renderNotesOnStave([{ vexKey: midiToVexKey(currentNote.midi) }]);

    }
}

function handleNoteInput(note) {
    const keyElement = document.querySelector(`.piano-key[data-midi="${note}"]`);
    playNote(note);

    if (keyElement) {
        keyElement.classList.add('pressed');
        setTimeout(() => keyElement.classList.remove('pressed'), 250);
    }

    if (!currentNote && !currentChord) return;

    if (currentChord) {
        if (!currentChord.pressed) currentChord.pressed = new Set();
        const chordMidi = currentChord.map(n => n.midi);

        if (chordMidi.includes(note)) {
            currentChord.pressed.add(note);
            if (keyElement) keyElement.classList.add('correct');
            setTimeout(() => keyElement?.classList.remove('correct'), 250);

            if (currentChord.pressed.size === chordMidi.length) {
                feedbackDisplay.textContent = '✅';
                if (!awaitingNextNote) {
                    awaitingNextNote = true;
                    setTimeout(() => { selectRandomNote(); awaitingNextNote = false; }, 1500);
                }
            }
        } else {
            if (keyElement) keyElement.classList.add('incorrect');
            setTimeout(() => keyElement?.classList.remove('incorrect'), 250);
        }
        return;
    }

    if (note === currentNote.midi) {
        feedbackDisplay.textContent = '✅';
        if (keyElement) keyElement.classList.add('correct');
        setTimeout(() => keyElement?.classList.remove('correct'), 250);

        if (currentMode === 'ear-training') {
            noteDisplay.textContent = currentNote.name;
            noteDisplay.classList.add('text-cyan-400');
        }

        if (!awaitingNextNote) {
            awaitingNextNote = true;
            setTimeout(() => { selectRandomNote(); awaitingNextNote = false; }, 1200);
        }
    } else {
        if (keyElement) keyElement.classList.add('incorrect');
        setTimeout(() => keyElement?.classList.remove('incorrect'), 250);

        if (easyModeToggle.checked) {
            const targetKey = document.querySelector(`.piano-key[data-midi="${currentNote.midi}"]`);
            if (targetKey) targetKey.classList.add('target');
        }
    }
}

// ===============================
// MIDI & UI Setup
// ===============================
function handleMidiMessage(event) {
    const [command, note, velocity] = event.data;
    if (command === 144 && velocity > 0) handleNoteInput(note);
}

function setupModeSwitcher() {
    modeSwitcher.addEventListener('click', (e) => {
        if (!e.target.matches('.mode-button')) return;
        currentMode = e.target.id.replace('mode-', '');
        updateButtonStyles();
        selectRandomNote();
    });
    updateButtonStyles();
}

function updateButtonStyles() {
    modeButtons.forEach(button => {
        const isActive = button.id === `mode-${currentMode}`;
        button.classList.toggle('bg-cyan-500', isActive);
        button.classList.toggle('text-white', isActive);
        button.classList.toggle('bg-gray-700', !isActive);
        button.classList.toggle('hover:bg-gray-600', !isActive);
        button.classList.toggle('text-gray-300', !isActive);
    });
}

function onReplayPressed() {
    if (currentNote) {
        playNote(currentNote.midi, 1.8);
    } else if (currentChord) {
        currentChord.forEach(n => playNote(n.midi));
    }
}

function attachUIEvents() {
    rangeBelowSlider.addEventListener('input', updateNotePoolsAndPiano);
    rangeAboveSlider.addEventListener('input', updateNotePoolsAndPiano);
    easyModeToggle.addEventListener('change', selectRandomNote);
    replayButton.addEventListener('click', onReplayPressed);
}

function onMIDISuccess(midiAccess) {
    statusDisplay.textContent = 'MIDI connected! Ready to play.';
    midiAccess.inputs.forEach(input => input.onmidimessage = handleMidiMessage);
    setupModeSwitcher();
    attachUIEvents();
    updateNotePoolsAndPiano();
}

function onMIDIFailure() {
    statusDisplay.textContent = 'Could not access your MIDI devices.';
    setupModeSwitcher();
    attachUIEvents();
    updateNotePoolsAndPiano();
}

// ===============================
// Init
// ===============================
if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
} else {
    onMIDIFailure();
    statusDisplay.textContent = 'Web MIDI API not supported in this browser.';
    status2Display.textContent = 'Use your mouse to select keys or switch to Chrome';
}
