import type { Prisma } from '../generated/prisma/client.js';

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.map(row) : []);
const text = (value: unknown) => (typeof value === 'string' ? value : '');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export type NotificationEvent = {
  kind: string;
  entityId: string;
  message: string;
  recipientIds?: string[];
  metadata: Prisma.InputJsonObject;
};

// Derive semantic events from committed document changes, never from client-supplied recipients.
export function documentEvents(key: string, before: unknown, after: unknown): NotificationEvent[] {
  const previous = rows(before),
    next = rows(after);
  const events: NotificationEvent[] = [];
  const add = (
    kind: string,
    item: Row,
    message: string,
    metadata: Prisma.InputJsonObject = {},
    recipientIds?: string[],
  ) =>
    events.push({
      kind,
      entityId: text(item.id),
      message,
      metadata: { title: text(item.title), ...metadata },
      recipientIds,
    });
  if (key === 'recommendations' || key === 'songs') {
    for (const item of next)
      if (!previous.some((old) => old.id === item.id))
        add(
          key === 'songs' ? 'SONG_ADOPTED' : 'RECOMMENDATION',
          item,
          key === 'songs' ? '곡이 참여곡으로 채택됐어요.' : '새로운 곡을 추천했어요.',
        );
  } else if (key === 'rehearsals') {
    for (const old of previous)
      if (
        !old.cancelled &&
        (!next.some((item) => item.id === old.id) ||
          next.some((item) => item.id === old.id && item.cancelled))
      )
        add('REHEARSAL_CANCELLED', old, '합주 일정이 취소됐어요.', {
          date: text(old.date),
          start: text(old.start),
          place: text(old.place),
        });
    for (const item of next) {
      if (item.cancelled) continue;
      const old = previous.find((value) => value.id === item.id);
      if (!old || old.cancelled) add('REHEARSAL', item, '새 합주 일정이 등록됐어요.');
      else {
        const fields = ['date', 'start', 'end', 'place', 'songIds', 'title'];
        const changed = fields.filter((field) => !same(old[field], item[field]));
        if (changed.length)
          add('REHEARSAL_UPDATED', item, '합주 일정이 변경됐어요.', {
            changed,
            date: text(item.date),
            start: text(item.start),
            place: text(item.place),
          });
      }
    }
  } else if (/^session\/[\w-]+\/members$/.test(key)) {
    if (before !== undefined && !same(before, after))
      add(
        'REHEARSAL_UPDATED',
        { id: key.split('/')[1] },
        '합주 참여 멤버가 변경됐어요.',
        { changed: ['members'] },
        [
          ...new Set(
            [
              ...(Array.isArray(before) ? before : []),
              ...(Array.isArray(after) ? after : []),
            ].filter((id): id is string => typeof id === 'string'),
          ),
        ],
      );
  } else {
    const match = key.match(/^song\/([\w-]+)\/(discussion|feedback|score|soundtrack)$/);
    if (!match) return events;
    const [, songId, type] = match;
    if (type === 'discussion' || type === 'feedback') {
      for (const item of next) {
        const old = previous.find((value) => value.id === item.id);
        if (!old)
          add(
            type === 'feedback' || typeof item.time === 'number'
              ? 'TRACK_FEEDBACK'
              : 'SONG_OPINION',
            { id: songId },
            type === 'feedback' ? '새로운 트랙 피드백을 남겼어요.' : '새로운 곡 의견을 남겼어요.',
            {
              focusId: text(item.id),
              excerpt: text(item.text).slice(0, 160),
              ...(typeof item.time === 'number' && Number.isFinite(item.time)
                ? { time: Math.max(0, item.time) }
                : {}),
            },
          );
        for (const reply of rows(item.replies))
          if (!rows(old?.replies).some((value) => value.id === reply.id))
            add(
              'SONG_REPLY',
              { id: songId },
              '내 의견에 답글을 남겼어요.',
              {
                focusId: text(reply.id),
                parentId: text(item.id),
                excerpt: text(reply.text).slice(0, 160),
              },
              [text(item.authorId)],
            );
      }
    } else if (!same(before, after)) {
      // Score/track endpoints are explicit band sharing; personal drafts never pass here.
      const meaningful =
        type === 'score'
          ? !same(before, after)
          : !same(
              {
                tracks: row(before).tracks ?? [],
                bpm: row(before).bpm,
                signature: row(before).signature,
              },
              {
                tracks: row(after).tracks ?? [],
                bpm: row(after).bpm,
                signature: row(after).signature,
              },
            );
      if (meaningful)
        add(
          type === 'score' ? 'SCORE_SHARED' : 'TRACKS_SHARED',
          { id: songId },
          type === 'score' ? '제작 악보를 공유했어요.' : '사운드 트랙 변경사항을 공유했어요.',
        );
    }
  }
  return events;
}

export async function writeNotificationEvents(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  actorId: string,
  events: NotificationEvent[],
) {
  if (!events.length) return;
  const members = await tx.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  const memberIds = new Set(members.map((member) => member.userId));
  const songsDoc = await tx.workspaceDocument.findUnique({
    where: { workspaceId_key: { workspaceId, key: 'songs' } },
  });
  const songs = rows(row(songsDoc?.value).data);
  const profile = await tx.profile.findUnique({
    where: { id: actorId },
    select: { displayName: true },
  });
  const actorName = profile?.displayName || '밴드 멤버';
  const data: Prisma.NotificationCreateManyInput[] = [];
  const emitted = new Set<string>();
  for (const event of events) {
    const song = songs.find((item) => item.id === event.entityId);
    const songEvent = [
      'SONG_OPINION',
      'SONG_REPLY',
      'TRACK_FEEDBACK',
      'SCORE_SHARED',
      'TRACKS_SHARED',
      'PDF_SHARED',
    ].includes(event.kind);
    if (songEvent && !song) continue;
    let recipients =
      event.recipientIds ??
      (songEvent && song?.participants !== undefined
        ? Object.keys(row(song.participants))
        : [...memberIds]);
    let eventMetadata = event.metadata;
    if (event.kind.startsWith('REHEARSAL')) {
      const assignment = await tx.workspaceDocument.findUnique({
        where: { workspaceId_key: { workspaceId, key: `session/${event.entityId}/members` } },
      });
      const selected = row(assignment?.value).data;
      if (!event.recipientIds && Array.isArray(selected) && selected.length)
        recipients = selected.filter((id): id is string => typeof id === 'string');
      if (!eventMetadata.title) {
        const rehearsals = await tx.workspaceDocument.findUnique({
          where: { workspaceId_key: { workspaceId, key: 'rehearsals' } },
        });
        eventMetadata = {
          ...eventMetadata,
          title: text(
            rows(row(rehearsals?.value).data).find((item) => item.id === event.entityId)?.title,
          ),
        };
      }
    }
    for (const userId of new Set(recipients)) {
      if (userId === actorId || !memberIds.has(userId)) continue;
      const eventKey = `${userId}/${event.kind}/${event.entityId}/${event.metadata.focusId ?? ''}/${event.metadata.assetId ?? ''}`;
      if (emitted.has(eventKey)) continue;
      emitted.add(eventKey);
      data.push({
        workspaceId,
        userId,
        kind: event.kind,
        entityId: event.entityId,
        message: `${actorName} · ${event.message}`.slice(0, 500),
        metadata: {
          ...eventMetadata,
          actorId,
          actorName,
          ...(songEvent ? { title: text(song?.title) } : {}),
        },
      });
    }
  }
  if (data.length) await tx.notification.createMany({ data });
}
