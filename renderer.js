const $ = (id) => document.getElementById(id);
const dateEl = $('date');
const timeEl = $('time');
const loopEl = $('loop');
const customEl = $('custom');
const customWrap = $('customWrap');
const startBtn = $('start');
const stopBtn = $('stop');
const statusEl = $('status');

const pad = (n) => String(n).padStart(2, '0');

const now = new Date();
dateEl.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
timeEl.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

loopEl.addEventListener('change', () => {
  customWrap.hidden = loopEl.value !== 'custom';
});

let timer = null;
let startMs = 0;
let endMs = 0;

function getLoopMinutes() {
  if (loopEl.value === 'custom') {
    return Math.max(1, parseInt(customEl.value, 10) || 1);
  }
  return parseInt(loopEl.value, 10);
}

function formatForPS(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function jumpToStart() {
  await window.api.setSystemTime(formatForPS(startMs));
}

async function tick() {
  if (Date.now() >= endMs) {
    try {
      await jumpToStart();
    } catch (err) {
      stopLoop(`Error during loop: ${err.message}`);
      return;
    }
  }
  statusEl.textContent = `Looping ${formatTime(startMs)} → ${formatTime(endMs)} · now ${formatTime(Date.now())}`;
}

function stopLoop(message) {
  if (timer) clearInterval(timer);
  timer = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  if (message) statusEl.textContent = message;
}

startBtn.addEventListener('click', async () => {
  if (!dateEl.value || !timeEl.value) {
    statusEl.textContent = 'Pick a date and time first.';
    return;
  }
  const [y, m, d] = dateEl.value.split('-').map(Number);
  const [hh, mm] = timeEl.value.split(':').map(Number);
  const start = new Date(y, m - 1, d, hh, mm, 0, 0);
  startMs = start.getTime();
  endMs = startMs + getLoopMinutes() * 60_000;

  try {
    await jumpToStart();
  } catch (err) {
    statusEl.textContent = `Failed to set time: ${err.message}. Run as Administrator.`;
    return;
  }

  startBtn.disabled = true;
  stopBtn.disabled = false;
  timer = setInterval(tick, 500);
  tick();
});

stopBtn.addEventListener('click', () => stopLoop('Stopped.'));

window.api.onCssChanged?.(() => {
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const url = new URL(link.href);
    url.searchParams.set('t', Date.now());
    link.href = url.toString();
  }
});
