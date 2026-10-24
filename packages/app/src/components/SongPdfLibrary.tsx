import { Meta } from './ProductUI';
export function SongPdfLibrary({ title }: { songId: string; title: string; assetId?: string }) {
  return <Meta>{title} PDF 악보는 웹 곡 상세에서 열 수 있어요.</Meta>;
}
