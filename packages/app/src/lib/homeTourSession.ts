// Manual replay is independent of the persistent first-visit records.
const replayRequests = new Set<string>();
export function requestHomeTourReplay(user: string) {
  replayRequests.add(user);
}
export function consumeHomeTourReplay(user: string) {
  const requested = replayRequests.has(user);
  replayRequests.delete(user);
  return requested;
}
