import { useEffect, useRef, useState } from 'react';
import { api, serverConfigured } from '../lib/remote';
import { readMedia } from '../lib/mediaStore';
import { ActionButton, FlexRow, Meta } from './ProductUI';
type Source = { id: string; name: string; mime?: string; type?: string; blob?: Blob };
export function PracticeSources({
  scopeKey,
  workspaceId,
  disabled,
  onAdd,
}: {
  scopeKey: string;
  workspaceId: string;
  disabled: boolean;
  onAdd: (blob: Blob, name: string) => void;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function load() {
    setBusy(true);
    setMessage('');
    setOpen(true);
    try {
      const items = serverConfigured
        ? await api<Source[]>(
            `/assets?${new URLSearchParams({ scope: `song/${scopeKey}`, workspaceId })}`,
          )
        : ((await readMedia<Source[]>(`library/song/${scopeKey}`)) ?? []);
      if (alive.current) {
        const audio = items.filter(
          (item) =>
            (item.mime ?? item.type ?? '').startsWith('audio/') ||
            /\.(mp3|wav|m4a|ogg|flac|aac|webm)$/i.test(item.name),
        );
        setSources(audio);
        if (!audio.length) setMessage('곡 자료에 음원이 없어요. 자료 탭에 음원을 추가해주세요.');
      }
    } catch {
      if (alive.current) setMessage('자료를 불러오지 못했어요. 다시 시도해주세요.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function add(source: Source) {
    setBusy(true);
    setMessage('');
    try {
      let blob = source.blob;
      if (serverConfigured) {
        const { url } = await api<{ url: string }>(
          `/assets/${encodeURIComponent(source.id)}/download`,
        );
        const response = await fetch(url);
        if (!response.ok) throw new Error();
        blob = await response.blob();
      }
      if (!blob || blob.size > 104857600) throw new Error();
      if (alive.current) {
        onAdd(blob, source.name);
        setAdded((all) => [...all, source.id]);
        setMessage(`${source.name}을 연습 트랙에 추가했어요.`);
      }
    } catch {
      if (alive.current)
        setMessage('음원을 가져오지 못했어요. 접근 권한과 파일 크기(100MB 이하)를 확인해주세요.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <ActionButton
        secondary
        disabled={disabled || busy}
        onPress={() => (open ? setOpen(false) : void load())}
      >
        {busy ? '음원 불러오는 중…' : open ? '곡 자료 음원 접기' : '곡 자료에서 음원 가져오기'}
      </ActionButton>
      {open &&
        sources.map((source) => (
          <FlexRow wrap key={source.id}>
            <Meta style={{ flex: 1 }}>{source.name}</Meta>
            <ActionButton
              secondary
              compact
              disabled={disabled || busy || added.includes(source.id)}
              onPress={() => void add(source)}
            >
              {added.includes(source.id) ? '추가됨' : '연습에 사용'}
            </ActionButton>
          </FlexRow>
        ))}
      {!!message && <Meta accessibilityLiveRegion="polite">{message}</Meta>}
    </>
  );
}
