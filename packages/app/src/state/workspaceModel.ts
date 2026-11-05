import type { Preparation, Workspace } from '@mocks/workspaces';

export function personalSongs(workspaces: Workspace[], userId = 'm1') {
  return workspaces.flatMap((band) =>
    band.adoptedSongs
      .filter((song) => !song.archived && (!song.participants || !!song.participants[userId]))
      .map((song) => ({
        ...summarizeSong(song, userId),
        workspaceId: band.id,
        bandName: band.name,
        bandColor: band.color,
      })),
  );
}

export function personalRehearsals(workspaces: Workspace[]) {
  return workspaces
    .flatMap((band) =>
      band.rehearsals
        .filter((event) => !event.cancelled)
        .map((event) => ({
          ...event,
          workspaceId: band.id,
          bandName: band.name,
          bandColor: band.color,
        })),
    )
    .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
}

export function setSongPreparation(
  band: Workspace,
  songId: string,
  status: Preparation,
  userId = 'm1',
): Workspace {
  return {
    ...band,
    adoptedSongs: band.adoptedSongs.map((song) => {
      if (
        song.id !== songId ||
        (song.participants
          ? song.participants[userId]?.status === status || !song.participants[userId]
          : song.myStatus === status)
      )
        return song;
      if (song.participants)
        return summarizeSong(
          {
            ...song,
            participants: {
              ...song.participants,
              [userId]: { part: song.participants[userId]?.part ?? song.myPart, status },
            },
          },
          userId,
        );
      const ready = Math.max(
        0,
        Math.min(
          song.total,
          song.ready + Number(status === 'READY') - Number(song.myStatus === 'READY'),
        ),
      );
      return {
        ...song,
        myStatus: status,
        ready,
        status: ready === song.total ? 'READY' : 'PRACTICING',
      };
    }),
  };
}

export function summarizeSong(song: Workspace['adoptedSongs'][number], userId = 'm1') {
  if (!song.participants) return song;
  const participants = Object.values(song.participants);
  const ready = participants.filter((part) => part.status === 'READY').length;
  return {
    ...song,
    ready,
    total: participants.length,
    status:
      ready > 0 && ready === participants.length ? ('READY' as const) : ('PRACTICING' as const),
    myPart: song.participants[userId]?.part ?? '',
    myStatus: song.participants[userId]?.status ?? ('NOT_READY' as const),
  };
}

export function normalizeWorkspace(band: Workspace, userId = 'm1'): Workspace {
  return {
    ...band,
    adoptedSongs: band.adoptedSongs.map((song) => {
      if (song.participants)
        return summarizeSong(
          {
            ...song,
            participants: Object.fromEntries(
              Object.entries(song.participants).filter(([id]) =>
                band.members.some((member) => member.id === id),
              ),
            ),
          },
          userId,
        );
      let remaining = Math.max(0, song.ready - Number(song.myStatus === 'READY'));
      return summarizeSong(
        {
          ...song,
          participants: Object.fromEntries(
            band.members.map((member) => [
              member.id,
              {
                part: member.part,
                status:
                  member.id === userId ? song.myStatus : remaining-- > 0 ? 'READY' : 'NOT_READY',
              },
            ]),
          ),
        },
        userId,
      );
    }),
  };
}

export function conflictingRehearsals(events: ReturnType<typeof personalRehearsals>) {
  return events.filter((event, index) =>
    events.some(
      (other, j) =>
        index !== j &&
        event.date === other.date &&
        event.start < other.end &&
        other.start < event.end,
    ),
  );
}
