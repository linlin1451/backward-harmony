# Backward harmony

A browser app that writes chord progressions backward. It fixes the last chord first, then chooses every earlier chord from weighted rules and from the cadences that can lead into the chord after it. You can play the result, edit any chord, and download it as MIDI.

It's plain HTML, CSS and JavaScript modules, with no build step and no dependencies. Push it to GitHub and it deploys itself to GitHub Pages.

## Features

- **Backward derivation, one chord per bar.** The generator writes only the first chord of each bar, choosing it from the weighted options that can come before what follows. Your own choices stay fixed when you generate again.
- **Bars and parts.** The bars are shown four to a row. Any bar can be divided into two to four equal parts. New parts hold the bar's chord until you pick a different chord for them. If you pick one, the bar's first chord is then derived as a lead-in to it.
- **One tile per distinct chord.** When parts of a bar repeat the same chord, the chord is shown once, stretched across those parts. The small numbered strip under it marks each part; click a number to change that part.
- **Undo and redo.** Every change can be undone (Undo button, Ctrl+Z or ⌘Z) to bring back the previous progression, and redone (Redo, Ctrl+Shift+Z or ⌘⇧Z).
- **Held repeats.** When a part repeats the chord before it in the same bar (same chord, same inversion), playback and MIDI hold the chord instead of striking it again. Mark a part "Play it again here" in the editor to re-strike it. Clicking a part always plays it.
- **Cadences into any chord.** Any chord except a diminished one can act as a temporary tonic. The editor lists the chords that make each kind of cadence into it:
  - authentic: V, V7, vii°
  - tritone substitute: ♭II7
  - plagal
  - deceptive
  - half
- **Borrowed chords.** iv, ♭III, ♭VI, ♭VII and ii° in major keys; I, IV and ii in minor keys.
- **Secondary chords and tritone substitutes.** These are labelled with chromatic Roman numerals. For example, A major in C (V of ii) reads **VI**.
- **Inversions.** Triads and dominant sevenths can appear in any inversion, labelled with figured bass (V⁶₅, I⁶₄) and as slash chords (G7/B). The generator can pick inversions itself; diminished triads lean toward first inversion, and a tonic before V can become a cadential 6/4.
- **Playback.** A built-in synth plays the progression with simple voice leading, and a keyboard display shows the notes.
- **Lead sheet.** Chord symbols and Roman numerals are shown together, with bar lines.
- **MIDI export.** One bar of 4/4 per slot, with tempo and key signature included.

## Run it locally

ES modules don't load from `file://`, so serve the folder over HTTP:

```bash
npm start            # same as: python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to GitHub Pages

1. Create an empty repository on GitHub (no README, .gitignore or license, since this folder already has them).
2. Push this folder to its `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Backward harmony"
   git branch -M main
   git remote add origin https://github.com/<you>/backward-harmony.git
   git push -u origin main
   ```
3. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab. The *Test and deploy to GitHub Pages* workflow runs the tests and publishes the site. If it ran before Pages was switched on and failed, open the run and choose **Re-run all jobs**.
5. The site address appears on the run's deploy step and under **Settings → Pages**. It is usually `https://<you>.github.io/backward-harmony/`.

Every later push to `main` redeploys. Pull requests only run the tests.

## Tests

```bash
npm test             # node --test, no dependencies
```

The tests cover:

- the rule tables
- note spelling in every key
- cadence and tritone-substitution detection
- inversion labels
- randomized derivation with split bars
- voicing ranges
- the MIDI and ZIP writers

## Single-file build

```bash
npm run build:single # writes dist/backward-harmony.html
```

This inlines everything into one HTML file you can open directly or host anywhere.

## Project structure

```
index.html              page markup
styles.css              styles, light and dark themes
src/theory.js           chords, spelling, Roman numerals, rule weights, cadences, tritone subs
src/generator.js        weighted picks, inversions, recursive backward derivation, bar splitting
src/voicing.js          bass and upper-voice voice leading
src/audio.js            Web Audio synth
src/midi.js             MIDI file writer and a tiny ZIP writer
src/app.js              state, rendering, editor, playback, download
tests/theory.test.js    node:test suite
tools/build-single-file.mjs
.github/workflows/pages.yml
```

## How the model works

A chord is `{deg, off, q}`:

- `deg` is the letter degree above the tonic, which keeps spelling correct (A C♯ E rather than A D♭ E).
- `off` is the number of semitones above the tonic.
- `q` is the quality: `maj`, `min`, `dim` or `dom7`.

For the key's own chords, `RULES` in `src/theory.js` lists their usual predecessors with weights. Borrowed predecessors are scaled by the *Borrowed chords* slider.

For any target chord, `cadenceGroups` builds the cadence chords listed above. They are merged into the options, and chords from outside the key are scaled by the *Secondary chords* slider. Secondary chords find their way back into the key through home chords that share notes with them.

Edit the weights in `RULES` or `cadenceGroups` to change the generator's taste.

## License

No license file is included yet. Add one (for example MIT) before inviting contributions.
