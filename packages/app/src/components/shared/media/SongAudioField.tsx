import type { SongAudio } from '@lib/songAudio';
import { Meta } from '@component/shared/ui/ProductUI';
export function SongAudioField(_props: { songId: string; value: SongAudio | null; onChange: (value: SongAudio | null) => void; onBusy: (busy: boolean) => void }) {
  return <Meta>곡 음원 업로드는 웹에서 사용할 수 있어요.</Meta>;
}
