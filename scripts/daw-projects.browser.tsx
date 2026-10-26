import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureRemote } from '../packages/app/src/lib/remote-client';
import { BandDawProjects } from '../packages/app/src/components/BandDawProjects.web';
import { PracticeStudioSession } from '../packages/app/src/components/PracticeStudio.web';
import { MockAppStateProvider } from '../packages/app/src/state/MockAppState';
import { readMedia } from '../packages/app/src/lib/mediaStore.web';
import { projectMediaKey, type BandDawProject } from '../packages/app/src/lib/bandDawProjects';

configureRemote({ apiUrl: '/api/v1', demo: true });
const workspace = `test-band-${Date.now()}`;
const song = 'test-song';
const rows = () => readMedia<BandDawProject[]>(`daw-project-list/${workspace}/${song}`, 'm1');
const data = (id: string) => readMedia<{ tracks: unknown[] }>(projectMediaKey(workspace, id), 'm1');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MockAppStateProvider>
      <BandDawProjects
        workspaceId={workspace}
        songId={song}
        title="원래 곡 이름"
        renderStudio={(project, generation, navigation) => (
          <PracticeStudioSession
            key={`${project.id}/${generation}`}
            scopeKey={`${workspace}/${song}`}
            mediaKey={projectMediaKey(workspace, project.id)}
            projectId={project.id}
            onSeekProject={navigation.onSeekProject}
          />
        )}
      />
    </MockAppStateProvider>
  </StrictMode>,
);
const wait = async (condition: () => unknown | Promise<unknown>) => {
  for (let i = 0; i < 300; i++) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw Error('Timed out waiting for UI');
};
const click = (text: string, parent: ParentNode = document) => {
  const button = [...parent.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === text,
  );
  if (!button || button.disabled) throw Error('Missing or disabled button: ' + text);
  button.click();
};
const enter = (value: string, label = '프로젝트 이름') => {
  const input = document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!input) throw Error('Missing input: ' + label);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const panel = () =>
  (document.querySelector<HTMLElement>('.daw-project-delete-dialog') ??
    document.querySelector<HTMLElement>('.daw-project-dialog'))!;
