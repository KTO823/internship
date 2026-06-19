(() => {
  const STORAGE_KEY = 'intern-dashboard-v3';
  
  const APP = {
    state: {
      user: { isLoggedIn: false, name: '' },
      startDate: '',
      endDate: '',
      monthTarget: 160,
      exchangeRate: 0.22,
      expenseTotalJpy: 0,
      punchRecords: {}, // { date: { records: [{ in: time, out: time }] } }
      notes: [],
      journals: [],
      reminders: [
        { id: 'r-1', title: '期末週誌繳交', date: formatDate(31), daysUntil: 31 },
        { id: 'r-2', title: '實習影片完成', date: formatDate(90), daysUntil: 90 },
      ],
      checklist: [
        { id: 'c-1', label: '填寫校外實習機構報到確認單', checked: false },
        { id: 'c-2', label: '繳交登機證 / 報到單', checked: false },
        { id: 'c-5', label: '繳交前期工作週誌', checked: false },
        { id: 'c-6', label: '繳交實習影片', checked: false },
        { id: 'c-9', label: '提交最終報告與滿意度', checked: false },
      ],
      quickExpenses: [
        { label: '早餐', amount: 450 },
        { label: '電車', amount: 180 },
        { label: '超市', amount: 1200 },
      ],
    },
    
    currentPage: 'dashboard',

    init() {
      this.loadState();
      this.cacheDom();
      this.setupEventListeners();
      this.updateDateLabels();
      this.render();
      window.APP = this; // 將 APP 暴露給全域以供 onClick 呼叫
    },

    cacheDom() {
      this.dom = {
        sidebarNav: document.querySelectorAll('.nav-item'),
        mobileTabs: document.querySelectorAll('.tab-item'),
        pages: document.querySelectorAll('.page'),
        menuToggles: document.querySelectorAll('.btn-menu'),
        sidebar: document.querySelector('.desktop-sidebar'),

        progressText: document.getElementById('progress-text'),
        progressMain: document.getElementById('progress-main'),
        progressHoursText: document.getElementById('progress-hours-text'),
        progressHours: document.getElementById('progress-hours'),
        progressExpenseText: document.getElementById('progress-expense-text'),
        progressChecklistText: document.getElementById('progress-checklist-text'),
        progressChecklist: document.getElementById('progress-checklist'),
        dashReminders: document.getElementById('dash-reminders'),

        hoursDisplay: document.getElementById('hours-display'),
        hoursHint: document.getElementById('hours-hint'),
        punchInBtn: document.getElementById('punch-in'),
        punchOutBtn: document.getElementById('punch-out'),
        makeupDate: document.getElementById('makeup-date'),
        makeupInTime: document.getElementById('makeup-in-time'),
        makeupOutTime: document.getElementById('makeup-out-time'),
        makeupSubmit: document.getElementById('makeup-submit'),

        expenseJpy: document.getElementById('expense-jpy'),
        expenseNtd: document.getElementById('expense-ntd'),
        expenseCustom: document.getElementById('expense-custom'),
        expenseAdd: document.getElementById('expense-add'),
        expenseQuickButtons: document.getElementById('expense-quick-buttons'),
        expenseCustomize: document.getElementById('expense-customize'),
        exchangeRate: document.getElementById('exchange-rate'),

        quickNote: document.getElementById('quick-note'),
        saveNote: document.getElementById('save-note'),
        clearNote: document.getElementById('clear-note'),
        
        weekLabel: document.getElementById('week-label'),
        weeklyJournal: document.getElementById('weekly-journal'),
        saveJournal: document.getElementById('save-journal'),

        reminderList: document.getElementById('reminder-list'),
        newReminderTitle: document.getElementById('new-reminder-title'),
        newReminderDate: document.getElementById('new-reminder-date'),
        addReminder: document.getElementById('add-reminder'),
        checklist: document.getElementById('checklist'),

        settingsUser: document.getElementById('settings-user'),
        settingsLogin: document.getElementById('settings-login'),
        settingsLogout: document.getElementById('settings-logout'),
        settingsStatus: document.getElementById('settings-status'),
        settingsStart: document.getElementById('settings-start'),
        settingsEnd: document.getElementById('settings-end'),
        settingsHoursTarget: document.getElementById('settings-hours-target'),
        dataExport: document.getElementById('data-export'),
        dataImport: document.getElementById('data-import'),
        dataReset: document.getElementById('data-reset'),
        importFile: document.getElementById('import-file'),
        sidebarUser: document.getElementById('sidebar-user'),
        sidebarLogout: document.getElementById('sidebar-logout'),

        // Modal elements
        historyModal: document.getElementById('history-modal'),
        modalClose: document.getElementById('modal-close'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
      };
    },

    setupEventListeners() {
      this.dom.sidebarNav.forEach(btn => btn.addEventListener('click', () => this.changePage(btn.dataset.page)));
      this.dom.mobileTabs.forEach(btn => btn.addEventListener('click', () => this.changePage(btn.dataset.page)));
      this.dom.menuToggles.forEach(btn => btn.addEventListener('click', () => this.toggleSidebar()));

      this.dom.punchInBtn.addEventListener('click', () => this.recordPunch('in'));
      this.dom.punchOutBtn.addEventListener('click', () => this.recordPunch('out'));
      this.dom.makeupSubmit.addEventListener('click', () => this.submitMakeup());

      this.dom.expenseCustomize.addEventListener('click', () => this.showExpenseCustomizer());
      this.dom.expenseAdd.addEventListener('click', () => {
        const amount = parseFloat(this.dom.expenseCustom.value) || 0;
        if (amount > 0) { this.addExpense(amount); this.dom.expenseCustom.value = ''; }
      });

      this.dom.saveNote.addEventListener('click', () => this.saveNoteItem());
      this.dom.clearNote.addEventListener('click', () => this.dom.quickNote.value = '');
      this.dom.saveJournal.addEventListener('click', () => this.saveJournalItem());
      this.dom.addReminder.addEventListener('click', () => this.addReminderItem());

      this.dom.settingsLogin.addEventListener('click', () => this.loginSettings());
      this.dom.settingsLogout.addEventListener('click', () => this.logoutSettings());
      this.dom.settingsStart.addEventListener('change', () => {
        this.state.startDate = this.dom.settingsStart.value; this.saveState(); this.updateDashboard();
      });
      this.dom.settingsEnd.addEventListener('change', () => {
        this.state.endDate = this.dom.settingsEnd.value; this.saveState(); this.updateDashboard();
      });
      this.dom.settingsHoursTarget.addEventListener('change', () => {
        this.state.monthTarget = parseInt(this.dom.settingsHoursTarget.value) || 160;
        this.saveState(); this.updateHoursDisplay();
      });
      this.dom.dataExport.addEventListener('click', () => this.exportData());
      this.dom.dataImport.addEventListener('click', () => this.dom.importFile.click());
      this.dom.importFile.addEventListener('change', (e) => this.importData(e));
      this.dom.dataReset.addEventListener('click', () => {
        if (confirm('確定重置？資料將被清空。')) { this.state = this.getDefaultState(); this.saveState(); this.render(); }
      });
      this.dom.sidebarLogout.addEventListener('click', () => this.logoutSettings());

      // Modal close listener
      this.dom.modalClose.addEventListener('click', () => this.dom.historyModal.close());
    },

    changePage(page) {
      this.currentPage = page;
      this.dom.pages.forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
      this.dom.sidebarNav.forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
      this.dom.mobileTabs.forEach(btn => btn.classList.toggle('active', btn.dataset.page === page));
      if (window.innerWidth < 1024 && this.dom.sidebar) this.dom.sidebar.style.display = 'none';
    },

    toggleSidebar() {
      if (this.dom.sidebar) this.dom.sidebar.style.display = this.dom.sidebar.style.display === 'none' ? 'flex' : 'none';
    },

    updateDateLabels() {
      const today = new Date().toISOString().slice(0, 10);
      if (document.getElementById('punch-date-label')) {
        document.getElementById('punch-date-label').textContent = `今日打卡控制台（${today}）`;
      }
      if (this.dom.makeupDate) this.dom.makeupDate.value = today;
    },

    // 歷史紀錄彈出視窗管理系統
    openHistoryModal(type) {
      this.dom.modalBody.innerHTML = '';
      if (type === 'punch') {
        this.dom.modalTitle.textContent = '打卡歷史紀錄管理';
        const sortedDates = Object.keys(this.state.punchRecords).sort().reverse();
        if(sortedDates.length === 0) this.dom.modalBody.innerHTML = '<p>尚無打卡紀錄</p>';
        
        sortedDates.forEach(date => {
          const records = this.state.punchRecords[date].records;
          records.forEach((rec, idx) => {
            const card = document.createElement('div');
            card.className = 'history-record-card';
            card.innerHTML = `
              <p><strong>${date}</strong></p>
              <p>進：${rec.in} | 出：${rec.out || '未打卡'} ${rec.makeup ? '(補)' : ''}</p>
              <div class="history-record-actions">
                <button class="btn btn-sm secondary" onclick="APP.editRecord('${type}', '${date}', ${idx})">編輯</button>
                <button class="btn btn-sm danger" onclick="APP.deleteRecord('${type}', '${date}', ${idx})">刪除</button>
              </div>
            `;
            this.dom.modalBody.appendChild(card);
          });
        });
      } else if (type === 'note') {
        this.dom.modalTitle.textContent = '備註歷史管理';
        if(this.state.notes.length === 0) this.dom.modalBody.innerHTML = '<p>尚無備註紀錄</p>';
        
        [...this.state.notes].reverse().forEach((note, reverseIdx) => {
          const actualIdx = this.state.notes.length - 1 - reverseIdx;
          const card = document.createElement('div');
          card.className = 'history-record-card';
          card.innerHTML = `
            <p style="color: var(--text-muted); font-size: 0.85rem;">${note.date}</p>
            <p>${escapeHtml(note.text)}</p>
            <div class="history-record-actions">
              <button class="btn btn-sm secondary" onclick="APP.editRecord('${type}', null, ${actualIdx})">編輯</button>
              <button class="btn btn-sm danger" onclick="APP.deleteRecord('${type}', null, ${actualIdx})">刪除</button>
            </div>
          `;
          this.dom.modalBody.appendChild(card);
        });
      } else if (type === 'journal') {
        this.dom.modalTitle.textContent = '週誌歷史管理';
        if(this.state.journals.length === 0) this.dom.modalBody.innerHTML = '<p>尚無週誌紀錄</p>';

        [...this.state.journals].reverse().forEach((journal, reverseIdx) => {
          const actualIdx = this.state.journals.length - 1 - reverseIdx;
          const card = document.createElement('div');
          card.className = 'history-record-card';
          card.innerHTML = `
            <p><strong>第 ${journal.week} 週</strong> <span style="color:var(--text-muted); font-size: 0.85rem;">${journal.date}</span></p>
            <p style="white-space: pre-wrap; max-height: 100px; overflow-y: auto;">${escapeHtml(journal.text)}</p>
            <div class="history-record-actions">
              <button class="btn btn-sm secondary" onclick="APP.exportSingleJournal(${actualIdx})">匯出</button>
              <button class="btn btn-sm secondary" onclick="APP.editRecord('${type}', null, ${actualIdx})">編輯</button>
              <button class="btn btn-sm danger" onclick="APP.deleteRecord('${type}', null, ${actualIdx})">刪除</button>
            </div>
          `;
          this.dom.modalBody.appendChild(card);
        });
      }
      this.dom.historyModal.showModal();
    },

    deleteRecord(type, dateStr, index) {
      if (!confirm('確定要刪除這筆紀錄嗎？')) return;
      if (type === 'punch') {
        this.state.punchRecords[dateStr].records.splice(index, 1);
        if (this.state.punchRecords[dateStr].records.length === 0) delete this.state.punchRecords[dateStr];
        this.updateHoursDisplay();
      } else if (type === 'note') {
        this.state.notes.splice(index, 1);
      } else if (type === 'journal') {
        this.state.journals.splice(index, 1);
      }
      this.saveState();
      this.openHistoryModal(type); // 重新渲染視窗
    },

    editRecord(type, dateStr, index) {
      if (type === 'punch') {
        const rec = this.state.punchRecords[dateStr].records[index];
        const newIn = prompt('修改上班時間 (HH:MM)', rec.in);
        if (newIn !== null) rec.in = newIn;
        const newOut = prompt('修改下班時間 (HH:MM) - 若未下班請留空', rec.out || '');
        if (newOut !== null) rec.out = newOut || null;
        this.updateHoursDisplay();
      } else if (type === 'note') {
        const rec = this.state.notes[index];
        const newText = prompt('編輯備註內容', rec.text);
        if (newText) rec.text = newText;
      } else if (type === 'journal') {
        const rec = this.state.journals[index];
        const newText = prompt('編輯週誌內容', rec.text);
        if (newText) rec.text = newText;
      }
      this.saveState();
      this.openHistoryModal(type); // 重新渲染視窗
    },

    exportSingleJournal(index) {
      const journal = this.state.journals[index];
      const previewHtml = `<html><head><title>週誌預覽</title><style>body{font-family:sans-serif;padding:32px;line-height:1.6;}h1{font-size:24px;}p{white-space:pre-wrap;}</style></head><body><h1>第 ${journal.week} 週週誌</h1><p>${escapeHtml(journal.text)}</p></body></html>`;
      const win = window.open('', '_blank');
      if (win) { win.document.write(previewHtml); win.document.close(); }
      else { alert('請允許瀏覽器彈出視窗'); }
    },

    recordPunch(type) {
      const today = new Date().toISOString().slice(0, 10);
      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

      if (!this.state.punchRecords[today]) this.state.punchRecords[today] = { records: [] };
      const todayRecords = this.state.punchRecords[today].records;

      if (type === 'in') todayRecords.push({ in: timeStr, out: null });
      else if (type === 'out' && todayRecords.length > 0) todayRecords[todayRecords.length - 1].out = timeStr;
      
      this.saveState();
      this.updateHoursDisplay();
      alert(type === 'in' ? '已打卡上班' : '已打卡下班');
    },

    submitMakeup() {
      const date = this.dom.makeupDate.value;
      const inTime = this.dom.makeupInTime.value;
      const outTime = this.dom.makeupOutTime.value;
      if (!date || !inTime || !outTime) return alert('請完整填寫');

      if (!this.state.punchRecords[date]) this.state.punchRecords[date] = { records: [] };
      this.state.punchRecords[date].records.push({ in: inTime, out: outTime, makeup: true });

      this.saveState();
      this.updateHoursDisplay();
      this.dom.makeupInTime.value = ''; this.dom.makeupOutTime.value = '';
      alert('補打卡成功');
    },

    getTotalHours() {
      let total = 0;
      Object.values(this.state.punchRecords).forEach(dayRecords => {
        dayRecords.records.forEach(rec => {
          if (rec.out) {
            const [inH, inM] = rec.in.split(':').map(Number);
            const [outH, outM] = rec.out.split(':').map(Number);
            total += Math.max(0, (outH * 60 + outM) - (inH * 60 + inM)) / 60;
          }
        });
      });
      return total;
    },

    addExpense(amount) {
      this.state.expenseTotalJpy += amount;
      this.saveState();
      this.updateExpensesDisplay();
      this.updateDashboard();
      if (navigator.vibrate) navigator.vibrate(20);
    },

    showExpenseCustomizer() {
      const label = prompt('快速記帳標籤（如：早餐）'); if (!label) return;
      const amount = parseFloat(prompt('金額（JPY）')); if (isNaN(amount) || amount <= 0) return;
      this.state.quickExpenses.push({ label, amount });
      this.saveState(); this.renderQuickExpenses();
    },

    renderQuickExpenses() {
      this.dom.expenseQuickButtons.innerHTML = '';
      this.state.quickExpenses.forEach((exp, idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn-expense';
        btn.textContent = `${exp.label} ¥${Math.round(exp.amount)}`;
        btn.addEventListener('click', () => this.addExpense(exp.amount));
        
        let pressTimer;
        btn.addEventListener('mousedown', () => {
          pressTimer = window.setTimeout(() => {
            if (confirm(`刪除「${exp.label}」？`)) { this.state.quickExpenses.splice(idx, 1); this.saveState(); this.renderQuickExpenses(); }
          }, 800);
        });
        btn.addEventListener('mouseup', () => clearTimeout(pressTimer));
        btn.addEventListener('mouseleave', () => clearTimeout(pressTimer));
        this.dom.expenseQuickButtons.appendChild(btn);
      });
    },

    async fetchExchangeRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/JPY');
        const data = await res.json();
        if (data?.rates?.TWD) {
          this.state.exchangeRate = data.rates.TWD;
          if (this.dom.exchangeRate) this.dom.exchangeRate.value = this.state.exchangeRate.toFixed(4);
          this.saveState(); this.updateExpensesDisplay();
        }
      } catch (e) { console.warn('匯率更新失敗'); }
    },

    updateExpensesDisplay() {
      if (this.dom.expenseJpy) this.dom.expenseJpy.textContent = `￥${Math.round(this.state.expenseTotalJpy)}`;
      const ntd = Math.round(this.state.expenseTotalJpy * this.state.exchangeRate);
      if (this.dom.expenseNtd) this.dom.expenseNtd.textContent = `NT$${ntd}`;
      if (this.dom.progressExpenseText) this.dom.progressExpenseText.textContent = `￥${Math.round(this.state.expenseTotalJpy)} / NT$${ntd}`;
    },

    saveNoteItem() {
      const text = this.dom.quickNote.value.trim(); if (!text) return;
      this.state.notes.push({ text, date: new Date().toLocaleString('zh-Hant', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) });
      this.dom.quickNote.value = ''; this.saveState(); alert('備註已保存');
    },

    addReminderItem() {
      const title = this.dom.newReminderTitle.value.trim();
      const date = this.dom.newReminderDate.value;
      if (!title || !date) return;
      this.state.reminders.push({ id: Date.now().toString(), title, date });
      this.dom.newReminderTitle.value = ''; this.dom.newReminderDate.value = '';
      this.saveState(); this.renderReminders();
    },

    renderReminders() {
      this.dom.reminderList.innerHTML = '';
      this.state.reminders.forEach(reminder => {
        const div = document.createElement('div'); div.className = 'reminder-item';
        const days = Math.ceil((new Date(reminder.date) - new Date()) / 86400000);
        div.innerHTML = `<p class="reminder-item-title">${escapeHtml(reminder.title)}</p><p class="reminder-item-meta">${reminder.date} • ${days < 0 ? '已過期' : days === 0 ? '今天' : days + ' 天'}</p>`;
        this.dom.reminderList.appendChild(div);
      });
    },

    renderChecklist() {
      this.dom.checklist.innerHTML = '';
      this.state.checklist.forEach(item => {
        const label = document.createElement('label'); label.className = 'checklist-item';
        label.innerHTML = `<input type="checkbox" ${item.checked ? 'checked' : ''} /><span>${escapeHtml(item.label)}</span>`;
        label.querySelector('input').addEventListener('change', e => { item.checked = e.target.checked; this.saveState(); this.updateDashboard(); });
        this.dom.checklist.appendChild(label);
      });
    },

    saveJournalItem() {
      const text = this.dom.weeklyJournal.value.trim(); if (!text) return;
      this.state.journals.push({ week: this.getWeekNumber() || '未設定', text, date: new Date().toLocaleString('zh-Hant') });
      this.dom.weeklyJournal.value = ''; this.saveState(); alert('週誌已保存');
    },

    loginSettings() {
      const username = this.dom.settingsUser.value.trim(); if (!username) return;
      this.state.user = { isLoggedIn: true, name: username }; this.saveState(); this.updateLoginStatus();
    },

    logoutSettings() {
      if (confirm('確定要登出？')) { this.state.user = { isLoggedIn: false, name: '' }; this.saveState(); this.updateLoginStatus(); }
    },

    updateLoginStatus() {
      const { isLoggedIn, name } = this.state.user;
      this.dom.settingsStatus.textContent = isLoggedIn ? `已登入：${name}` : '未登入';
      this.dom.sidebarUser.textContent = isLoggedIn ? name : '未登入';
    },

    exportData() {
      const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `intern-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    },

    importData(event) {
      const file = event.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try { this.state = { ...this.getDefaultState(), ...JSON.parse(e.target.result) }; this.saveState(); this.render(); alert('匯入成功'); } 
        catch { alert('檔案格式錯誤'); }
      }; reader.readAsText(file);
    },

    updateHoursDisplay() {
      const total = this.getTotalHours();
      const pct = Math.min(100, Math.round((total / this.state.monthTarget) * 100));
      if (this.dom.hoursDisplay) this.dom.hoursDisplay.textContent = total.toFixed(1);
      if (this.dom.hoursHint) this.dom.hoursHint.textContent = `目標 ${this.state.monthTarget} 小時`;
      if (this.dom.progressHoursText) this.dom.progressHoursText.textContent = `${total.toFixed(1)}/${this.state.monthTarget} 小時`;
      if (this.dom.progressHours) this.dom.progressHours.style.width = `${pct}%`;
    },

    updateDashboard() {
      const { startDate, endDate } = this.state;
      if (startDate && endDate) {
        const total = Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000);
        const passed = Math.ceil((new Date() - new Date(startDate)) / 86400000);
        const pct = Math.min(100, Math.max(0, Math.round((passed / total) * 100)));
        if (this.dom.progressText) this.dom.progressText.textContent = `${pct}%`;
        if (this.dom.progressMain) this.dom.progressMain.style.width = `${pct}%`;
      }
      
      const chkPct = Math.round((this.state.checklist.filter(c => c.checked).length / this.state.checklist.length) * 100);
      if (this.dom.progressChecklistText) this.dom.progressChecklistText.textContent = `${this.state.checklist.filter(c => c.checked).length}/${this.state.checklist.length} 項`;
      if (this.dom.progressChecklist) this.dom.progressChecklist.style.width = `${chkPct}%`;

      this.dom.dashReminders.innerHTML = '';
      this.state.reminders.slice(0, 3).forEach(r => {
        const d = Math.ceil((new Date(r.date) - new Date()) / 86400000);
        this.dom.dashReminders.innerHTML += `<div class="reminder-item"><p class="reminder-item-title">${escapeHtml(r.title)}</p><p class="reminder-item-meta">${d < 0 ? '已過期' : d + ' 天'}</p></div>`;
      });
    },

    getWeekNumber() {
      return this.state.startDate ? Math.floor((new Date() - new Date(this.state.startDate)) / 86400000 / 7) + 1 : null;
    },

    updateSettingsForm() {
      this.dom.settingsStart.value = this.state.startDate; this.dom.settingsEnd.value = this.state.endDate;
      this.dom.settingsHoursTarget.value = this.state.monthTarget;
      if (this.getWeekNumber()) this.dom.weekLabel.textContent = `實習第 ${this.getWeekNumber()} 週週誌`;
    },

    render() {
      this.changePage('dashboard'); this.fetchExchangeRate(); this.updateHoursDisplay();
      this.updateExpensesDisplay(); this.renderReminders(); this.renderChecklist();
      this.renderQuickExpenses(); this.updateDashboard(); this.updateLoginStatus(); this.updateSettingsForm();
    },

    saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); },
    loadState() { const saved = localStorage.getItem(STORAGE_KEY); if (saved) try { this.state = { ...this.getDefaultState(), ...JSON.parse(saved) }; } catch(e){} },
    getDefaultState() { return JSON.parse(JSON.stringify(this.state)); },
  };

  function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
  document.addEventListener('DOMContentLoaded', () => APP.init());
})();