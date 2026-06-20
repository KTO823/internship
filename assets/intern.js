(() => {
  const storageKey = 'intern-dashboard-v1';
  const formElements = {
    start: document.getElementById('intern-start'),
    end: document.getElementById('intern-end'),
    modeButtons: document.querySelectorAll('[data-mode]'),
    statusText: document.getElementById('intern-status'),
    internStatusSmall: document.getElementById('intern-status-small'),
    internDays: document.getElementById('intern-days'),
    internCompletion: document.getElementById('intern-completion'),
    internCompletionLabel: document.getElementById('intern-completion-label'),
    monthTarget: document.getElementById('month-target'),
    monthlyTargetSummary: document.getElementById('monthly-target-summary'),
    hoursTotal: document.getElementById('hours-total'),
    hoursProgress: document.getElementById('hours-progress'),
    hoursProgressBar: document.getElementById('hours-progress-bar'),
    expenseProgress: document.getElementById('expense-progress'),
    expenseProgressBar: document.getElementById('expense-progress-bar'),
    checklistProgress: document.getElementById('checklist-progress'),
    quickHours: document.getElementById('quick-hours'),
    timerToggle: document.getElementById('timer-toggle'),
    timerLabel: document.getElementById('timer-label'),
    expenseTotalJpy: document.getElementById('expense-total-jpy'),
    expenseTotalNtd: document.getElementById('expense-total-ntd'),
    exchangeRate: document.getElementById('exchange-rate'),
    customExpense: document.getElementById('custom-expense'),
    customExpenseAdd: document.getElementById('custom-expense-add'),
    noteInput: document.getElementById('quick-note'),
    loginUser: document.getElementById('login-user'),
    loginPass: document.getElementById('login-pass'),
    loginSubmit: document.getElementById('login-submit'),
    logoutBtn: document.getElementById('logout-btn'),
    loginStatus: document.getElementById('login-status'),
    saveNote: document.getElementById('save-note'),
    noteList: document.getElementById('note-list'),
    noteSidebar: document.getElementById('note-sidebar'),
    weeklyJournal: document.getElementById('weekly-journal'),
    journalWeekLabel: document.getElementById('journal-week-label'),
    saveJournal: document.getElementById('save-journal'),
    exportPdf: document.getElementById('export-pdf'),
    reminderList: document.getElementById('reminder-list'),
    reminderTitle: document.getElementById('new-reminder-title'),
    reminderDate: document.getElementById('new-reminder-date'),
    addReminder: document.getElementById('add-reminder'),
    checklist: document.getElementById('checklist'),
    exportBtn: document.querySelector('[data-export-btn]'),
    importFile: document.getElementById('import-file'),
  };

  if (!formElements.start) return;

  const defaultState = {
    user: { isLoggedIn: false, name: '' },
    startDate: '',
    endDate: '',
    mode: 'accumulate',
    monthTarget: 160,
    totalHours: 0,
    timerActive: false,
    timerStartMs: null,
    expenseTotalJpy: 0,
    exchangeRate: 0.22,
    notes: [],
    journalText: '',
    reminders: [
      { title: '期末週誌繳交', date: nextDate(31), id: 'r-1' },
      { title: '實習影片完成', date: nextDate(90), id: 'r-2' },
    ],
    checklist: [
      { label: '填寫校外實習機構報到確認單', checked: false, id: 'c-1' },
      { label: '繳交 2026.07 底登機證 / 日本實習報到單', checked: false, id: 'c-2' },
      { label: '繳交 2026.08 國內學年實習報到單', checked: false, id: 'c-3' },
      { label: '繳交 2027.01 國內學期實習報到單', checked: false, id: 'c-4' },
      { label: '2026.12.31 繳交前期實習生工作週誌', checked: false, id: 'c-5' },
      { label: '2027.03.31 繳交實習影片（至少 5 分鐘）', checked: false, id: 'c-6' },
      { label: '2027.05.14 海外實習結束', checked: false, id: 'c-7' },
      { label: '2027.05.15 海外實習回國', checked: false, id: 'c-8' },
      { label: '2027.05.18 提交登機證、週誌、心得報告與滿意度表', checked: false, id: 'c-9' },
      { label: '2027.05.27 實習成果報告發表', checked: false, id: 'c-10' },
    ],
  };

  let state = loadState();
  let timerInterval = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { ...defaultState };
      const saved = JSON.parse(raw);
      return { ...defaultState, ...saved };
    } catch (error) {
      console.warn('讀取實習首頁失敗', error);
      return { ...defaultState };
    }
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function nextDate(offsetDays) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  }

  function formatDayCount(start, end) {
    if (!start || !end) return 0;
    const startMs = new Date(start).setHours(0, 0, 0, 0);
    const endMs = new Date(end).setHours(0, 0, 0, 0);
    const diff = Math.round((endMs - startMs) / 86400000);
    return diff + 1;
  }

  function formatDistance(days) {
    if (days === 0) return '今天是最後一天！';
    if (days < 0) return '實習已結束，記得確認報告。';
    return `距離實習結束還有 ${days} 天`;
  }

  function getWeekNumber(start) {
    if (!start) return null;
    const startMs = new Date(start).setHours(0, 0, 0, 0);
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.round((todayMs - startMs) / 86400000));
    return Math.floor(days / 7) + 1;
  }

  function updateJournalWeek() {
    const weekNumber = getWeekNumber(state.startDate);
    if (!weekNumber) {
      formElements.journalWeekLabel.textContent = '請先設定實習開始日期，即可顯示週誌週次。';
      return;
    }
    formElements.journalWeekLabel.textContent = `實習第 ${weekNumber} 週週誌（從開始日算起）`;
  }

  function updateStatus() {
    const { startDate, endDate, mode } = state;
    const startValue = startDate || '';
    const endValue = endDate || '';
    formElements.start.value = startValue;
    formElements.end.value = endValue;
    formElements.modeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
    });

    if (!startDate || !endDate) {
      formElements.statusText.textContent = '請先設定開始與結束日期。';
      formElements.internDays.textContent = '-';
      formElements.internCompletion.textContent = '0%';
      formElements.internCompletionLabel.textContent = '0%';
      formElements.internStatusSmall.textContent = '請先設定日期';
      return;
    }

    const totalDays = formatDayCount(startDate, endDate);
    const now = new Date().setHours(0, 0, 0, 0);
    const passedDays = Math.max(0, Math.round((now - new Date(startDate).setHours(0, 0, 0, 0)) / 86400000) + 1);

    const progressPercent = Math.min(100, Math.max(0, Math.round((passedDays / totalDays) * 100)));
    formElements.internCompletion.textContent = `${progressPercent}%`;
    formElements.internCompletionLabel.textContent = `${progressPercent}%`;
    formElements.internCompletionLabel.parentElement.style.setProperty('--completion', `${progressPercent}`);
    formElements.internDays.textContent = `${passedDays}/${totalDays} 天`;
    formElements.internStatusSmall.textContent = mode === 'accumulate' ? `已進行 ${passedDays} 天` : formatDistance(Math.round((new Date(endDate).setHours(0, 0, 0, 0) - now) / 86400000));

    if (mode === 'accumulate') {
      formElements.statusText.textContent = `實習第 ${passedDays} 天（共 ${totalDays} 天）`;
    } else {
      const remain = Math.round((new Date(endDate).setHours(0, 0, 0, 0) - now) / 86400000);
      formElements.statusText.textContent = formatDistance(remain);
    }
  }

  function updateLoginUI() {
    const { isLoggedIn, name } = state.user;
    if (isLoggedIn && name) {
      formElements.loginStatus.textContent = `歡迎，${name}。你已登入，資料已自動套用。 `;
      formElements.loginSubmit.classList.add('hidden');
      formElements.logoutBtn.classList.remove('hidden');
      formElements.loginUser.value = name;
      formElements.loginPass.value = '';
    } else {
      formElements.loginStatus.textContent = '請先登入以啟用個人化內容。';
      formElements.loginSubmit.classList.remove('hidden');
      formElements.logoutBtn.classList.add('hidden');
    }
  }

  function updateHours() {
    formElements.monthTarget.value = state.monthTarget;
    if (formElements.monthlyTargetSummary) {
      formElements.monthlyTargetSummary.textContent = state.monthTarget;
    }
    formElements.hoursTotal.textContent = state.totalHours.toFixed(1);
    const percent = Math.min(100, Math.round((state.totalHours / state.monthTarget) * 100));
    formElements.hoursTotal.parentElement.style.setProperty('--progress-percent', `${percent}%`);
    formElements.hoursProgress.textContent = `${percent}%`;
    if (formElements.hoursProgressBar) {
      formElements.hoursProgressBar.style.width = `${percent}%`;
    }
    const message = state.totalHours >= state.monthTarget ? '已達標，記得繼續留存生活記錄。' : `還差 ${Math.max(0, (state.monthTarget - state.totalHours).toFixed(1))} 小時。`;
    formElements.timerLabel.textContent = message;
  }

  // 1. 在 APP 初始化或適當地方加入自動抓取匯率功能
