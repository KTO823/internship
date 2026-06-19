(() => {
  const STORAGE_KEY = 'intern-dashboard-v4';
  
  const APP = {
    state: {
      startDate: '',
      endDate: '',
      punchMode: 'realtime', // 'realtime' | 'manual'
      hoursTargetMode: 'monthly', // 'monthly' | 'total'
      hoursTarget: 160,
      exchangeRate: 0.21,
      
      punchRecords: {}, // 日期: { records: [{in, out}], manualTotal: 0 }
      expenses: [],     // { id, desc, amount, date }
      notes: [],        // { id, text, date }
      journals: [],     // { id, week, text, date }
      reminders: [
        { id: 'r1', title: '期末週誌繳交', date: '' },
        { id: 'r2', title: '實習影片完成', date: '' }
      ],
      checklist: [
        { id: 'c1', label: '填寫校外實習機構報到確認單', checked: false },
        { id: 'c2', label: '繳交登機證 / 報到單', checked: false },
        { id: 'c5', label: '繳交前期工作週誌', checked: false },
        { id: 'c6', label: '繳交實習影片', checked: false },
        { id: 'c9', label: '提交最終報告與滿意度', checked: false },
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
          document.getElementById(`page-${btn.dataset.page}`).classList.add('active');
          document.querySelectorAll(`[data-page="${btn.dataset.page}"]`).forEach(b => b.classList.add('active'));
        });
      });

      // 設定變更
      this.dom.setPunchMode.addEventListener('change', (e) => { this.state.punchMode = e.target.value; this.saveState(); this.renderHoursPage(); });
      this.dom.setHoursMode.addEventListener('change', (e) => { this.state.hoursTargetMode = e.target.value; this.saveState(); this.renderHoursPage(); this.updateDashboard(); });
      this.dom.setHoursTarget.addEventListener('change', (e) => { this.state.hoursTarget = Number(e.target.value)||160; this.saveState(); this.renderHoursPage(); this.updateDashboard(); });
      this.dom.setStart.addEventListener('change', (e) => { this.state.startDate = e.target.value; this.saveState(); this.updateDashboard(); });
      this.dom.setEnd.addEventListener('change', (e) => { this.state.endDate = e.target.value; this.saveState(); this.updateDashboard(); });

      // 打卡事件
      this.dom.btnIn.addEventListener('click', () => this.handleRealtimePunch('in'));
      this.dom.btnOut.addEventListener('click', () => this.handleRealtimePunch('out'));
      this.dom.manualSubmit.addEventListener('click', () => this.handleManualPunch());

      // 記帳事件
      this.dom.expAdd.addEventListener('click', () => {
        const amount = Number(this.dom.expAmount.value);
        const desc = this.dom.expDesc.value.trim() || '自訂支出';
        if (amount > 0) { this.addExpenseRecord(desc, amount); this.dom.expAmount.value = ''; this.dom.expDesc.value = ''; }
      });

      // 備註與週誌
      document.getElementById('save-note').addEventListener('click', () => {
        const text = document.getElementById('quick-note').value.trim();
        if(text) { this.state.notes.push({ id: Date.now(), text, date: this.getNowString() }); document.getElementById('quick-note').value=''; this.saveState(); alert('備註已儲存'); }
      });
      document.getElementById('save-journal').addEventListener('click', () => {
        const text = document.getElementById('weekly-journal').value.trim();
        if(text) { this.state.journals.push({ id: Date.now(), week: this.getWeekNum(), text, date: this.getNowString() }); document.getElementById('weekly-journal').value=''; this.saveState(); alert('週誌已儲存'); }
      });

      // 提醒事項新增
      document.getElementById('add-reminder').addEventListener('click', () => {
        const title = document.getElementById('new-reminder-title').value.trim();
        const date = document.getElementById('new-reminder-date').value;
        if(title && date) { this.state.reminders.push({ id: Date.now().toString(), title, date }); this.saveState(); this.renderReminders(); }
      });

      // 管理按鈕 (開啟 Modal)
      document.getElementById('btn-manage-punch').addEventListener('click', () => this.openModal('punch'));
      document.getElementById('btn-manage-expense').addEventListener('click', () => this.openModal('expense'));
      document.getElementById('btn-edit-quick-expense').addEventListener('click', () => this.openModal('quickExpense'));
      document.getElementById('btn-manage-note').addEventListener('click', () => this.openModal('note'));
      document.getElementById('btn-manage-journal').addEventListener('click', () => this.openModal('journal'));
      
      // Modal 關閉
      this.dom.modalClose.addEventListener('click', () => this.dom.modal.classList.remove('active'));
    },

    getNowString() { return new Date().toLocaleString('zh-Hant', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }); },
    getTodayStr() { return new Date().toISOString().slice(0, 10); },
    getWeekNum() { return this.state.startDate ? Math.floor((new Date() - new Date(this.state.startDate)) / 86400000 / 7) + 1 : '未設定'; },

    // --- 打卡邏輯 ---
    handleRealtimePunch(type) {
      const today = this.getTodayStr();
      const timeStr = new Date().toTimeString().slice(0,5);
      if(!this.state.punchRecords[today]) this.state.punchRecords[today] = { records: [], manualTotal: 0 };
      
      const recs = this.state.punchRecords[today].records;
      if(type === 'in') recs.push({ in: timeStr, out: null });
      else if(type === 'out' && recs.length) recs[recs.length-1].out = timeStr;
      
      this.saveState(); this.renderHoursPage();
    },
    
    handleManualPunch() {
      const hours = Number(this.dom.manualInput.value);
      if(hours > 0) {
        const today = this.getTodayStr();
        if(!this.state.punchRecords[today]) this.state.punchRecords[today] = { records: [], manualTotal: 0 };
        this.state.punchRecords[today].manualTotal = hours; // 覆蓋今日總手動時數
        this.saveState(); this.renderHoursPage(); this.dom.manualInput.value = ''; alert('今日總時數已紀錄！');
      }
    },

    calcTotalHours() {
      let total = 0;
      Object.values(this.state.punchRecords).forEach(day => {
        if (day.manualTotal > 0) { total += day.manualTotal; }
        else if (day.records) {
          day.records.forEach(r => {
            if(r.out) {
              const [ih, im] = r.in.split(':').map(Number); const [oh, om] = r.out.split(':').map(Number);
              total += Math.max(0, (oh*60+om) - (ih*60+im)) / 60;
            }
          });
        }
      });
      return total;
    },

    // --- 記帳邏輯 ---
    addExpenseRecord(desc, amount) {
      this.state.expenses.push({ id: Date.now(), desc, amount, date: this.getNowString() });
      this.saveState(); this.renderExpenses();
    },

    async fetchExchangeRate() {
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/JPY');
        const data = await res.json();
        if (data?.rates?.TWD) { this.state.exchangeRate = data.rates.TWD; this.saveState(); this.renderExpenses(); }
      } catch (e) {}
    },

    // --- 渲染畫面 ---
    renderAll() {
      // 填入設定初始值
      this.dom.setPunchMode.value = this.state.punchMode;
      this.dom.setHoursMode.value = this.state.hoursTargetMode;
      this.dom.setHoursTarget.value = this.state.hoursTarget;
      this.dom.setStart.value = this.state.startDate;
      this.dom.setEnd.value = this.state.endDate;
      
      this.renderHoursPage();
      this.renderExpenses();
      this.renderReminders();
      this.renderChecklist();
      this.updateDashboard();
    },

    renderHoursPage() {
      // 根據設定切換顯示區塊
      if(this.state.punchMode === 'manual') {
        this.dom.secRealtime.style.display = 'none'; this.dom.secManual.style.display = 'block';
      } else {
        this.dom.secRealtime.style.display = 'block'; this.dom.secManual.style.display = 'none';
      }

      // 顯示今日打卡摘要
      const today = this.getTodayStr();
      const todayData = this.state.punchRecords[today];
      this.dom.todayPunchList.innerHTML = '<p style="margin:0; font-size:0.9rem; color:var(--text-muted);">今日狀態：</p>';
      if(todayData) {
        if(todayData.manualTotal > 0) {
          this.dom.todayPunchList.innerHTML += `<strong>已手動紀錄 ${todayData.manualTotal} 小時</strong>`;
        } else {
          todayData.records.forEach(r => {
            this.dom.todayPunchList.innerHTML += `<div>進: ${r.in} - 出: ${r.out || '進行中'}</div>`;
          });
        }
      } else { this.dom.todayPunchList.innerHTML += '尚未記錄'; }

      // 計算總時數與目標
      const total = this.calcTotalHours();
      document.getElementById('hours-display').textContent = total.toFixed(1);
      
      const targetLabel = this.state.hoursTargetMode === 'total' ? '總工時目標' : '月度工時目標';
      document.getElementById('hours-target-label').textContent = targetLabel;
      document.getElementById('hours-hint').textContent = `目標 ${this.state.hoursTarget} 小時`;
      
      // 更新儀表板
      const pct = Math.min(100, Math.round((total / this.state.hoursTarget) * 100));
      document.getElementById('progress-hours-text').textContent = `${total.toFixed(1)}/${this.state.hoursTarget} 小時`;
      document.getElementById('progress-hours').style.width = `${pct}%`;
    },

    renderExpenses() {
      // 計算當月/總支出
      const totalJpy = this.state.expenses.reduce((sum, e) => sum + e.amount, 0);
      const totalNtd = Math.round(totalJpy * this.state.exchangeRate);
      
      document.getElementById('expense-jpy').textContent = `￥${totalJpy}`;
      document.getElementById('expense-ntd').textContent = `NT$${totalNtd}`;
      document.getElementById('progress-expense-text').textContent = `￥${totalJpy} / NT$${totalNtd}`;

      // 渲染快捷鍵
      this.dom.expQuickBox.innerHTML = '';
      this.state.quickExpenses.forEach(q => {
        const btn = document.createElement('button'); btn.className = 'btn-expense';
        btn.textContent = `${q.label} ￥${q.amount}`;
        btn.addEventListener('click', () => this.addExpenseRecord(q.label, q.amount));
        this.dom.expQuickBox.appendChild(btn);
      });
    },

    renderReminders() {
      const list = document.getElementById('dash-reminders');
      const fullList = document.getElementById('reminder-list');
      list.innerHTML = ''; fullList.innerHTML = '';

      this.state.reminders.forEach((r, idx) => {
        const d = Math.ceil((new Date(r.date) - new Date()) / 86400000);
        const status = d < 0 ? '已過期' : d === 0 ? '今天截止' : `剩 ${d} 天`;
        
        // 儀表板用
        if(idx < 3) list.innerHTML += `<div class="reminder-item"><div class="reminder-text"><h4>${escapeHtml(r.title)}</h4><p>${status}</p></div></div>`;
        
        // 檢查表頁面用 (帶編輯/刪除)
        const row = document.createElement('div'); row.className = 'reminder-item';
        row.innerHTML = `<div class="reminder-text"><h4>${escapeHtml(r.title)}</h4><p>${r.date} (${status})</p></div>
          <div>
            <button class="btn-icon" style="color:var(--primary);" onclick="APP.editReminder(${idx})">✏️</button>
            <button class="btn-icon" style="color:var(--danger);" onclick="APP.deleteItem('reminders', ${idx})">🗑️</button>
          </div>`;
        fullList.appendChild(row);
      });
    },

    renderChecklist() {
      const cl = document.getElementById('checklist'); cl.innerHTML = '';
      let checked = 0;
      this.state.checklist.forEach(c => {
        if(c.checked) checked++;
        const lbl = document.createElement('label'); lbl.className = 'checklist-item';
        lbl.innerHTML = `<input type="checkbox" ${c.checked?'checked':''}><span>${escapeHtml(c.label)}</span>`;
        lbl.querySelector('input').addEventListener('change', e => { c.checked = e.target.checked; this.saveState(); this.updateDashboard(); });
        cl.appendChild(lbl);
      });
      document.getElementById('progress-checklist-text').textContent = `${checked}/${this.state.checklist.length} 項`;
      document.getElementById('progress-checklist').style.width = `${Math.round((checked/this.state.checklist.length)*100)}%`;
    },

    updateDashboard() {
      if(this.state.startDate && this.state.endDate) {
        const total = Math.max(1, Math.ceil((new Date(this.state.endDate) - new Date(this.state.startDate)) / 86400000));
        const passed = Math.max(0, Math.ceil((new Date() - new Date(this.state.startDate)) / 86400000));
        const pct = Math.min(100, Math.round((passed / total) * 100));
        document.getElementById('progress-text').textContent = `${pct}%`;
        document.getElementById('progress-main').style.width = `${pct}%`;
      }
    },

    // --- 萬用彈出視窗 (Modal) 管理系統 ---
    openModal(type) {
      this.dom.modal.classList.add('active');
      this.dom.modalBody.innerHTML = '';

      if (type === 'punch') {
        this.dom.modalTitle.textContent = '打卡歷史紀錄';
        Object.keys(this.state.punchRecords).sort().reverse().forEach(date => {
          const day = this.state.punchRecords[date];
          const div = document.createElement('div'); div.className = 'history-card';
          let html = `<p><strong>${date}</strong></p>`;
          if(day.manualTotal > 0) html += `<p>手動時數: ${day.manualTotal} 小時</p>`;
          else day.records.forEach((r, i) => { html += `<p>進: ${r.in} | 出: ${r.out||'--'} <button class="btn-sm secondary" onclick="APP.editPunch('${date}', ${i})">改</button></p>`; });
          html += `<div class="history-actions"><button class="btn btn-sm danger" onclick="APP.deletePunchDay('${date}')">刪除整日</button></div>`;
          div.innerHTML = html; this.dom.modalBody.appendChild(div);
        });

      } else if (type === 'expense') {
        this.dom.modalTitle.textContent = '記帳明細歷史';
        [...this.state.expenses].reverse().forEach((e, revIdx) => {
          const idx = this.state.expenses.length - 1 - revIdx;
          const div = document.createElement('div'); div.className = 'history-card';
          div.innerHTML = `<p style="color:gray;font-size:0.8rem;">${e.date}</p><p><strong>${escapeHtml(e.desc)}</strong>：￥${e.amount}</p>
            <div class="history-actions"><button class="btn btn-sm danger" onclick="APP.deleteItem('expenses', ${idx}, 'expense')">刪除</button></div>`;
          this.dom.modalBody.appendChild(div);
        });

      } else if (type === 'quickExpense') {
        this.dom.modalTitle.textContent = '編輯快速記帳按鈕';
        this.state.quickExpenses.forEach((q, idx) => {
          const div = document.createElement('div'); div.className = 'history-card';
          div.innerHTML = `<p>${q.label} (￥${q.amount})</p><div class="history-actions">
            <button class="btn btn-sm secondary" onclick="APP.editQuickExpense(${idx})">編輯</button>
            <button class="btn btn-sm danger" onclick="APP.deleteItem('quickExpenses', ${idx}, 'quickExpense')">刪除</button></div>`;
          this.dom.modalBody.appendChild(div);
        });
        const addBtn = document.createElement('button'); addBtn.className='btn secondary'; addBtn.textContent='+ 新增快捷鍵';
        addBtn.onclick = () => {
          const label = prompt('按鈕名稱 (例: 咖啡)'); if(!label) return;
          const amount = Number(prompt('金額')); if(amount) { this.state.quickExpenses.push({id:Date.now(), label, amount}); this.saveState(); this.renderExpenses(); this.openModal('quickExpense'); }
        };
        this.dom.modalBody.appendChild(addBtn);

      } else if (type === 'note' || type === 'journal') {
        this.dom.modalTitle.textContent = type === 'note' ? '歷史備註' : '歷史週誌';
        const targetArr = this.state[type + 's'];
        [...targetArr].reverse().forEach((item, revIdx) => {
          const idx = targetArr.length - 1 - revIdx;
          const div = document.createElement('div'); div.className = 'history-card';
          const title = type==='journal' ? `第 ${item.week} 週` : '';
          div.innerHTML = `<p><strong>${title}</strong> <span style="font-size:0.8rem;color:gray;">${item.date}</span></p><p style="white-space:pre-wrap;">${escapeHtml(item.text)}</p>
            <div class="history-actions">
              ${type==='journal' ? `<button class="btn btn-sm secondary" onclick="APP.exportJournal(${idx})">匯出 PDF</button>` : ''}
              <button class="btn btn-sm secondary" onclick="APP.editTextItem('${type}s', ${idx}, '${type}')">編輯</button>
              <button class="btn btn-sm danger" onclick="APP.deleteItem('${type}s', ${idx}, '${type}')">刪除</button>
            </div>`;
          this.dom.modalBody.appendChild(div);
        });
      }
    },

    // --- 全局編輯與刪除輔助函式 ---
    deleteItem(arrayName, index, modalToReopen) {
      if(confirm('確定刪除？')) {
        this.state[arrayName].splice(index, 1); this.saveState(); this.renderAll();
        if(modalToReopen) this.openModal(modalToReopen);
      }
    },
    editTextItem(arrayName, index, modalToReopen) {
      const newText = prompt('請修改內容:', this.state[arrayName][index].text);
      if(newText) { this.state[arrayName][index].text = newText; this.saveState(); this.openModal(modalToReopen); }
    },
    editReminder(index) {
      const r = this.state.reminders[index];
      const newTitle = prompt('修改提醒標題:', r.title); if(newTitle) r.title = newTitle;
      const newDate = prompt('修改日期 (YYYY-MM-DD):', r.date); if(newDate) r.date = newDate;
      this.saveState(); this.renderReminders();
    },
    editQuickExpense(index) {
      const q = this.state.quickExpenses[index];
      const newLabel = prompt('名稱:', q.label); if(newLabel) q.label = newLabel;
      const newAmt = Number(prompt('金額:', q.amount)); if(newAmt) q.amount = newAmt;
      this.saveState(); this.renderExpenses(); this.openModal('quickExpense');
    },
    editPunch(date, idx) {
      const rec = this.state.punchRecords[date].records[idx];
      const i = prompt('進 (HH:MM)', rec.in); if(i) rec.in=i;
      const o = prompt('出 (HH:MM)', rec.out||''); if(o!==null) rec.out=o;
      this.saveState(); this.renderHoursPage(); this.openModal('punch');
    },
    deletePunchDay(date) {
      if(confirm('刪除這天所有打卡？')) { delete this.state.punchRecords[date]; this.saveState(); this.renderHoursPage(); this.openModal('punch'); }
    },
    exportJournal(index) {
      const j = this.state.journals[index];
      const win = window.open('','_blank');
      win.document.write(`<html><head><title>第${j.week}週</title></head><body style="font-family:sans-serif;padding:40px;line-height:1.8;"><h2>第 ${j.week} 週實習週誌</h2><hr><p style="white-space:pre-wrap;">${escapeHtml(j.text)}</p></body></html>`);
      win.document.close();
    },

    saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); },
    loadState() { const s = localStorage.getItem(STORAGE_KEY); if(s) try { this.state = {...this.state, ...JSON.parse(s)}; }catch(e){} }
  };

  function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
  
  // 暴露給 window 讓 onclick 可調用
  window.APP = APP;
  document.addEventListener('DOMContentLoaded', () => APP.init());
})();