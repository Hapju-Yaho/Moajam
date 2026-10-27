import { scoreInstrument, type Score } from './score';

export function mixerInstrumentAppearance(score: Score, part: string) {
  const id = scoreInstrument(score, part).id;
  if (id === 'drums') return { kind: 'drums', color: '#c790d7' };
  if (id === 'piano' || id === 'pianoBass') return { kind: 'keyboard', color: '#77b5d8' };
  if (id.startsWith('bass')) return { kind: 'guitar', color: '#86bfa0' };
  if (id === 'guitar' || id === 'dropD' || id === 'guitarHalfDown')
    return {
      kind: 'guitar',
      color: /electric|일렉/i.test(`${score.playbackInstruments?.[part] ?? ''} ${part}`)
        ? '#d88b91'
        : '#d6b477',
    };
  return { kind: 'vocal', color: '#88c6d2' };
}
