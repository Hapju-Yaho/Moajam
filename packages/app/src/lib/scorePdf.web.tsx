import { renderToStaticMarkup } from 'react-dom/server';
import { jsPDF } from 'jspdf';
import { GuitarStaff } from '../components/GuitarStaff.web';
import { pitchName, scoreInstrument, scoreMeasureCount, type Score } from './score';

const ignore = () => {};
export function scorePdfMarkup(
  score: Score,
  part: string,
  showTab: boolean,
  layoutWidth = 800,
): string {
  // Share the editor's effective drawing width, without its selection or cursor.
  if (!Number.isFinite(layoutWidth) || layoutWidth <= 0) layoutWidth = 800;
  return renderToStaticMarkup(
    <GuitarStaff
      score={score}
      part={part}
      selected={null}
      hasSelection={false}
      onDeselect={ignore}
      selectedString={1}
      cursor={null}
      playbackBeat={null}
      zoom={100}
      layoutWidth={layoutWidth}
      onSelect={ignore}
      onAppend={ignore}
      onChordSelect={ignore}
      emptyBeat={0}
      inputBeats={1}
      showTab={showTab}
      rangeIds={[]}
      onRangeSelect={ignore}
      editable={false}
    />,
  );
}

export function fitPdfSystem(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('악보 줄의 크기를 계산하지 못했어요.');
  const scale = Math.min(182 / width, 224 / height);
  return { width: width * scale, height: height * scale };
}

async function rasterize(svg: SVGSVGElement): Promise<HTMLCanvasElement> {
  const width = svg.viewBox.baseVal.width,
    height = svg.viewBox.baseVal.height;
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg
    .querySelectorAll(
      '.score-chord-placeholder, .score-duration-preview, .score-range-highlight, .score-cell-cursor',
    )
    .forEach((node) => node.remove());
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('악보 이미지를 만들지 못했어요. 다시 시도해주세요.'));
      image.src = url;
    });
    const size = fitPdfSystem(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size.width * 10); // About 254 dpi on the printed page.
    canvas.height = Math.ceil(size.height * 10);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서 PDF 이미지를 만들 수 없어요.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function header(score: Score, part: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1820;
  canvas.height = 320;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PDF 제목을 만들지 못했어요.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#1d3028';
  context.textAlign = 'center';
  context.fillStyle = '#9aaa9d';
  context.font = '18px Arial, sans-serif';
  context.fillText('M O A J A M  S C O R E', canvas.width / 2, 30);
  context.fillStyle = '#394b40';
  context.font = '600 62px Georgia, "Malgun Gothic", serif';
  context.fillText(score.title || '제목 없는 악보', canvas.width / 2, 118, canvas.width);
  const instrument = scoreInstrument(score, part);
  context.font = '28px Arial, "Malgun Gothic", sans-serif';
  context.fillText(`${part} · ${instrument.label}`, canvas.width / 2, 185, canvas.width);
  context.fillStyle = '#8a988e';
  context.font = '24px Arial, "Malgun Gothic", sans-serif';
  if (instrument.tuning.length)
    context.fillText(
      `튜닝 ${[...instrument.tuning].reverse().map(pitchName).join(' – ')} · 음높이를 유지하며 운지를 표시합니다`,
      canvas.width / 2,
      242,
      canvas.width,
    );
  return canvas;
}

export async function createScorePdf(
  score: Score,
  parts: string[],
  showTab: boolean,
  layoutWidth = 800,
): Promise<Blob> {
  if (!parts.length || parts.some((part) => !score.parts.includes(part)))
    throw new Error('PDF에 저장할 파트를 선택해주세요.');
  if (parts.reduce((sum, part) => sum + scoreMeasureCount(score, part), 0) > 800)
    throw new Error(
      '한 번에 800마디까지 PDF로 저장할 수 있어요. 파트별로 저장하거나 악보를 나눠주세요.',
    );
  await document.fonts.ready;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({ title: score.title || '나의 악보', creator: 'Moajam' });
  let first = true;
  for (const part of parts) {
    const container = document.createElement('div');
    container.innerHTML = scorePdfMarkup(score, part, showTab, layoutWidth);
    const error = container.querySelector('[role="alert"]');
    if (error) throw new Error(error.textContent || '악보를 표시하지 못했어요.');
    const systems = [...container.querySelectorAll<SVGSVGElement>('svg.score-system')];
    if (!systems.length) throw new Error('저장할 악보 줄이 없어요.');
    const heading = header(score, part);
    let y = 48;
    const addPage = () => {
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(heading, 'PNG', 14, 12, 182, 32);
      y = 48;
    };
    addPage();
    for (const svg of systems) {
      const size = fitPdfSystem(svg.viewBox.baseVal.width, svg.viewBox.baseVal.height);
      if (y + size.height > 277) addPage();
      const canvas = await rasterize(svg);
      pdf.addImage(canvas, 'PNG', 14, y, size.width, size.height);
      y += size.height + (14 * size.width) / svg.viewBox.baseVal.width;
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text(`MOAJAM  |  ${page} / ${pages}`, 105, 288, { align: 'center' });
  }
  return pdf.output('blob');
}
