import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TrackTimeline } from '../packages/app/src/components/TrackTimeline.web';
import { MidiClipEditor } from '../packages/app/src/components/MidiClipEditor.web';
import { ClipLibrary } from '../packages/app/src/components/ClipLibrary.web';
import { renderMidi } from '../packages/app/src/lib/midiAudio.web';
import { encodeMidi, type MidiSequence } from '../packages/app/src/lib/midi';
import {
  savePersonalClip,
  deletePersonalClip,
} from '../packages/app/src/lib/personalClipLibrary.web';
import type { TimelineClip, TimelineTrack } from '../packages/app/src/lib/practiceClips';
const ignore = () => {};
export function Fixture() {
  const [tracks, setTracks] = useState<TimelineTrack[]>([]);
  const [editing, setEditing] = useState<TimelineClip | null>(null);
  const blank: MidiSequence = { notes: [], duration: 2 };
  return (
    <>
      <TrackTimeline
        tracks={tracks}
        loaded
        saveLabel="테스트"
        error=""
        onUpload={(files, id) => {
          document.getElementById('result')!.dataset.upload = id + ':' + files[0]?.name;
        }}
        onAdd={(kind) =>
          setTracks((all) => [
            ...all,
            {
              id: 'track-' + all.length,
              name: kind === 'midi' ? '미디 트랙' : '오디오 트랙',
              kind,
              instrument: 'acoustic_grand_piano',
              volume: 1,
              muted: false,
              url: '',
              duration: 0,
              offset: 0,
              clips: [],
            },
          ])
        }
        onCreateMidi={(id) => {
          const clip = {
            id: 'midi-clip',
            name: '테스트.mid',
            blob: encodeMidi(blank),
            url: '',
            offset: 0,
            sourceStart: 0,
            duration: 2,
            midi: blank,
          };
          setTracks((all) => all.map((t) => (t.id === id ? { ...t, clips: [clip] } : t)));
          setEditing(clip);
        }}
        onEditMidi={setEditing}
        onPatch={(id, patch) =>
          setTracks((all) => all.map((t) => (t.id === id ? { ...t, ...patch } : t)))
        }
        onPatchClip={ignore}
        onClipDuration={ignore}
        onMoveClip={ignore}
        onMoveToNewTrack={ignore}
        onSave={ignore}
        onRefresh={ignore}
        refreshing={false}
        saving={false}
        dirty={false}
        onSplitClip={ignore}
        onRemoveClip={ignore}
        onRemove={ignore}
        solo={null}
        onSolo={ignore}
        armed={null}
        onArm={ignore}
        onImportClip={ignore}
        publishing={null}
        transport={{
          position: 0,
          duration: 2,
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
          onPlay: ignore,
          onStop: ignore,
          onRewind: ignore,
          onRecord: ignore,
          onSeek: ignore,
          onBpm: ignore,
          onSignature: ignore,
          onMetronome: ignore,
          onStandalone: ignore,
          onClickVolume: ignore,
          onCountIn: ignore,
          onMasterVolume: ignore,
          loop: false,
          loopStart: 0,
          loopEnd: 0,
          onLoop: ignore,
          onLoopStart: ignore,
          onLoopEnd: ignore,
        }}
      />
      {editing?.midi && (
        <MidiClipEditor
          name={editing.name}
          sequence={editing.midi}
          bpm={120}
          onClose={() => setEditing(null)}
          onSave={(midi) => {
            setTracks((all) =>
              all.map((t) => ({
                ...t,
                clips: t.clips?.map((c) =>
                  c.id === editing.id
                    ? { ...c, midi, blob: encodeMidi(midi), duration: midi.duration }
                    : c,
                ),
              })),
            );
            setEditing(null);
          }}
        />
      )}
      <ClipLibrary version={0} />
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
const wait = async (test: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (test()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('UI wait timeout');
};
const check = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label,
  )!;
void (async () => {
  try {
    await wait(() => !!document.querySelector('[aria-label="트랙 추가"]'));
    (document.querySelector('[aria-label="트랙 추가"]') as HTMLButtonElement).click();
    await wait(() => !!button('미디 트랙'));
    check(button('오디오 트랙'), '트랙 선택 창에 오디오 트랙이 있어야 합니다.');
    button('미디 트랙').click();
    await wait(() => !!document.querySelector('[aria-label="미디 트랙 악기 종류"]'));
    const group = document.querySelector<HTMLSelectElement>('[aria-label="미디 트랙 악기 종류"]')!;
    group.value = '베이스';
    group.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(
      () =>
        document.querySelector<HTMLSelectElement>('[aria-label="미디 트랙 가상악기"]')?.value ===
        'acoustic_bass',
    );
    button('+ 미디 클립').click();
    await wait(() => !!document.querySelector('dialog[open]'));
    button('+ 음표 추가').click();
    await wait(() => button('+ 음표 추가').getAttribute('aria-pressed') === 'true');
    check(
      document.querySelectorAll('.studio-midi-roll rect[role="button"]').length === 0,
      '추가 토글은 음표를 즉시 생성하지 않아야 합니다.',
    );
    const rollSvg = document.querySelector<SVGSVGElement>('.studio-midi-roll svg')!;
    const rollBounds = document.querySelector('.studio-midi-roll')!.getBoundingClientRect();
    const svgBounds = rollSvg.getBoundingClientRect();
    // Synthetic pointer events do not register an active pointer with the browser.
    const capture = rollSvg.setPointerCapture;
    rollSvg.setPointerCapture = () => {};
    rollSvg.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: svgBounds.left + 78,
        clientY: rollBounds.top + 100,
      }),
    );
    rollSvg.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 1,
        button: 0,
        clientX: svgBounds.left + 78,
        clientY: rollBounds.top + 100,
      }),
    );
    rollSvg.setPointerCapture = capture;
    await wait(
      () => document.querySelectorAll('.studio-midi-roll rect[role="button"]').length === 1,
    );
    button('클립에 적용').click();
    await wait(() => !document.querySelector('dialog[open]'));
    const clip = document.querySelector('.studio-clip')!;
    check(clip.querySelector('.studio-midi-preview'), '미디 클립은 음표를 표시해야 합니다.');
    clip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await wait(() => !!document.querySelector('dialog[open]'));
    button('취소').click();
    const data = {
      duration: 0.5,
      notes: [{ id: 'a', pitch: 60, start: 0, duration: 0.25, velocity: 100, channel: 0 }],
    };
    const id = 'browser-midi-' + crypto.randomUUID();
    await savePersonalClip({
      id,
      ownerId: 'm1',
      name: '검증.mid',
      blob: encodeMidi(data),
      type: 'audio/midi',
      kind: 'midi',
    });
    await wait(
      () => !!document.querySelector('[data-clip-library]')?.textContent?.includes('검증.mid'),
    );
    check(
      ![...document.querySelectorAll('[data-clip-library] strong')]
        .find((item) => item.textContent === '검증.mid')
        ?.parentElement?.parentElement?.querySelector('audio'),
      '미디 보관 항목에는 오디오 플레이어가 없어야 합니다.',
    );
    check(
      ![...document.querySelectorAll('[data-clip-library] strong')]
        .find((item) => item.textContent === '검증.mid')
        ?.parentElement?.parentElement?.querySelector('input[type="range"]'),
      '미디 보관 항목에는 재생 바가 없어야 합니다.',
    );
    await deletePersonalClip('m1', id);
    const audio = await renderMidi(data, 'acoustic_grand_piano');
    check(
      audio.getChannelData(0).some((value) => Math.abs(value) > 0.0001),
      '기존 가상악기로 미디 소리가 생성되어야 합니다.',
    );
    document.getElementById('result')!.textContent =
      'PASS: 트랙 선택, 악기 분류, 미디 클립 편집과 더블 클릭, 보관함 재생 UI 숨김, 가상악기 렌더링';
  } catch (error) {
    document.getElementById('result')!.textContent =
      'FAIL: ' + (error instanceof Error ? error.message : String(error));
  }
})();
