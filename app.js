(() => {
  const STORAGE_KEY = 'mathAlarm.v1';

  const pad2 = (n) => String(n).padStart(2, '0');
  const nowHm = () => {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { time: '', enabled: false, lastTriggeredDay: '' };
      const parsed = JSON.parse(raw);
      return {
        time: typeof parsed.time === 'string' ? parsed.time : '',
        enabled: Boolean(parsed.enabled),
        lastTriggeredDay: typeof parsed.lastTriggeredDay === 'string' ? parsed.lastTriggeredDay : '',
      };
    } catch {
      return { time: '', enabled: false, lastTriggeredDay: '' };
    }
  };

  const saveState = (state) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const createBeep = () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    const osc = ctx.createOscillator();

    osc.type = 'sine';
    osc.frequency.value = 880;

    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);

    let intervalId = null;

    const start = async () => {
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch { }
      }
      osc.start();

      let on = false;
      intervalId = window.setInterval(() => {
        on = !on;
        gain.gain.value = on ? 0.18 : 0.0001;
      }, 320);
    };

    const stop = async () => {
      if (intervalId) window.clearInterval(intervalId);
      intervalId = null;
      gain.gain.value = 0.0001;
      try { osc.stop(); } catch { }
      try { await ctx.close(); } catch { }
    };

    return { start, stop };
  };

  const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const genTask = () => {
    const ops = ['+', '-', '×'];
    const op = ops[rng(0, ops.length - 1)];

    let a = rng(2, 20);
    let b = rng(2, 20);

    if (op === '-') {
      if (b > a) [a, b] = [b, a];
    }

    if (op === '×') {
      a = rng(2, 12);
      b = rng(2, 12);
    }

    const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;
    return { expr: `${a} ${op} ${b} =`, answer };
  };

  const initAlarmPage = () => {
    const timeEl = document.getElementById('alarmTime');
    const setBtn = document.getElementById('setAlarm');
    const clearBtn = document.getElementById('clearAlarm');
    const statusEl = document.getElementById('alarmStatus');

    const modal = document.getElementById('alarmModal');
    const taskExprEl = document.getElementById('taskExpr');
    const taskAnswerEl = document.getElementById('taskAnswer');
    const taskSubmitBtn = document.getElementById('taskSubmit');
    const taskHintEl = document.getElementById('taskHint');

    if (!timeEl || !setBtn || !clearBtn || !statusEl || !modal || !taskExprEl || !taskAnswerEl || !taskSubmitBtn || !taskHintEl) {
      return;
    }

    let state = loadState();
    let beep = null;

    const renderStatus = () => {
      if (!state.enabled || !state.time) {
        statusEl.textContent = 'Будильник не установлен.';
        return;
      }
      statusEl.textContent = `Будильник установлен на ${state.time}.`;
    };

    const openModal = async () => {
      modal.classList.add('isOpen');
      modal.setAttribute('aria-hidden', 'false');

      let required = 3;
      let correct = 0;
      let current = genTask();

      const renderTask = () => {
        taskExprEl.textContent = current.expr;
        taskAnswerEl.value = '';
        taskHintEl.textContent = `Верных ответов: ${correct} из ${required}`;
        taskAnswerEl.focus();
      };

      const submit = () => {
        const v = Number(String(taskAnswerEl.value).trim());
        if (!Number.isFinite(v)) {
          taskAnswerEl.focus();
          return;
        }

        if (v === current.answer) {
          correct += 1;
          if (correct >= required) {
            closeModal();
            stopAlarm();
            return;
          }
          current = genTask();
          renderTask();
          return;
        }

        current = genTask();
        renderTask();
      };

      const onKey = (e) => {
        if (e.key === 'Enter') submit();
      };

      taskSubmitBtn.onclick = submit;
      taskAnswerEl.onkeydown = onKey;

      renderTask();

      try {
        if (!beep) beep = createBeep();
        if (beep) await beep.start();
      } catch { }
    };

    const closeModal = () => {
      modal.classList.remove('isOpen');
      modal.setAttribute('aria-hidden', 'true');
    };

    const stopAlarm = async () => {
      state.enabled = false;
      saveState(state);
      renderStatus();
      closeModal();
      if (beep) {
        const b = beep;
        beep = null;
        try { await b.stop(); } catch { }
      }
    };

    timeEl.value = state.time || '';
    renderStatus();

    setBtn.addEventListener('click', () => {
      const v = String(timeEl.value || '').trim();
      if (!v) return;
      state.time = v;
      state.enabled = true;
      saveState(state);
      renderStatus();
    });

    clearBtn.addEventListener('click', () => {
      state = { time: '', enabled: false, lastTriggeredDay: '' };
      saveState(state);
      timeEl.value = '';
      renderStatus();
    });

    window.setInterval(() => {
      state = loadState();

      if (!state.enabled || !state.time) return;

      const cur = nowHm();
      if (cur !== state.time) return;

      const day = todayKey();
      if (state.lastTriggeredDay === day) return;

      state.lastTriggeredDay = day;
      saveState(state);

      openModal();
    }, 1000);
  };

  const initClockPage = () => {
    const digital = document.getElementById('digitalClock');
    const h = document.getElementById('hHand');
    const m = document.getElementById('mHand');
    const s = document.getElementById('sHand');

    if (!digital || !h || !m || !s) return;

    const tick = () => {
      const d = new Date();
      const hh = d.getHours();
      const mm = d.getMinutes();
      const ss = d.getSeconds();

      digital.textContent = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;

      const secDeg = ss * 6;
      const minDeg = (mm + ss / 60) * 6;
      const hourDeg = ((hh % 12) + mm / 60) * 30;

      s.style.transform = `translateY(-50%) rotate(${secDeg}deg)`;
      m.style.transform = `translateY(-50%) rotate(${minDeg}deg)`;
      h.style.transform = `translateY(-50%) rotate(${hourDeg}deg)`;
    };

    tick();
    window.setInterval(tick, 250);
  };

  document.addEventListener('DOMContentLoaded', () => {
    initAlarmPage();
    initClockPage();
  });
})();
