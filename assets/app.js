(() => {
  const STORAGE_KEY = 'intern-dashboard-v5';
  
  const APP = {
    state: {
      startDate: '',
      endDate: '',
      punchMode: 'realtime', // 'realtime' 或 'manual'
      hoursTargetMode: 'monthly', // 'monthly' 或 'total'
      hoursTarget: 160,
      exchangeRate: 0.21,
      
      punchRecords: {}, // 日期: { records: [{in, out}], manualTotal: 0 }
      expenses: [],     // { id, desc, amount, date }
      notes: [],        // { id, text, date }
      journals: [],     // { id, week, text, date }
      reminders: [
        { id: 'r1', title: '出國前準備：日幣 10 萬圓生活費', date: '2026-07-01' },
      ],
      // 依照說明會 PDF 建立的死線清單
      checklist: [
        { id: 'c1', label: '填寫校外實習機構報到確認單', date: '2026-07-07', checked: false },
        { id: 'c2', label: '繳交登機證 / 日本實習報到單給QQ', date: '2026-07-31', checked: false },
        { id: 'c5', label: '繳交前期實習生工作週誌 (共16週)', date: '2026-12-31', checked: false },
        { id: 'c6', label: '繳交實習影片（至少 5 分鐘）', date: '2027-03-31', checked: false },
        { id: 'c9', label: '提交回程登機證、心得報告與滿意度表', date: '2027-05-18', checked: false },
        { id: 'c10', label: '實習成果報告發表', date: '2027-05-27', checked: false },
      ],
      quickExpenses: [
        { id: 'q1', label: '早餐', amount: 450 },
        { id: 'q2', label: '電車', amount: 180 },
        { id: 'q3', label: '超市', amount: 1200 },
      ],
    },

    init() {
      this.loadState();
      this.cacheDom();
      this.setupListeners();
      this.fetchExchangeRate();
      this.renderAll();
    },

    cacheDom() {
      this.dom = {
        pages: document.querySelectorAll('.page'),
        navBtns: document.querySelectorAll('.nav-item, .tab-item'),
        
        // 設定區
        setPunchMode: document.getElementById('settings-punch-mode'),
        setHoursMode: document.getElementById('settings-hours-mode'),
        setHoursTarget: document.getElementById('settings-hours-target'),
        setStart: document.getElementById('settings-start'),
        setEnd: document.getElementById('settings-end'),
        btnHoursHelp: document.getElementById('btn-hours-help'),
        
        // 打卡區
        secRealtime: document.getElementById('punch-realtime-section'),
        secManual: document.getElementById('punch-manual-section'),
        btnIn: document.getElementById('punch-in'),
        btnOut: document.getElementById('punch-out'),
        manualInput: document.getElementById('manual-hours-input'),
        manualSubmit: document.getElementById('manual-hours-submit'),
        todayPunchList: document.getElementById('today-punch-list'),
        
        // 記帳區
        expDesc: document.getElementById('expense-custom-desc'),
        expAmount: document.getElementById('expense-custom'),
        expAdd: document.getElementById('expense-add'),
        expQuickBox: document.getElementById('expense-quick-buttons'),
        
        // 模態框 (Modal)
        modal: document.getElementById('modal-overlay'),
        modalClose: document.getElementById('modal-close'),
        modalTitle: document.getElementById('modal-title'),
        modalBody: document.getElementById('modal-body'),
      };
    },

    setupListeners() {
      // 導覽切換
      this.dom.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          this.dom.pages.forEach(p => p.classList.remove('active'));
          this.dom.navBtns.forEach(b => b.classList.remove('active'));
          
          const targetPage = document.getElementById(`page-${btn.dataset.page}`);
          if (targetPage) targetPage.classList.add('active');
          
          document.querySelectorAll(`[data-page="${btn.dataset.page}"]`).forEach(b => b.classList.add('active'));
        });
      });

      // 設定變更監聽
      if (this.dom.setPunchMode) {
        this.dom.setPunchMode.addEventListener('change', (e) => { 
          this.state.punchMode = e.target.value; 
          this.saveState(); 
          this.renderHoursPage(); 
        });
      }
      
      if (this.dom.setHoursMode) {
        this.dom.setHoursMode.addEventListener('change', (e) => { 
          this.state.hoursTargetMode = e.target.value; 
          this.saveState(); 
          this.renderHoursPage(); 
          this.updateDashboard(); 
        });
      }

      if (this.dom.setHoursTarget) {
        this.dom.setHoursTarget.addEventListener('change', (e) => { 
          this.state.hoursTarget = Number(e.target.value) || 160; 
          this.saveState(); 
          this.renderHoursPage(); 
          this.updateDashboard(); 
        });
      }

      if (this.dom.setStart) {
        this.dom.setStart.addEventListener('change', (e) => { 
          this.state.startDate = e.target.value; 
          this.saveState(); 
          this.updateDashboard(); 
        });
      }

      if (this.dom.setEnd) {
        this.dom.setEnd.addEventListener('change', (e) => { 
          this.state.endDate = e.target.value; 
          this.saveState(); 
          this.updateDashboard(); 
        });
      }

      // 問號說明按鈕
      if (this.dom.btnHoursHelp) {
        this.dom.btnHoursHelp.addEventListener('click', () => {
          alert('【每月目標】\n適合需要控管單月排班上限（如每月不可超過160小時）的狀況。儀表板進度只算當月累積。\n\n【總時數目標】\n適合學校規定「實習總時數須達標才能拿學分」的狀況。儀表板進度會累加你整個實習期間的所有時數。');
        });
      }

      // 打卡事件
      if (this.dom.btnIn) this.dom.btnIn.addEventListener('click', () => this.handleRealtimePunch('in'));
      if (this.dom.btnOut) this.dom.btnOut.addEventListener('click', () => this.handleRealtimePunch('out'));
      if (this.dom.manualSubmit) this.dom.manualSubmit.addEventListener('click', () => this.handleManualPunch());

      // 記帳事件
      if (this.dom.expAdd) {
        this.dom.expAdd.addEventListener('click', () => {
          const amount = Number(this.dom.expAmount.value);
          const desc = this.dom.expDesc.value.trim() || '自訂支出';
          if (amount > 0) { 
            this.addExpenseRecord(desc, amount); 
            this.dom.expAmount.value = ''; 
            this.dom.expDesc.value = ''; 
          }
        });
      }

      // 備註與週誌保存
      const saveNoteBtn = document.getElementById('save-note');
      if (saveNoteBtn) {
        saveNoteBtn.addEventListener('click', () => {
          const noteInput = document.getElementById('quick-note');
          const text = noteInput.value.trim();
          if (text) { 
            this.state.notes.push({ id: Date.now(), text, date: this.getNowString() }); 
            noteInput.value = ''; 
            this.saveState(); 
            alert('備註已儲存'); 
          }
        });
      }

      const saveJournalBtn = document.getElementById('save-journal');
      if (saveJournalBtn) {
        saveJournalBtn.addEventListener('click', () => {
          const journalInput = document.getElementById('weekly-journal');
          const text = journalInput.value.trim();
          if (text) { 
            this.state.journals.push({ id: Date.now(), week: this.getWeekNum(), text, date: this.getNowString() }); 
            journalInput.value = ''; 
            this.saveState(); 
            alert('週誌已儲存'); 
          }
        });
      }

      // 提醒事項新增
      const addReminderBtn = document.getElementById('add-reminder');
      if (addReminderBtn) {
        addReminderBtn.addEventListener('click', () => {
          const title = document.getElementById('new-reminder-title').value.trim();
          const date = document.getElementById('new-reminder-date').value;
          if (title && date) { 
            this.state.reminders.push({ id: Date.now().toString(), title, date }); 
            this.saveState(); 
            this.renderReminders(); 
            this.updateDashboard();
          }
        });
      }

      // 管理按鈕 (開啟 Modal)
      const bindModal = (btnId, type) => {
        const btn = document.getElementById(btnId);
        if (btn) btn.addEventListener('click', () => this.openModal(type));
      };
      
      bindModal('btn-manage-punch', 'punch');
      bindModal('btn-manage-expense', 'expense');
      bindModal('btn-edit-quick-expense', 'quickExpense');
      bindModal('btn-manage-note', 'note');
      bindModal('btn-manage-journal', 'journal');
      
      // Modal 關閉
      if (this.dom.modalClose) {
        this.dom.modalClose.addEventListener('click', () => {
          this.dom.modal.classList.remove('active');
        });
      }

      // 匯出匯入
      const btnExport = document.getElementById('data-export');
      if (btnExport) btnExport.addEventListener('click', () => this.exportData());
      
      const btnImport = document.getElementById('data-import');
      const fileImport = document.getElementById('import-file');
      if (btnImport && fileImport) {
        btnImport.addEventListener('click', () => fileImport.click());
        fileImport.addEventListener('change', (e) => this.importData(e));
      }
    },

    getNowString() { 
      return new Date().toLocaleString('zh-Hant', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); 
    },
    
    getTodayStr() { 
      return new Date().toISOString().slice(0, 10); 
    },
    
    getWeekNum() { 
      if (!this.state.startDate) return '未設定';
      const msDiff = new Date() - new Date(this.state.startDate);
      return Math.floor(msDiff / 86400000 / 7) + 1; 
    },

    // --- 打卡邏輯 ---
    handleRealtimePunch(type) {
      const today = this.getTodayStr();
      const timeStr = new Date().toTimeString().slice(0,5);
      
      if (!this.state.punchRecords[today]) {
        this.state.punchRecords[today] = { records: [], manualTotal: 0 };
      }
      
      const recs = this.state.punchRecords[today].records;
      
      if (type === 'in') {
        recs.push({ in: timeStr, out: null });
      } else if (type === 'out' && recs.length > 0) {
        recs[recs.length - 1].out = timeStr;
      }
      
      this.saveState(); 
      this.renderHoursPage();
    },
    
    handleManualPunch() {
      const hours = Number(this.dom.manualInput.value);
      if (hours > 0) {
        const today = this.getTodayStr();
        if (!this.state.punchRecords[today]) {
          this.state.punchRecords[today] = { records: [], manualTotal: 0 };
        }
        // 覆蓋今日總手動時數
        this.state.punchRecords[today].manualTotal = hours; 
        this.saveState(); 
        this.renderHoursPage(); 
        this.dom.manualInput.value = ''; 
        alert('今日總時數已紀錄！');
      }
    },

    calcTotalHours() {
      let total = 0;
      Object.values(this.state.punchRecords).forEach(day => {
        if (day.manualTotal > 0) { 
          total += day.manualTotal; 
        } else if (day.records) {
          day.records.forEach(r => {
            if (r.out) {
              const [ih, im] = r.in.split(':').map(Number); 
              const [oh, om] = r.out.split(':').map(Number);
              total += Math.max(0, (oh * 60 + om) - (ih * 60 + im)) / 60;
            }
          });
        }
      });
      return total;
    },

    // --- 記帳邏輯 ---
    addExpenseRecord(desc, amount) {
      this.state.expenses.push({ 
        id: Date.now(), 
        desc, 
        amount, 
        date: this.getNowString() 
      });
      this.saveState(); 
      this.renderExpenses();
    },

    async fetchExchangeRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/JPY');
        const data = await res.json();
        if (data && data.rates && data.rates.TWD) { 
          this.state.exchangeRate = data.rates.TWD; 
          this.saveState(); 
          this.renderExpenses(); 
        }
      } catch (e) {
        console.warn('匯率更新失敗，使用快取匯率');
      }
    },

    // --- 渲染畫面 ---
    renderAll() {
      if (this.dom.setPunchMode) this.dom.setPunchMode.value = this.state.punchMode;
      if (this.dom.setHoursMode) this.dom.setHoursMode.value = this.state.hoursTargetMode;
      if (this.dom.setHoursTarget) this.dom.setHoursTarget.value = this.state.hoursTarget;
      if (this.dom.setStart) this.dom.setStart.value = this.state.startDate;
      if (this.dom.setEnd) this.dom.setEnd.value = this.state.endDate;
      
      this.renderHoursPage();
      this.renderExpenses();
      this.renderReminders();
      this.renderChecklist();
      this.updateDashboard();
    },

    renderHoursPage() {
      if (!this.dom.secRealtime || !this.dom.secManual) return;

      // 根據設定切換顯示區塊
      if (this.state.punchMode === 'manual') {
        this.dom.secRealtime.style.display = 'none'; 
        this.dom.secManual.style.display = 'block';
      } else {
        this.dom.secRealtime.style.display = 'block'; 
        this.dom.secManual.style.display = 'none';
      }

      // 顯示今日打卡摘要
      const today = this.getTodayStr();
      const todayData = this.state.punchRecords[today];
      let punchHtml = '<p style="margin:0; font-size:0.9rem; color:var(--text-muted);">今日狀態：</p>';
      
      if (todayData) {
        if (todayData.manualTotal > 0) {
          punchHtml += `<strong>已手動紀錄 ${todayData.manualTotal} 小時</strong>`;
        } else {
          todayData.records.forEach(r => {
            punchHtml += `<div>進: ${r.in} - 出: ${r.out || '進行中'}</div>`;
          });
        }
      } else { 
        punchHtml += '尚未記錄'; 
      }
      this.dom.todayPunchList.innerHTML = punchHtml;

      // 計算總時數與目標
      const total = this.calcTotalHours();
      const displayElem = document.getElementById('hours-display');
      if (displayElem) displayElem.textContent = total.toFixed(1);
      
      const targetLabel = this.state.hoursTargetMode === 'total' ? '總工時目標' : '月度工時目標';
      const labelElem = document.getElementById('hours-target-label');
      if (labelElem) labelElem.textContent = targetLabel;

      const hintElem = document.getElementById('hours-hint');
      if (hintElem) hintElem.textContent = `目標 ${this.state.hoursTarget} 小時`;
      
      // 更新儀表板
      const pct = Math.min(100, Math.round((total / this.state.hoursTarget) * 100));
      const textElem = document.getElementById('progress-hours-text');
      if (textElem) textElem.textContent = `${total.toFixed(1)}/${this.state.hoursTarget} 小時`;

      const barElem = document.getElementById('progress-hours');
      if (barElem) barElem.style.width = `${pct}%`;
    },

    renderExpenses() {
      // 計算當月/總支出
      const totalJpy = this.state.expenses.reduce((sum, e) => sum + e.amount, 0);
      const totalNtd = Math.round(totalJpy * this.state.exchangeRate);
      
      const jpyElem = document.getElementById('expense-jpy');
      if (jpyElem) jpyElem.textContent = `￥${totalJpy}`;

      const ntdElem = document.getElementById('expense-ntd');
      if (ntdElem) ntdElem.textContent = `NT$${totalNtd}`;

      const progTextElem = document.getElementById('progress-expense-text');
      if (progTextElem) progTextElem.textContent = `￥${totalJpy} / NT$${totalNtd}`;

      // 渲染快捷鍵
      if (this.dom.expQuickBox) {
        this.dom.expQuickBox.innerHTML = '';
        this.state.quickExpenses.forEach(q => {
          const btn = document.createElement('button'); 
          btn.className = 'btn-expense';
          btn.textContent = `${q.label} ￥${q.amount}`;
          btn.addEventListener('click', () => this.addExpenseRecord(q.label, q.amount));
          this.dom.expQuickBox.appendChild(btn);
        });
      }
    },

    renderReminders() {
      const fullList = document.getElementById('reminder-list');
      if (!fullList) return;
      fullList.innerHTML = '';

      this.state.reminders.forEach((r, idx) => {
        const msDiff = new Date(r.date) - new Date();
        const d = Math.ceil(msDiff / 86400000);
        const isUrgent = (d <= 30 && d >= 0);
        const status = d < 0 ? '已過期' : (d === 0 ? '今天截止' : `剩 ${d} 天`);
        
        const row = document.createElement('div'); 
        row.className = `reminder-item ${isUrgent ? 'urgent' : ''}`;
        row.innerHTML = `
          <div class="reminder-text">
            <h4>${escapeHtml(r.title)}</h4>
            <p>${r.date} (${status})</p>
          </div>
          <div>
            <button class="btn-icon" style="color:var(--primary);" onclick="APP.editReminder(${idx})">✏️</button>
            <button class="btn-icon" style="color:var(--danger);" onclick="APP.deleteItem('reminders', ${idx})">🗑️</button>
          </div>
        `;
        fullList.appendChild(row);
      });
    },

    renderChecklist() {
      const cl = document.getElementById('checklist');
      if (!cl) return;
      cl.innerHTML = ''; 
      let checked = 0;
      
      this.state.checklist.forEach(c => {
        if (c.checked) checked++;
        
        const msDiff = new Date(c.date) - new Date();
        const d = Math.ceil(msDiff / 86400000);
        // 沒打勾且 30 天內，顯示紅色警告
        const isUrgent = (!c.checked && d <= 30 && d >= 0); 
        const status = d < 0 ? '已過期' : (d === 0 ? '今天截止' : `剩 ${d} 天 (${c.date})`);

        const lbl = document.createElement('label'); 
        lbl.className = `checklist-item ${isUrgent ? 'urgent' : ''}`;
        lbl.innerHTML = `
          <input type="checkbox" ${c.checked ? 'checked' : ''}>
          <div>
            <span>${escapeHtml(c.label)}</span>
            <span class="checklist-item-meta">${status}</span>
          </div>
        `;
        
        lbl.querySelector('input').addEventListener('change', e => { 
          c.checked = e.target.checked; 
          this.saveState(); 
          this.updateDashboard(); 
          this.renderChecklist(); 
        });
        cl.appendChild(lbl);
      });

      const progText = document.getElementById('progress-checklist-text');
      if (progText) progText.textContent = `${checked}/${this.state.checklist.length} 項`;

      const progBar = document.getElementById('progress-checklist');
      if (progBar) progBar.style.width = `${Math.round((checked / this.state.checklist.length) * 100)}%`;
    },

    updateDashboard() {
      if (this.state.startDate && this.state.endDate) {
        const msTotal = new Date(this.state.endDate) - new Date(this.state.startDate);
        const total = Math.max(1, Math.ceil(msTotal / 86400000));
        const msPassed = new Date() - new Date(this.state.startDate);
        const passed = Math.max(0, Math.ceil(msPassed / 86400000));
        
        const pct = Math.min(100, Math.round((passed / total) * 100));
        
        const progText = document.getElementById('progress-text');
        if (progText) progText.textContent = `${pct}%`;

        const progMain = document.getElementById('progress-main');
        if (progMain) progMain.style.width = `${pct}%`;
      }
      
      // 自動抓取 30 天內的死線與自訂提醒到儀表板
      const dashList = document.getElementById('dash-reminders');
      if (!dashList) return;
      dashList.innerHTML = '';
      
      const urgents = [];
      
      this.state.checklist.forEach(c => { 
        if (!c.checked) { 
          const d = Math.ceil((new Date(c.date) - new Date()) / 86400000); 
          if (d <= 30 && d >= 0) urgents.push({ title: c.label, days: d, type: '規定死線' }); 
        }
      });
      
      this.state.reminders.forEach(r => { 
        const d = Math.ceil((new Date(r.date) - new Date()) / 86400000); 
        if (d <= 30 && d >= 0) urgents.push({ title: r.title, days: d, type: '重要提醒' }); 
      });
      
      urgents.sort((a, b) => a.days - b.days).slice(0, 4).forEach(u => {
        dashList.innerHTML += `
          <div class="reminder-item urgent">
            <div class="reminder-text">
              <h4>${escapeHtml(u.title)}</h4>
              <p>⚠️ ${u.type} - 剩 ${u.days} 天</p>
            </div>
          </div>
        `;
      });

      if (urgents.length === 0) {
        dashList.innerHTML = '<p style="color:gray; font-size:0.9rem; padding:10px;">目前無 30 天內即將到期的任務，請繼續保持！</p>';
      }
    },

    // --- 萬用彈出視窗 (Modal) 管理系統 ---
    openModal(type) {
      if (!this.dom.modal) return;
      this.dom.modal.classList.add('active'); 
      this.dom.modalBody.innerHTML = '';

      if (type === 'punch') {
        this.dom.modalTitle.textContent = '打卡歷史紀錄';
        const sortedDates = Object.keys(this.state.punchRecords).sort().reverse();
        
        sortedDates.forEach(date => {
          const day = this.state.punchRecords[date]; 
          const div = document.createElement('div'); 
          div.className = 'history-card'; 
          
          let html = `<p><strong>${date}</strong></p>`;
          if (day.manualTotal > 0) {
            html += `<p>手動時數: ${day.manualTotal} 小時 <button class="btn-sm secondary" onclick="APP.editManualPunch('${date}')">修改</button></p>`;
          } else {
            day.records.forEach((r, i) => { 
              html += `<p>進: ${r.in} | 出: ${r.out || '--'} <button class="btn-sm secondary" onclick="APP.editPunch('${date}', ${i})">修改</button></p>`; 
            });
          }
          
          html += `<div class="history-actions"><button class="btn btn-sm danger" onclick="APP.deletePunchDay('${date}')">刪除整日</button></div>`; 
          div.innerHTML = html; 
          this.dom.modalBody.appendChild(div);
        });

      } else if (type === 'expense') {
        this.dom.modalTitle.textContent = '記帳明細歷史';
        [...this.state.expenses].reverse().forEach((e, revIdx) => { 
          const idx = this.state.expenses.length - 1 - revIdx; 
          const div = document.createElement('div'); 
          div.className = 'history-card'; 
          div.innerHTML = `
            <p style="color:gray; font-size:0.8rem;">${e.date}</p>
            <p><strong>${escapeHtml(e.desc)}</strong>：￥${e.amount}</p>
            <div class="history-actions">
              <button class="btn btn-sm danger" onclick="APP.deleteItem('expenses', ${idx}, 'expense')">刪除</button>
            </div>
          `; 
          this.dom.modalBody.appendChild(div); 
        });

      } else if (type === 'quickExpense') {
        this.dom.modalTitle.textContent = '編輯快速記帳按鈕';
        this.state.quickExpenses.forEach((q, idx) => { 
          const div = document.createElement('div'); 
          div.className = 'history-card'; 
          div.innerHTML = `
            <p>${q.label} (￥${q.amount})</p>
            <div class="history-actions">
              <button class="btn btn-sm secondary" onclick="APP.editQuickExpense(${idx})">編輯</button> 
              <button class="btn btn-sm danger" onclick="APP.deleteItem('quickExpenses', ${idx}, 'quickExpense')">刪除</button>
            </div>
          `; 
          this.dom.modalBody.appendChild(div); 
        });
        
        const addBtn = document.createElement('button'); 
        addBtn.className = 'btn secondary'; 
        addBtn.textContent = '+ 新增快捷鍵'; 
        addBtn.onclick = () => { 
          const label = prompt('按鈕名稱 (例: 咖啡)'); 
          if (!label) return; 
          const amount = Number(prompt('金額')); 
          if (amount) { 
            this.state.quickExpenses.push({ id: Date.now(), label, amount }); 
            this.saveState(); 
            this.renderExpenses(); 
            this.openModal('quickExpense'); 
          } 
        }; 
        this.dom.modalBody.appendChild(addBtn);

      } else if (type === 'note' || type === 'journal') {
        this.dom.modalTitle.textContent = type === 'note' ? '歷史備註' : '歷史週誌'; 
        const targetArr = this.state[type + 's'];
        
        [...targetArr].reverse().forEach((item, revIdx) => { 
          const idx = targetArr.length - 1 - revIdx; 
          const div = document.createElement('div'); 
          div.className = 'history-card'; 
          const title = type === 'journal' ? `第 ${item.week} 週` : ''; 
          
          div.innerHTML = `
            <p><strong>${title}</strong> <span style="font-size:0.8rem; color:gray;">${item.date}</span></p>
            <p style="white-space:pre-wrap;">${escapeHtml(item.text)}</p>
            <div class="history-actions">
              ${type === 'journal' ? `<button class="btn btn-sm secondary" onclick="APP.exportJournal(${idx})">匯出 PDF</button>` : ''} 
              <button class="btn btn-sm secondary" onclick="APP.editTextItem('${type}s', ${idx}, '${type}')">編輯</button> 
              <button class="btn btn-sm danger" onclick="APP.deleteItem('${type}s', ${idx}, '${type}')">刪除</button>
            </div>
          `; 
          this.dom.modalBody.appendChild(div); 
        });
      }
    },

    // --- 全局編輯與刪除輔助函式 ---
    deleteItem(arrayName, index, modalToReopen) { 
      if (confirm('確定刪除？')) { 
        this.state[arrayName].splice(index, 1); 
        this.saveState(); 
        this.renderAll(); 
        if (modalToReopen) this.openModal(modalToReopen); 
      } 
    },
    
    editTextItem(arrayName, index, modalToReopen) { 
      const newText = prompt('請修改內容:', this.state[arrayName][index].text); 
      if (newText) { 
        this.state[arrayName][index].text = newText; 
        this.saveState(); 
        this.renderAll(); 
        this.openModal(modalToReopen); 
      } 
    },

    editReminder(index) { 
      const r = this.state.reminders[index]; 
      const newTitle = prompt('修改提醒標題:', r.title); 
      if (newTitle) r.title = newTitle; 
      
      const newDate = prompt('修改日期 (YYYY-MM-DD):', r.date); 
      if (newDate) r.date = newDate; 
      
      this.saveState(); 
      this.renderReminders(); 
      this.updateDashboard(); 
    },

    editQuickExpense(index) { 
      const q = this.state.quickExpenses[index]; 
      const newLabel = prompt('名稱:', q.label); 
      if (newLabel) q.label = newLabel; 
      
      const newAmt = Number(prompt('金額:', q.amount)); 
      if (newAmt) q.amount = newAmt; 
      
      this.saveState(); 
      this.renderExpenses(); 
      this.openModal('quickExpense'); 
    },

    editPunch(date, idx) { 
      const rec = this.state.punchRecords[date].records[idx]; 
      const i = prompt('進 (HH:MM)', rec.in); 
      if (i) rec.in = i; 
      
      const o = prompt('出 (HH:MM)', rec.out || ''); 
      if (o !== null) rec.out = o; 
      
      this.saveState(); 
      this.renderHoursPage(); 
      this.openModal('punch'); 
    },

    editManualPunch(date) { 
      const h = Number(prompt('修改手動總時數', this.state.punchRecords[date].manualTotal)); 
      if (h > 0) { 
        this.state.punchRecords[date].manualTotal = h; 
        this.saveState(); 
        this.renderHoursPage(); 
        this.openModal('punch'); 
      } 
    },

    deletePunchDay(date) { 
      if (confirm('確定要刪除這天的所有打卡紀錄嗎？')) { 
        delete this.state.punchRecords[date]; 
        this.saveState(); 
        this.renderHoursPage(); 
        this.openModal('punch'); 
      } 
    },

    exportJournal(index) { 
      const j = this.state.journals[index]; 
      const win = window.open('', '_blank'); 
      win.document.write(`
        <html>
          <head>
            <title>第 ${j.week} 週週誌</title>
          </head>
          <body style="font-family: sans-serif; padding: 40px; line-height: 1.8;">
            <h2>第 ${j.week} 週實習週誌</h2>
            <hr>
            <p style="white-space: pre-wrap;">${escapeHtml(j.text)}</p>
          </body>
        </html>
      `); 
      win.document.close(); 
    },
    
    exportData() { 
      const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' }); 
      const a = document.createElement('a'); 
      a.href = URL.createObjectURL(blob); 
      a.download = `intern-backup-${this.getTodayStr()}.json`; 
      a.click(); 
    },
    
    importData(event) { 
      const file = event.target.files?.[0]; 
      if (!file) return; 
      const reader = new FileReader(); 
      reader.onload = e => { 
        try { 
          const data = JSON.parse(e.target.result); 
          this.state = { ...this.state, ...data }; 
          this.saveState(); 
          this.renderAll(); 
          alert('資料匯入成功！'); 
        } catch { 
          alert('檔案格式錯誤，匯入失敗。'); 
        } 
      }; 
      reader.readAsText(file); 
    },

    saveState() { 
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); 
    },
    
    loadState() { 
      const s = localStorage.getItem(STORAGE_KEY); 
      if (s) {
        try { 
          this.state = { ...this.state, ...JSON.parse(s) }; 
        } catch(e) {} 
      }
    }
  };

  function escapeHtml(text) { 
    const div = document.createElement('div'); 
    div.textContent = text; 
    return div.innerHTML; 
  }
  
  // 暴露給 window 讓 onclick 可以調用
  window.APP = APP; 
  document.addEventListener('DOMContentLoaded', () => APP.init());
})();