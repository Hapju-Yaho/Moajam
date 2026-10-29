/* global fetch, WebSocket */
import { setTimeout } from 'node:timers';
import { spawn } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { resolve } from 'node:path';
const url =
  process.env.SCORE_TEST_URL ||
  'http://127.0.0.1:5188/scripts/score-playback-clock.browser.html?backing';
const debugPort = process.env.SCORE_DEBUG_PORT || '9227';
const child = spawn(
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + resolve('.tmp/score-clock-browser-' + process.pid),
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let socket;
try {
  let tab;
  for (let i = 0; i < 50; i++) {
    try {
      tab = await (
        await fetch('http://127.0.0.1:' + debugPort + '/json/new?' + encodeURIComponent(url), {
          method: 'PUT',
        })
      ).json();
      break;
    } catch {
      await pause(200);
    }
  }
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => socket.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const m = JSON.parse(event.data);
    if (m.id) {
      pending.get(m.id)?.(m.result);
      pending.delete(m.id);
    }
  });
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      socket.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    expression = expression.replace(/"\[aria-label="([^"]+)"\]"/g, (_, label) =>
      JSON.stringify('[aria-label="' + label + '"]'),
    );
    const r = await call('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (!r) return null;
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  const wait = async (expr) => {
    for (let i = 0; i < 180; i++) {
      if (await evaluate(`Boolean(${expr})`)) return;
      await pause(100);
    }
    throw Error('Timeout: ' + expr + ' body: ' + (await evaluate('document.body.innerText')));
  };
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await wait('window.scorePlaybackClockTest && document.querySelector("[data-metronome-beat]")');
  const rows = await evaluate('document.querySelectorAll("[data-score-system-viewport]").length');
  const api = 'window.scorePlaybackClockTest';
  await evaluate(`${api}.seek(0.25)`);
  await pause(400);
  const renders = await evaluate(`${api}.renders()`);
  await evaluate(`(() => {
    window.__scoreSvg = document.querySelector('.score-system');
    window.__scoreCacheReads = 0;
    const root = document.querySelector('.score-systems');
    const query = root.querySelectorAll;
    root.querySelectorAll = function(selector) {
      if (selector === '[data-playback-measure]') window.__scoreCacheReads++;
      return query.call(this, selector);
    };
  })()`);
  for (const beat of [1.25, 2.25]) {
    await evaluate(`${api}.seek(${beat})`);
    await pause(100);
  }
  if (
    !(await evaluate(
      `window.__scoreCacheReads === 0 && window.__scoreSvg === document.querySelector('.score-system')`,
    ))
  )
    throw Error('Beat updates rebuilt the score or playback DOM cache');
  for (const beat of [4.25, 20.25, 300.25, 0.25]) {
    await evaluate(`${api}.seek(${beat})`);
    await pause(350);
    const info = await evaluate(
      `({bar:document.querySelector('[data-playing-measure=true]')?.getAttribute('aria-label'),current:document.querySelector('.score-mixer-bars [data-current=true]')?.title,activeNotes:document.querySelectorAll('[data-playing-note=true]').length,cursors:document.querySelectorAll('[data-playback-cursor]').length,visible:document.querySelectorAll('.score-system').length,transport:document.querySelector('.score-transport-location').textContent})`,
    );
    if (!info.bar?.startsWith(String(Math.floor(beat / 4) + 1))) throw Error(JSON.stringify(info));
    if (!info.current?.startsWith(String(Math.floor(beat / 4) + 1)))
      throw Error('Mixer ' + JSON.stringify(info));
    if (info.visible >= rows / 2 || info.activeNotes !== 0 || info.cursors !== 0)
      throw Error('Virtualization/highlight ' + JSON.stringify(info));
    if (!info.transport.startsWith(String(Math.floor(beat / 4) + 1)))
      throw Error('Transport ' + JSON.stringify(info));
    console.log('PASS seek', beat, info);
  }
  if ((await evaluate(`${api}.renders()`)) !== renders)
    throw Error('Clock rerendered the editor parent');
  const measure = async (mode) => {
    await evaluate(`${api}.start(0,${mode === 'loop'})`);
    await pause(800);
    const parent = await evaluate(`${api}.renders()`);
    await evaluate(
      `${api}.durations.length=0;window.__gaps=[];window.__last=0;window.__running=true;requestAnimationFrame(function tick(t){if(window.__last)window.__gaps.push(t-window.__last);window.__last=t;if(window.__running)requestAnimationFrame(tick);})`,
    );
    await pause(mode === 'loop' ? 5000 : 4000);
    const result = await evaluate(
      `(()=>{window.__running=false;const a=${api}.durations.slice().sort((a,b)=>a-b),g=window.__gaps.slice().sort((a,b)=>a-b);return {commits:a.length,reactMean:a.reduce((x,y)=>x+y,0)/(a.length||1),reactMax:a.at(-1)||0,frameP95:g[Math.floor(g.length*.95)]||0,frameMax:g.at(-1)||0,parent:${api}.renders(),reference:document.querySelector('[data-reference-time]')?.textContent};})()`,
    );
    if (result.parent !== parent) throw Error('Parent changed ' + JSON.stringify(result));
    return result;
  };
  console.log(
    JSON.stringify({ normal: await measure('normal'), loop: await measure('loop') }, null, 2),
  );
  await evaluate(`${api}.stop()`);
  await pause(150);
  if (
    await evaluate(
      `document.querySelectorAll('[data-playing-measure=true],[data-playing-note=true],[data-playback-cursor][visibility=visible]').length`,
    )
  )
    throw Error('Stale playback DOM');
  console.log(
    'PASS: independent readouts, virtual row transitions, loop return, stop cleanup; no parent playback renders',
  );
} finally {
  socket?.close();
  child.kill();
}
