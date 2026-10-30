export const event = (
  onset = [0, 1],
  duration = [1, 1],
  notes = [{ pitch: 64, string: 1, fret: 0, drum: null }],
  extra = {},
) => ({ staff: 'main', voice: '1', onset, duration, notes, techniques: [], tie: 'none', ...extra });
export const measure = (number = 1, events = [event()]) => ({
  number,
  page: number,
  meter: [4, 4],
  system: 1,
  bounds: [50,100,950,300],
  events,
});
export const recognitionFixture = () => ({
  bpm: 120,
  key: 0,
  parts: [
    {
      id: 'p1',
      name: 'Guitar 1',
      instrument: 'guitar',
      capo: 0,
      measures: [
        measure(1, [
          event([0, 1], [1, 3]),
          event([1, 3], [1, 3]),
          event([2, 3], [1, 3]),
          event([1, 1], [3, 1], undefined, { tie: 'start', techniques: ['palm-mute'] }),
        ]),
        measure(2, [event([0, 1], [4, 1], undefined, { tie: 'stop' })]),
      ],
    },
    {
      id: 'p2',
      name: 'Guitar 2',
      instrument: 'guitar',
      capo: 0,
      measures: [
        measure(1, [
          event([0, 1], [4, 1], [{ pitch: 66, string: 1, fret: 2, drum: null }], {
            techniques: ['bend'],
          }),
        ]),
        measure(2, []),
      ],
    },
    {
      id: 'p3',
      name: 'Drums',
      instrument: 'drums',
      capo: 0,
      measures: [
        measure(1, [
          event([0, 1], [1, 1], [{ pitch: 42, string: null, fret: null, drum: 'closed-hihat' }], {
            staff: 'upper',
          }),
          event([0, 1], [1, 1], [{ pitch: 36, string: null, fret: null, drum: 'kick' }], {
            staff: 'lower',
          }),
        ]),
        measure(2, []),
      ],
    },
    {
      id: 'p4',
      name: 'Keys',
      instrument: 'piano',
      capo: 0,
      measures: [
        measure(1, [
          event([0, 1], [4, 1], [{ pitch: 72, string: null, fret: null, drum: null }], {
            staff: 'right',
          }),
          event([0, 1], [4, 1], [{ pitch: 48, string: null, fret: null, drum: null }], {
            staff: 'left',
          }),
        ]),
        measure(2, []),
      ],
    },
  ],
  warnings: [],
});