async function fetchExchangeRate() {
  try {
    // 使用免金鑰的公開即時匯率 API
    const response = await fetch('https://open.er-api.com/v6/latest/JPY');
    const data = await response.json();
    
    if (data && data.rates && data.rates.TWD) {
      state.exchangeRate = data.rates.TWD;
      // 同步更新設定頁面的欄位顯示
      if (formElements.exchangeRate) formElements.exchangeRate.value = state.exchangeRate.toFixed(4);
      if (formElements.settingsExchange) formElements.settingsExchange.value = state.exchangeRate.toFixed(4);
      saveState();
      updateExpenses(); // 重新計算台幣
    }
  } catch (error) {
    console.warn('無法即時更新匯率，將採用預設或快取匯率', error);
    // 失敗時保持原快取匯率（例如 0.22），不中斷程式
  }
}

// 2. 修改更新費用的邏輯（移除上限、移除警戒線、移除進度條）
function updateExpenses() {
  // 更新首頁與記帳頁面的日幣與台幣文字顯示
  if (formElements.expenseTotalJpy) {
    formElements.expenseTotalJpy.textContent = `￥${Math.round(state.expenseTotalJpy)}`;
  }
  
  const ntd = Math.round(state.expenseTotalJpy * state.exchangeRate);
  if (formElements.expenseTotalNtd) {
    formElements.expenseTotalNtd.textContent = `NT$${ntd}`;
  }
  
  if (formElements.exchangeRate) {
    formElements.exchangeRate.value = state.exchangeRate;
  }
  
  // 僅顯示純粹當月累計文字，不再計算百分比進度條
  if (formElements.expenseProgress) {
    formElements.expenseProgress.textContent = `￥${Math.round(state.expenseTotalJpy)}`;
  }
  if (formElements.hoursProgressBar) {
    // 如果你有其他進度條，確保不受影響
  }
  
  // 移除舊有的 budget-warning 判定邏輯
  const warning = document.getElementById('budget-warning');
  if (warning) {
    warning.textContent = '費用將自動依據當日匯率換算為台幣顯示。';
  }
}

