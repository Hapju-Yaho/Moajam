import React from 'react';
import { createRoot } from 'react-dom/client';
import { TrackTimeline } from '../packages/app/src/components/TrackTimeline.web';
import { MidiClipEditor } from '../packages/app/src/components/MidiClipEditor.web';
import { useUndoState } from '../packages/app/src/lib/useUndoState';
import { mergeClips } from '../packages/app/src/lib/clipMerge.web';
import type { TimelineTrack } from '../packages/app/src/lib/practiceClips';
const initial: TimelineTrack[] = [
  {
    id: 't',
    name: 'MIDI',
    kind: 'midi',
    volume: 1,
    muted: false,
    url: '',
    duration: 0,
    offset: 0,
    clips: ['a', 'b'].map((id, i) => ({
      id,
      name: id + '.mid',
      blob: new Blob(),
      url: '',
      offset: i * 2,
      sourceStart: 0,
      duration: 2,
      midi: { notes: [], duration: 2 },
    })),
  },
];
let serial = 0;
const uid = () => String(++serial);
export function App() {
  const [tracks, setTracks, history] = useUndoState(initial);
  const [editing, setEditing] = React.useState(false);
  const noop = () => {};
  return (
    <>
      <TrackTimeline
        tracks={tracks}
        loaded
        saveLabel="test"
        error=""
        onUpload={noop}
        onAdd={noop}
        onEditMidi={() => setEditing(true)}
        onCreateMidi={noop}
        onReorder={noop}
        onPatch={noop}
        onPatchClip={(id, patch) =>
          setTracks((all) =>
            all.map((t) => ({
              ...t,
              clips: t.clips?.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            })),
          )
        }
        onUndo={history.undo}
        canUndo={history.canUndo}
        onEditStart={history.begin}
        onEditEnd={history.end}
        onMergeClips={async (ids) => {
          const merged = await mergeClips(
            tracks[0].clips!.filter((c) => ids.includes(c.id)),
            uid,
          );
          setTracks((all) =>
            all.map((t) => ({
              ...t,
              clips: [...t.clips!.filter((c) => !ids.includes(c.id)), merged],
            })),
          );
        }}
        onPasteClips={(items, position) => {
          const first = Math.min(...items.map((i) => i.clip.offset));
          setTracks((all) =>
            all.map((t) => ({
              ...t,
              clips: [
                ...t.clips!,
                ...items.map((i) => ({
                  ...i.clip,
                  id: uid(),
                  offset: position + i.clip.offset - first,
                })),
              ],
            })),
          );
        }}
        onClipDuration={noop}
        onMoveClip={(id, target, offset) =>
          setTracks((all) =>
            all.map((t) => ({
              ...t,
              clips: t.clips?.map((c) => (c.id === id ? { ...c, offset } : c)),
            })),
          )
        }
        onMoveToNewTrack={noop}
        onSave={noop}
        onRefresh={noop}
        refreshing={false}
        saving={false}
        dirty={false}
        onSplitClip={noop}
        onRemoveClip={(id) =>
          setTracks((all) => all.map((t) => ({ ...t, clips: t.clips?.filter((c) => c.id !== id) })))
        }
        onRemove={noop}
        solo={null}
        onSolo={noop}
        armed="t"
        onArm={noop}
        onImportClip={noop}
        publishing={null}
        transport={{
          position: 8,
          duration: 10,
          playing: false,
          recording: false,
          requesting: false,
          preparing: false,
          countdown: 0,
          bpm: 120,
          signature: '4/4',
          metronome: false,
          standalone: false,
          clickVolume: 1,
          countInBars: 0,
          masterVolume: 1,
          beat: -1,
          onPlay: noop,
          onStop: noop,
          onRewind: noop,
          onRecord: noop,
          onSeek: noop,
          onBpm: noop,
          onSignature: noop,
          onMetronome: noop,
          onStandalone: noop,
          onClickVolume: noop,
          onCountIn: noop,
          onMasterVolume: noop,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          onLoop: noop,
          onLoopStart: noop,
          onLoopEnd: noop,
        }}
      />
      {editing && (
        <MidiClipEditor
          name="test"
          bpm={120}
          sequence={{
            duration: 4,
            notes: [
              { id: 'n1', pitch: 60, start: 0, duration: 0.5, velocity: 100, channel: 0 },
              { id: 'n2', pitch: 64, start: 1, duration: 0.5, velocity: 100, channel: 0 },
            ],
          }}
          onClose={() => setEditing(false)}
          onSave={(s) => (document.getElementById('saved')!.textContent = JSON.stringify(s))}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
setTimeout(async () => {
  const wait = () => new Promise((r) => setTimeout(r, 70));
  const check = (v: unknown, m: string) => {
    if (!v) throw Error(m);
  };
  const button = (label: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
  const send = (target: Element, type: string, x: number, y: number, extra = {}) => {
    target.setPointerCapture = () => {};
    target.hasPointerCapture = () => false;
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        pointerId: 1,
        clientX: x,
        clientY: y,
        ...extra,
      }),
    );
  };
  const key = (target: Element, k: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: k, ctrlKey: true }));
  const selectClip = async (id: string, ctrl = false) => {
    const target = document.querySelector('[data-selection-id="' + id + '"]')!,
      r = target.getBoundingClientRect();
    send(target, 'pointerdown', r.x + 20, r.y + 20, { ctrlKey: ctrl });
    await wait();
    if (!ctrl) send(target, 'pointerup', r.x + 20, r.y + 20);
    await wait();
  };
  try {
    await wait();
    await selectClip('a');
    await selectClip('b', true);
    check(button('클립 합치기') && !button('클립 합치기').disabled, 'adjacent merge button');
    check(!button('클립 붙여넣기'), 'paste should become merge');
    key(document.body, 'c');
    await wait();
    key(document.body, 'v');
    await wait();
    check(document.querySelectorAll('.studio-clip').length === 4, 'clip keyboard paste');
    key(document.body, 'z');
    await wait();
    check(document.querySelectorAll('.studio-clip').length === 2, 'clip undo paste');
    await selectClip('a');
    await selectClip('b', true);
    button('클립 합치기').click();
    await wait();
    check(document.querySelectorAll('.studio-clip').length === 1, 'merge');
    key(document.body, 'z');
    await wait();
    check(document.querySelectorAll('.studio-clip').length === 2, 'undo merge');
    const b = document.querySelector('[data-selection-id=b]')!,
      r = b.getBoundingClientRect();
    send(b, 'pointerdown', r.x + 20, r.y + 20);
    await wait();
    send(b, 'pointermove', r.x + 68, r.y + 20);
    await wait();
    send(b, 'pointerup', r.x + 68, r.y + 20);
    await wait();
    await selectClip('a');
    await selectClip('b', true);
    check(button('클립 합치기').disabled, 'gap merge disabled');
    check(button('클립 합치기').parentElement!.title.includes('모두 붙어'), 'disabled tooltip');
    key(document.body, 'z');
    await wait();
    check(Math.abs(b.getBoundingClientRect().x - r.x) < 1, 'undo drag as one edit');
    document
      .querySelector('[data-selection-id=a]')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await wait();
    const svg = document.querySelector('.studio-midi-roll svg')!;
    const n1 = document.querySelector('[data-note-id=n1]')!;
    let nr = n1.getBoundingClientRect();
    button('+ 음표 추가').click();
    await wait();
    const sr = svg.getBoundingClientRect();
    send(svg, 'pointerdown', sr.left + 54 + 70, nr.y + 38);
    send(svg, 'pointerup', sr.left + 54 + 70, nr.y + 38);
    await wait();
    check(document.querySelectorAll('[data-note-id]').length === 3, 'draw note');
    button('클립에 적용').click();
    await wait();
    let saved = JSON.parse(document.getElementById('saved')!.textContent!);
    check(saved.notes[2].start === 0.5 && saved.notes[2].duration === 0.5, 'whole beat creation');
    button('+ 음표 추가').click();
    await wait();
    nr = n1.getBoundingClientRect();
    send(n1, 'pointerdown', nr.x + 12, nr.y + 5);
    send(svg, 'pointerup', nr.x + 12, nr.y + 5);
    await wait();
    key(n1, 'c');
    await wait();
    const sb = svg.getBoundingClientRect();
    send(svg, 'pointerdown', sb.left + 54 + 125, nr.y + 70);
    send(svg, 'pointerup', sb.left + 54 + 125, nr.y + 70);
    await wait();
    key(svg, 'v');
    await wait();
    check(document.querySelectorAll('[data-note-id]').length === 4, 'note keyboard paste');
    button('클립에 적용').click();
    await wait();
    saved = JSON.parse(document.getElementById('saved')!.textContent!);
    check(saved.notes[3].start === 1, 'whole beat paste cell');
    key(svg, 'z');
    await wait();
    check(document.querySelectorAll('[data-note-id]').length === 3, 'undo note paste');
    key(svg, 'z');
    await wait();
    check(document.querySelectorAll('[data-note-id]').length === 2, 'undo note draw');
    document.getElementById('result')!.textContent =
      'PASS: conditional merge, gap tooltip, clip and note Ctrl+C/V/Z, whole-beat drawing and cell placement';
  } catch (e) {
    document.getElementById('result')!.textContent = 'FAIL: ' + String(e);
  }
}, 100);