const name = () => document.querySelector('.daw-project-name')?.textContent;
const tick = () => new Promise((resolve) => setTimeout(resolve, 80));
const addTrack = async () => {
  await wait(() => {
    const button = document.querySelector<HTMLButtonElement>('[aria-label="트랙 추가"]');
    return button && !button.disabled;
  });
  document.querySelector<HTMLButtonElement>('[aria-label="트랙 추가"]')!.click();
  await wait(() => document.querySelector('[aria-label="트랙 종류 선택"]'));
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>('[aria-label="트랙 종류 선택"] button'),
  ].find((element) => element.textContent?.includes('오디오 트랙'));
  if (!button) throw Error('Missing audio track choice');
  button.click();
  await tick();
};
void (async () => {
  try {
    await wait(() => document.body.textContent?.includes('새 프로젝트를 생성해 주세요.'));
    if (document.querySelector('.studio-transport'))
      throw Error('Transport rendered without a project');
    click('새 프로젝트');
    await wait(panel);
    enter('첫 작업');
    await tick();
    click('생성', panel());
    await wait(() => name() === '첫 작업');
    await wait(() => document.querySelector('[aria-label="트랙 추가"]'));
    const first = (await rows())![0];
    await wait(() => document.querySelector<HTMLButtonElement>('.daw-project-save')?.disabled);
    document.querySelector<HTMLButtonElement>('.daw-project-name')!.click();
    await wait(() => document.querySelector('[aria-label="현재 프로젝트 이름"]'));
    enter('첫 작업 수정', '현재 프로젝트 이름');
    await tick();
    document.querySelector<HTMLInputElement>('[aria-label="현재 프로젝트 이름"]')!.blur();
    await tick();
    if ((await rows())![0].name !== '첫 작업') throw Error('Name persisted before Save');
    click('서버에 저장', document.querySelector('.daw-project-actions')!);
    await wait(async () => (await rows())![0].name === '첫 작업 수정');
    await tick();
    await addTrack();
    await wait(
      () =>
        name()?.includes('*') &&
        !document.querySelector<HTMLButtonElement>('.daw-project-save')?.disabled,
    );
    click('다른 이름으로 저장');
    await wait(panel);
    enter('복사한 작업');
    await tick();
    click('저장', panel());
    await wait(() => panel()?.textContent?.includes('기존 작업을 저장하시겠습니까?'));
    click('저장하지 않고 계속', panel());
    await wait(() => name() === '복사한 작업');
    const second = (await rows())!.find((row) => row.name === '복사한 작업')!;
    if ((await data(first.id))!.tracks.length !== 0)
      throw Error('Save As modified the original without permission');
    if ((await data(second.id))!.tracks.length !== 1) throw Error('Save As lost the unsaved track');
    await wait(() => document.querySelector('[aria-label="트랙 추가"]'));
    await addTrack();
    click('다른 이름으로 저장');
    await wait(panel);
    enter('기존도 저장');
    await tick();
    click('저장', panel());
    await wait(() => panel()?.textContent?.includes('기존 작업을 저장하시겠습니까?'));
    click('저장 후 계속', panel());
    await wait(() => name() === '기존도 저장');
    const third = (await rows())!.find((row) => row.name === '기존도 저장')!;
    if ((await data(second.id))!.tracks.length !== 2 || (await data(third.id))!.tracks.length !== 2)
      throw Error('Save-and-copy did not preserve both projects');
    await wait(() => [...document.querySelectorAll<HTMLButtonElement>('.daw-project-actions button')].some(button => button.textContent?.trim() === '프로젝트 선택' && !button.disabled));
    click('프로젝트 선택');
    await wait(panel);
    click('첫 작업 수정', panel());
    await wait(() => name() === '첫 작업 수정');
    await wait(() => document.querySelector('[aria-label="트랙 추가"]'));
    const count = (await rows())!.length;
    const blocker = (event: Event) => event.preventDefault();
    window.addEventListener('moajam:before-navigate', blocker);
    click('새 프로젝트');
    await wait(panel);
    enter('전환 차단');
    await tick();
    click('생성', panel());
    await tick();
    if ((await rows())!.length !== count) throw Error('Navigation guard bypassed');
    window.removeEventListener('moajam:before-navigate', blocker);
    click('취소', panel());
    for (const action of ['새 프로젝트', '다른 이름으로 저장']) {
      click(action);
      await wait(panel);
      enter('첫 작업 수정');
      await tick();
      if (!panel().textContent?.includes('같은 이름 프로젝트가 존재합니다.'))
        throw Error('Missing duplicate-name hint');
      if (!panel().querySelector<HTMLButtonElement>('footer button:last-child')?.disabled)
        throw Error('Duplicate name submission enabled');
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      await wait(() => !panel());
    }
    click('프로젝트 선택');
    await wait(panel);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await wait(() => !panel());
    click('프로젝트 선택');
    await wait(panel);
    const remove = (title: string) =>
      document.querySelector<HTMLButtonElement>(`[aria-label="${title} 삭제"]`)!.click();
    const selectionDialog = document.querySelector('.daw-project-select-dialog');
    remove('기존도 저장');
    await wait(() => panel()?.textContent?.includes('정말 삭제'));
    if (
      document.querySelector('.daw-project-select-dialog') !== selectionDialog ||
      !selectionDialog?.querySelector('.daw-project-list')
    )
      throw Error('Selection dialog disappeared during delete confirmation');
    click('취소', panel());
    await wait(() => panel()?.textContent?.includes('프로젝트 선택'));
    if ((await rows())!.length !== 3) throw Error('Delete cancel removed a project');
    remove('기존도 저장');
    await wait(() => panel()?.textContent?.includes('정말 삭제'));
    click('삭제', panel());
    await wait(async () => (await rows())!.length === 2);
    await wait(() => document.querySelector('[aria-label="첫 작업 수정 삭제"]'));
    remove('첫 작업 수정');
    await wait(() => panel()?.textContent?.includes('정말 삭제'));
    click('삭제', panel());
    await wait(() => name() === '복사한 작업');
    await wait(() => {
      const button = document.querySelector<HTMLButtonElement>('[aria-label="복사한 작업 삭제"]');
      return button && !button.disabled;
    });
    remove('복사한 작업');
    await wait(() => panel()?.textContent?.includes('정말 삭제'));
    click('삭제', panel());
    await wait(async () => (await rows())!.length === 0);
    await wait(() => document.body.textContent?.includes('새 프로젝트를 생성해 주세요.'));
    click('닫기', panel());
    document.getElementById('result')!.textContent =
      'PASS: save state and dirty marker, duplicate-name blocking, outside dismiss, confirmed deletion, Save As and project navigation';
  } catch (error) {
    document.getElementById('result')!.textContent =
      'FAIL: ' + (error instanceof Error ? error.stack : String(error));
  }
})();