// 3. 記得在重新渲染（refreshUI 或 init）的開頭調用它
// fetchExchangeRate();

  function createNoteItem(note) {
    const wrapper = document.createElement('div');
    wrapper.className = 'note-row';
    const title = document.createElement('div');
    title.textContent = note.text;
    title.className = 'note-row-text';
    const meta = document.createElement('span');
    meta.className = 'note-row-meta';
    meta.textContent = note.date;
    wrapper.appendChild(title);
    wrapper.appendChild(meta);
    return wrapper;
  }

  function renderNotes() {
    formElements.noteList.innerHTML = '';
    formElements.noteSidebar.innerHTML = '';
    state.notes.slice().reverse().forEach((note) => {
      formElements.noteList.appendChild(createNoteItem(note));
      const item = createNoteItem(note);
      item.classList.add('note-row-small');
      formElements.noteSidebar.appendChild(item);
    });
  }

  function updateChecklistProgress() {
    const checkedCount = state.checklist.filter((item) => item.checked).length;
    const percent = state.checklist.length ? Math.round((checkedCount / state.checklist.length) * 100) : 0;
    if (formElements.checklistProgress) {
      formElements.checklistProgress.textContent = `${percent}%`;
    }
  }

  function renderCharts() {
    const totalHoursPercent = Math.min(100, Math.round((state.totalHours / state.monthTarget) * 100));
    const trendValues = [
      Math.min(100, Math.round(totalHoursPercent * 0.25)),
      Math.min(100, Math.round(totalHoursPercent * 0.45)),
      Math.min(100, Math.round(totalHoursPercent * 0.65)),
      Math.min(100, Math.round(totalHoursPercent * 0.78)),
      Math.min(100, Math.round(totalHoursPercent * 0.88)),
      Math.min(100, Math.round(totalHoursPercent * 0.95)),
      totalHoursPercent,
    ];
    const chart = document.getElementById('hours-trend-chart');
    if (chart) {
      chart.innerHTML = '';
      trendValues.forEach((value, index) => {
        const bar = document.createElement('div');
        bar.className = 'line-bar';
        bar.dataset.label = `週${index + 1}`;
        bar.style.setProperty('--bar-height', `${Math.max(12, value)}%`);
        chart.appendChild(bar);
      });
    }

    const timeline = document.getElementById('timeline-chart');
    if (timeline) {
      const steps = timeline.querySelectorAll('.timeline-step');
      steps.forEach((step, index) => {
        const threshold = (index + 1) * 25;
        step.classList.toggle('timeline-complete', totalHoursPercent >= threshold);
      });
    }
  }

  function renderReminders() {
    formElements.reminderList.innerHTML = '';
    state.reminders.forEach((reminder) => {
      const row = document.createElement('div');
      row.className = 'reminder-row';
      const title = document.createElement('div');
      title.textContent = reminder.title;
      const date = document.createElement('span');
      date.textContent = reminder.date;
      date.className = 'reminder-date';
      const days = Math.round((new Date(reminder.date).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
      const badge = document.createElement('span');
      badge.className = 'reminder-badge';
      badge.textContent = days < 0 ? '已過期' : `還剩 ${days} 天`;
      row.appendChild(title);
      row.appendChild(date);
      row.appendChild(badge);
      formElements.reminderList.appendChild(row);
    });
  }

  function renderChecklist() {
    formElements.checklist.innerHTML = '';
    state.checklist.forEach((item) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'check-item';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = item.checked;
      input.addEventListener('change', () => {
        item.checked = input.checked;
        saveState();
      });
      const text = document.createElement('span');
      text.textContent = item.label;
      wrapper.appendChild(input);
      wrapper.appendChild(text);
      formElements.checklist.appendChild(wrapper);
    });
  }

  function renderJournal() {
    formElements.weeklyJournal.value = state.journalText || '';
  }

  function applyListeners() {
    formElements.start.addEventListener('change', (event) => {
      state.startDate = event.target.value;
      saveState();
      updateStatus();
    });

    formElements.end.addEventListener('change', (event) => {
      state.endDate = event.target.value;
      saveState();
      updateStatus();
    });

    formElements.modeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.mode = button.dataset.mode;
        saveState();
        updateStatus();
      });
    });

    formElements.monthTarget.addEventListener('change', (event) => {
      state.monthTarget = Number(event.target.value) || 160;
      saveState();
      updateHours();
    });

    document.querySelectorAll('[data-add-hours]').forEach((button) => {
      button.addEventListener('click', () => {
        const delta = Number(button.dataset.addHours) || 0;
        state.totalHours = Math.max(0, state.totalHours + delta);
        saveState();
        updateHours();
      });
    });

    formElements.quickHours.addEventListener('change', () => {
      const value = Number(formElements.quickHours.value) || 0;
      state.totalHours = Math.max(0, state.totalHours + value);
      saveState();
      updateHours();
    });

    formElements.timerToggle.addEventListener('click', () => {
      if (state.timerActive) {
        stopTimer();
      } else {
        startTimer();
      }
    });

    formElements.exchangeRate.addEventListener('change', (event) => {
      state.exchangeRate = Number(event.target.value) || 0.22;
      saveState();
      updateExpenses();
    });

    document.querySelectorAll('[data-expense]').forEach((button) => {
      button.addEventListener('click', () => {
        const amount = Number(button.dataset.expense) || 0;
        const label = button.dataset.label || '紀帳';
        addExpense(amount, label);
      });
    });

    formElements.customExpenseAdd.addEventListener('click', () => {
      const amount = Number(formElements.customExpense.value) || 0;
      if (amount <= 0) return;
      addExpense(amount, '自訂');
      formElements.customExpense.value = '';
    });

    formElements.saveNote.addEventListener('click', () => {
      const text = formElements.noteInput.value.trim();
      if (!text) return;
      const note = {
        text,
        date: new Date().toLocaleString('zh-Hant', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      };
      state.notes.push(note);
      formElements.noteInput.value = '';
      saveState();
      renderNotes();
    });

    formElements.weeklyJournal.addEventListener('input', () => {
      state.journalText = formElements.weeklyJournal.value;
      saveState();
    });

    formElements.loginSubmit.addEventListener('click', () => {
      const username = formElements.loginUser.value.trim();
      if (!username) {
        formElements.loginStatus.textContent = '請輸入使用者名稱後再登入。';
        return;
      }
      state.user = { isLoggedIn: true, name: username };
      saveState();
      updateLoginUI();
    });

    formElements.logoutBtn.addEventListener('click', () => {
      state.user = { isLoggedIn: false, name: '' };
      saveState();
      updateLoginUI();
    });

    formElements.saveJournal.addEventListener('click', () => {
      saveState();
      alert('週誌內容已儲存。');
    });

    formElements.exportPdf.addEventListener('click', () => {
      const weekText = formElements.journalWeekLabel.textContent;
      const journalText = formElements.weeklyJournal.value.trim();
      const previewHtml = `
        <html>
          <head>
            <title>週誌格式預覽</title>
            <style>
              body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 32px; color: #2a2621; background: #f8f4ec; }
              h1 { margin-top:0; font-size:28px; }
              p { margin:0 0 16px; color:#5f554b; }
              .content { white-space: pre-wrap; line-height:1.7; font-size:16px; padding:20px; background:#fff; border:1px solid #ddd; border-radius:16px; }
            </style>
          </head>
          <body>
            <h1>${weekText}</h1>
            <p>可直接使用瀏覽器列印成 PDF，或將此頁面存成檔案備份。</p>
            <div class="content">${journalText || '尚未輸入週誌內容。'}</div>
          </body>
        </html>`;
      const previewWindow = window.open('', '_blank');
      if (previewWindow) {
        previewWindow.document.write(previewHtml);
        previewWindow.document.close();
      } else {
        alert('請允許彈出視窗後再試一次。');
      }
    });

    formElements.addReminder.addEventListener('click', () => {
      const title = formElements.reminderTitle.value.trim();
      const date = formElements.reminderDate.value;
      if (!title || !date) return;
      state.reminders.push({ title, date, id: `r-${Date.now()}` });
      formElements.reminderTitle.value = '';
      formElements.reminderDate.value = '';
      saveState();
      renderReminders();
    });

    formElements.exportBtn.addEventListener('click', downloadState);
    formElements.importFile.addEventListener('change', handleImport);

    document.body.addEventListener('keydown', (event) => {
      if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveState();
        alert('已儲存實習紀錄。');
      }
    });
  }

  function addExpense(amount, label) {
    state.expenseTotalJpy = Math.max(0, state.expenseTotalJpy + amount);
    saveState();
    updateExpenses();
    if (navigator.vibrate) navigator.vibrate(20);
    const message = document.getElementById('expense-feedback');
    if (message) {
      message.textContent = `${label} ￥${amount} 已記帳。`;
      setTimeout(() => { message.textContent = ''; }, 1800);
    }
  }

  function startTimer() {
    if (state.timerActive) return;
    state.timerActive = true;
    state.timerStartMs = Date.now();
    saveState();
    formElements.timerToggle.textContent = '停止打卡';
    updateTimerLabel();
    timerInterval = setInterval(updateTimerLabel, 1000);
  }

  function stopTimer() {
    if (!state.timerActive) return;
    const elapsed = (Date.now() - state.timerStartMs) / 3600000;
    state.totalHours = Math.max(0, state.totalHours + elapsed);
    state.timerActive = false;
    state.timerStartMs = null;
    saveState();
    updateHours();
    formElements.timerToggle.textContent = '開始打卡';
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function updateTimerLabel() {
    if (!state.timerActive) {
      formElements.timerLabel.textContent = state.totalHours >= state.monthTarget ? '已達標，恭喜。' : '尚未打卡';
      return;
    }
    const elapsed = (Date.now() - state.timerStartMs) / 3600000;
    formElements.timerLabel.textContent = `打卡中：已累積 ${elapsed.toFixed(2)} 小時，按停止保存。`;
  }

  function downloadState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'intern-dashboard-backup.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        state = { ...defaultState, ...imported };
        saveState();
        refreshUI();
        alert('已匯入實習紀錄。');
      } catch (error) {
        alert('匯入失敗：請確認檔案格式為有效的 JSON。');
      }
    };
    reader.readAsText(file);
  }

  function refreshUI() {
    updateStatus();
    updateLoginUI();
    updateJournalWeek();
    updateHours();
    updateExpenses();
    renderNotes();
    renderReminders();
    renderChecklist();
    updateChecklistProgress();
    renderCharts();
    renderJournal();
    if (state.timerActive) {
      formElements.timerToggle.textContent = '停止打卡';
      if (!timerInterval) timerInterval = setInterval(updateTimerLabel, 1000);
    } else {
      formElements.timerToggle.textContent = '開始打卡';
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  }

  applyListeners();
  refreshUI();
})();
