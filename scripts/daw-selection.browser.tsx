import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TrackTimeline } from '../packages/app/src/components/TrackTimeline.web';
import { MidiClipEditor } from '../packages/app/src/components/MidiClipEditor.web';
const blank = { notes: [], duration: 2 };
const initial: import('../packages/app/src/lib/practiceClips').TimelineTrack[] = [
  {
    id: 't',
    name: 'MIDI',
    kind: 'midi' as const,
    instrument: 'acoustic_grand_piano' as const,
    volume: 1,
    muted: false,
    url: '',
    duration: 0,
    offset: 0,
    clips: [
      {
        id: 'a',
        name: 'a.mid',
        blob: new Blob(),
        url: '',
        offset: 0,
        sourceStart: 0,
        duration: 2,
        midi: blank,
      },
      {
        id: 'b',
        name: 'b.mid',
        blob: new Blob(),
        url: '',
        offset: 3,
        sourceStart: 0,
        duration: 2,
        midi: blank,
      },
    ],
  },
];
let play = 0,
  record = 0,
  pasted = 0;
export function App() {
  const [tracks, setTracks] = useState(initial);
  const [editor, setEditor] = useState(false);
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
        onEditMidi={() => setEditor(true)}
        onCreateMidi={noop}
        onReorder={noop}
        onPatch={noop}
        onPatchClip={(id, patch) =>
          setTracks((all) =>
            all.map((t) => ({
              ...t,
              clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            })),
          )
        }
        onPasteClips={(items, position) => {
          pasted++;
          document.getElementById('paste')!.textContent = JSON.stringify({
            items: items.map((i) => i.clip.id),
            position,
          });
        }}
        onClipDuration={noop}
        onMoveClip={(id, targetId, offset) =>
          setTracks((all) =>
            all.map((track) => ({
              ...track,
              clips: track.clips?.map((clip) => (clip.id === id ? { ...clip, offset } : clip)),
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
          setTracks((all) => all.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })))
        }
        onRemove={noop}
        solo={null}
        onSolo={noop}
        armed="t"
        onArm={noop}
        onImportClip={noop}
        publishing={null}
        transport={{
          position: 4,
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
          onPlay: () => {
            play++;
          },
          onStop: noop,
          onRewind: noop,
          onRecord: () => {
            record++;
          },
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
      {editor && (
        <MidiClipEditor
          name="test"
          bpm={120}
          sequence={{
            duration: 20,
            notes: [
              { id: 'n1', pitch: 60, start: 0, duration: 0.5, velocity: 100, channel: 0 },
              { id: 'n2', pitch: 64, start: 1, duration: 0.5, velocity: 100, channel: 0 },
            ],
          }}
          onClose={() => setEditor(false)}
          onSave={(seq) =>
            (document.getElementById('midi-result')!.textContent = JSON.stringify(seq))
          }
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
setTimeout(async () => {
  const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
  const check = (v: unknown, m: string) => {
    if (!v) throw Error(m);
  };
  const button = (text: string) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
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
  try {
    await wait();
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: ' ', code: 'Space' }),
    );
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'r', code: 'KeyR' }),
    );
    check(play === 1 && record === 1, 'shortcuts');
    const bpmInput = document.querySelector('input')!;
    bpmInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'r', code: 'KeyR' }));
    check(record === 1, 'input shortcut interference');
    let a = document.querySelector('[data-selection-id=a]')!;
    const b = document.querySelector('[data-selection-id=b]')!;
    let r = a.getBoundingClientRect();
    send(a, 'pointerdown', r.x + 20, r.y + 25);
    await wait();
    send(a, 'pointerup', r.x + 20, r.y + 25);
    await wait();
    r = b.getBoundingClientRect();
    send(b, 'pointerdown', r.x + 20, r.y + 25, { ctrlKey: true });
    await wait();
    check(button('2개 클립 선택'), 'clip multi-select');
    const oldA = a.getBoundingClientRect();
    const oldB = b.getBoundingClientRect();
    send(a, 'pointerdown', oldA.x + 20, oldA.y + 25);
    await wait();
    send(a, 'pointermove', oldA.x + 68, oldA.y + 25);
    await wait();
    await wait();
    send(a, 'pointerup', oldA.x + 68, oldA.y + 25);
    await wait();
    check(
      Math.abs(a.getBoundingClientRect().x - oldA.x - 48) < 1 &&
        Math.abs(b.getBoundingClientRect().x - oldB.x - 48) < 1,
      'clip group movement',
    );
    document
      .querySelector('.studio-heading')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await wait();
    check(!button('2개 클립 선택'), 'outside click clears selection');
    r = a.getBoundingClientRect();
    send(a, 'pointerdown', r.x + 20, r.y + 25);
    await wait();
    send(a, 'pointerup', r.x + 20, r.y + 25);
    await wait();
    r = b.getBoundingClientRect();
    send(b, 'pointerdown', r.x + 20, r.y + 25, { ctrlKey: true });
    await wait();
    button('클립 복사하기').click();
    await wait();
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'v', ctrlKey: true }),
    );
    await wait();
    check(
      pasted === 1 && JSON.parse(document.getElementById('paste')!.textContent!).position === 4,
      'clip paste',
    );
    r = b.getBoundingClientRect();
    send(b, 'pointerdown', r.right - 2, r.y + 20);
    await wait();
    send(b, 'pointermove', r.right + 46, r.y + 20);
    await wait();
    send(b, 'pointerup', r.right + 46, r.y + 20);
    await wait();
    check(
      document.querySelector('[data-selection-id=b]')!.getBoundingClientRect().width > r.width,
      'MIDI clip resize',
    );
    const lane =
      document.querySelector('.studio-lane') ||
      document.querySelector('[data-selection-id=a]')!.parentElement!;
    const lr = lane.getBoundingClientRect();
    send(lane, 'pointerdown', lr.x + 8, lr.bottom - 5);
    await wait();
    send(document.querySelector('.studio-timeline')!, 'pointermove', lr.x + 300, lr.y + 5);
    await wait();
    check(document.querySelector('.studio-selection-box'), 'clip marquee missing');
    send(document.querySelector('.studio-timeline')!, 'pointerup', lr.x + 300, lr.y + 5);
    await wait();
    check(button('2개 클립 선택'), 'marquee selects clips');
    a = document.querySelector('[data-selection-id=a]')!;
    a.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await wait();
    check(document.querySelector('dialog[open]'), 'open midi');
    const svg = document.querySelector('.studio-midi-roll svg')!;
    const n1 = document.querySelector('[data-note-id=n1]')!,
      n2 = document.querySelector('[data-note-id=n2]')!;
    r = n1.getBoundingClientRect();
    send(n1, 'pointerdown', r.x + r.width / 2, r.y + 5);
    send(svg, 'pointerup', r.x + r.width / 2, r.y + 5);
    await wait();
    r = n2.getBoundingClientRect();
    send(n2, 'pointerdown', r.x + 15, r.y + 5, { ctrlKey: true });
    await wait();
    check(
      document.querySelector('dialog')!.textContent!.includes('2개 음표 선택'),
      'note ctrl selection',
    );
    const originalN1 = n1.getBoundingClientRect();
    const originalN2 = n2.getBoundingClientRect();
    send(n1, 'pointerdown', originalN1.x + originalN1.width / 2, originalN1.y + 5);
    await wait();
    send(svg, 'pointermove', originalN1.x + originalN1.width / 2 + 48, originalN1.y - 11);
    await wait();
    send(svg, 'pointerup', originalN1.x + originalN1.width / 2 + 48, originalN1.y - 11);
    await wait();
    check(
      Math.abs(n1.getBoundingClientRect().x - originalN1.x - 48) < 1 &&
        Math.abs(n2.getBoundingClientRect().x - originalN2.x - 48) < 1 &&
        Math.abs(n2.getBoundingClientRect().y - originalN2.y + 16) < 1,
      'note group movement',
    );
    button('음표 복사하기').click();
    await wait();
    check(button('음표 붙여넣기').disabled, 'paste without cell');
    r = n1.getBoundingClientRect();
    send(svg, 'pointerdown', r.x + 180, r.y + 38);
    send(svg, 'pointerup', r.x + 180, r.y + 38);
    await wait();
    check(!button('음표 붙여넣기').disabled, 'cell anchor');
    button('음표 붙여넣기').click();
    await wait();
    check(document.querySelectorAll('[data-note-id]').length === 4, 'note copies');
    const roll = document.querySelector('.studio-midi-roll')! as HTMLDivElement;
    const before = roll.scrollTop;
    send(svg, 'pointerdown', r.x + 300, r.y + 70, { pointerType: 'touch' });
    send(svg, 'pointermove', r.x + 240, r.y + 10, { pointerType: 'touch' });
    send(svg, 'pointerup', r.x + 240, r.y + 10, { pointerType: 'touch' });
    await wait();
    check(roll.scrollTop > before, 'touch pan');
    const sr = svg.getBoundingClientRect();
    send(svg, 'pointerdown', sr.left + 350, roll.getBoundingClientRect().top + 200, {
      pointerType: 'touch',
    });
    send(svg, 'pointerup', sr.left + 350, roll.getBoundingClientRect().top + 200, {
      pointerType: 'touch',
    });
    await wait();
    send(svg, 'pointerdown', sr.left + 350, roll.getBoundingClientRect().top + 200, {
      pointerType: 'touch',
    });
    send(svg, 'pointermove', sr.left + 450, roll.getBoundingClientRect().top + 300, {
      pointerType: 'touch',
    });
    await wait();
    check(
      document.querySelector('.studio-midi-roll .studio-selection-box'),
      'touch double-tap marquee',
    );
    send(svg, 'pointerup', sr.left + 450, roll.getBoundingClientRect().top + 300, {
      pointerType: 'touch',
    });
    await wait();
    const nb = [...document.querySelectorAll('[data-note-id]')].map((n) =>
      n.getBoundingClientRect(),
    );
    const left = Math.min(...nb.map((b) => b.left)),
      right = Math.max(...nb.map((b) => b.right)),
      top = Math.min(...nb.map((b) => b.top)),
      bottom = Math.max(...nb.map((b) => b.bottom));
    send(svg, 'pointerdown', left + 1, bottom + 12);
    send(svg, 'pointermove', right + 12, top - 12);
    await wait();
    check(
      document.querySelector('dialog')!.textContent!.includes('4개 음표 선택'),
      'note rectangle selects notes',
    );
    roll.scrollLeft = 0;
    const scrollBefore = roll.scrollLeft;
    const rb = roll.getBoundingClientRect();
    send(svg, 'pointermove', rb.right + 50, rb.bottom + 40);
    await wait(300);
    if (roll.scrollWidth > roll.clientWidth)
      check(roll.scrollLeft > scrollBefore, 'marquee auto scroll');
    send(svg, 'pointerup', rb.right + 50, rb.bottom + 40);
    document.getElementById('result')!.textContent =
      'PASS: shortcuts, group clip/note movement, selection clearing, copy/paste, MIDI resizing and touch selection';
  } catch (e) {
    document.getElementById('result')!.textContent = 'FAIL: ' + String(e);
  }
}, 100);
