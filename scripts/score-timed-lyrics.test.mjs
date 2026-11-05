import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { moduleUrl } from './load-typescript.mjs';
const { scoreTimedLyrics, layoutScoreTimedLyrics } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreTimedLyrics.ts', import.meta.url))
);
const { GuitarStaff } = await import(
  moduleUrl(new URL('../packages/app/src/components/score-editor/GuitarStaff.web.tsx', import.meta.url))
);
const { ScoreEnsemble } = await import(moduleUrl(new URL('../packages/app/src/components/score-editor/ScoreEnsemble.web.tsx', import.meta.url)));

test('explicit lyric line breaks stack at the same beat rather than moving to the next system', () => {
  const systems = [{ start:0, end:4, xAt:beat=>beat*80 }, { start:4, end:8, xAt:beat=>(beat-4)*80 }];
  const lines = layoutScoreTimedLyrics([{ section:0, start:1, end:8, text:'첫 줄\n둘째 줄\n셋째 줄' }], systems);
  assert.deepEqual(lines[0].map(line => [line.text,line.x,line.row]), [['첫 줄',80,0],['둘째 줄',80,1],['셋째 줄',80,2]]);
  assert.equal(lines[1].length, 0);
});

test('keyboard grand staff continues lyrics across systems once, below the lower staff', () => {
  const score={title:'Keyboard',bpm:120,parts:['Right','Left'],instruments:{Right:'piano',Left:'piano'},keyboardStaves:{Right:'Left'},sync:{},notes:['Right','Left'].flatMap(part=>Array.from({length:8},(_,i)=>({id:`${part}-${i}`,part,pitch:part==='Right'?64:48,beats:4,rest:false,accent:false,chord:'',lyric:'',tones:[{pitch:part==='Right'?64:48}]})))};
  const text='가나다라마바사아자차카타파하'.repeat(10);
  const html=renderToStaticMarkup(createElement(ScoreEnsemble,{score,parts:score.parts,part:'Right',selected:null,hasSelection:false,onDeselect(){},selectedString:1,cursor:null,playbackBeat:null,zoom:100,onSelect(){},onAppend(){},onChordSelect(){},emptyBeat:0,inputBeats:1,showTab:false,rangeIds:[],onRangeSelect(){},editable:false,layoutWidth:800,timedLyrics:[{section:0,start:0,end:32,text}]}));
  const pieces=[...html.matchAll(/<text[^>]*data-timed-lyric="0"[^>]*>([^<]*)<\/text>/g)].map(match=>match[1]);
  assert.equal(pieces.join(''),text);
  assert.ok(pieces.length>1);
});

test('timed lyrics use beat positions regardless of BPM, excluding missing cues and stale lyrics', () => {
  const lyrics = 'First\nline\n\nSecond\n\nNot recorded';
  const document = {
    version: 1,
    lyrics,
    tracks: {
      metronome: {
        bpm: 50,
        meter: [4, 4],
        cues: [
          { section: 0, beat: 1 },
          { section: 1, beat: 9 },
        ],
      },
    },
  };
  const result = scoreTimedLyrics(document, lyrics);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, 'First\nline');
  assert.equal(result[0].start, 1);
  assert.equal(result[0].end, 9);
  assert.deepEqual(
    scoreTimedLyrics(
      { ...document, tracks: { metronome: { ...document.tracks.metronome, bpm: 200 } } },
      lyrics,
    ),
    result,
  );
  assert.deepEqual(scoreTimedLyrics(document, 'changed'), []);
});

test('long lyrics flow to later score lines without losing text or passing next cue', () => {
  const text = '가나다라마바사아자차카타파하';
  const systems = [
    { start: 0, end: 4, xAt: (beat) => beat * 20 },
    { start: 4, end: 8, xAt: (beat) => (beat - 4) * 20 },
    { start: 8, end: 12, xAt: (beat) => (beat - 8) * 20 },
  ];
  const lines = layoutScoreTimedLyrics(
    [
      { section: 0, start: 1, end: 7, text },
      { section: 1, start: 7, end: 12, text: '다음' },
    ],
    systems,
  );
  const first = lines.flat().filter((row) => row.section === 0);
  assert.equal(first.map((row) => row.text).join(''), text);
  assert.ok(lines[1].some((row) => row.section === 0));
  assert.ok(!lines[2].some((row) => row.section === 0));
  assert.ok(lines[1].filter((row) => row.section === 0).every((row) => row.x + row.width <= 60));
});

test('SVG staff renders timed lyrics in TAB gap and below drum staff', () => {
  const render = (instrument) => {
    const score = {
      title: 'Test',
      bpm: 120,
      parts: ['Part'],
      instruments: { Part: instrument },
      sync: {},
      notes: Array.from({ length: 8 }, (_, i) => ({
        id: `n${i}`,
        part: 'Part',
        pitch: instrument === 'drums' ? 36 : 64,
        beats: 4,
        rest: false,
        accent: false,
        chord: '',
        lyric: '',
        tones: instrument === 'drums' ? [{ pitch: 36 }] : [{ pitch: 64, string: 1, fret: 0 }],
      })),
    };
    return renderToStaticMarkup(
      createElement(GuitarStaff, {
        score,
        part: 'Part',
        selected: null,
        hasSelection: false,
        onDeselect() {},
        selectedString: 1,
        cursor: null,
        playbackBeat: null,
        zoom: 100,
        onSelect() {},
        onAppend() {},
        onChordSelect() {},
        emptyBeat: 0,
        inputBeats: 1,
        showTab: instrument !== 'drums',
        tabOnly: false,
        rangeIds: [],
        onRangeSelect() {},
        editable: false,
        layoutWidth: 800,
        timedLyrics: [
          { section: 0, start: 0, end: 20, text: 'Recorded lyrics' },
          { section: 1, start: 20, end: 32, text: 'Later lyrics' },
        ],
      }),
    );
  };
  for (const instrument of ['guitar', 'drums', 'piano']) {
    const html = render(instrument);
    assert.match(html, /data-timed-lyric="0"/);
    assert.match(html, /Recorded lyrics/);
    const y = Number(html.match(/<text[^>]*y="([\d.]+)"[^>]*data-timed-lyric="0"/)[1]);
    assert.ok(y > 150);
    assert.match(html, /data-timed-lyric="1"/);
  }
});
