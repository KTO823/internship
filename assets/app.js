// 引入 Firebase 模組
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_O2QrUhJo7YqG9rX0DvucMDslw4sF-Io",
  authDomain: "internship-5434c.firebaseapp.com",
  projectId: "internship-5434c",
  storageBucket: "internship-5434c.firebasestorage.app",
  messagingSenderId: "997860315918",
  appId: "1:997860315918:web:562eba719dcd16780f7d5f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

const STORAGE_KEY = 'intern-dashboard-v9'; 

const APP = {
  state: {
    user: { isLoggedIn: false, name: '' },
    startDate: '',
    endDate: '',
    punchMode: 'realtime',
    hoursTargetMode: 'monthly',
    hoursTarget: 160,
    exchangeRate: 0.21,
    currentExpenseMonth: '',
    punchRecords: {},
    expenses: [],
    notes: [],
    journals: [],
    galleryImages: [], 
    checkInCount: 0,
    lastCheckInDate: '',
    checkInHistory: [], 
    currentTheme: 'default',
    unlockedThemes: ['default'],
    reminders: [
      { id: 'r1', title: '出國前準備：日幣 10 萬圓生活費', date: '2026-07-01' },
    ],
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
  
  firebaseUser: null,

  init() {
    this.cacheDom();
    this.setupListeners();
    this.loadLocalState();
    
    if (!this.state.currentExpenseMonth) {
      const d = new Date();
      this.state.currentExpenseMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!this.state.checkInHistory) this.state.checkInHistory = []; 
    if (!this.state.galleryImages) this.state.galleryImages = [];

    this.applyTheme();
    this.renderAll();
    this.fetchExchangeRate();

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.firebaseUser = user;
        if (this.dom.settingsStatus) this.dom.settingsStatus.textContent = `已登入：${user.displayName} (資料同步中...)`;
        await this.loadCloudState(user);
        if (this.dom.settingsStatus) this.dom.settingsStatus.textContent = `已連線雲端：${user.displayName}`;
        if (this.dom.sidebarUser) this.dom.sidebarUser.textContent = user.displayName;
        if (this.dom.settingsLogin) this.dom.settingsLogin.style.display = 'none';
        if (this.dom.sidebarLogout) this.dom.sidebarLogout.style.display = 'block';
        const loginReminder = document.getElementById('login-reminder-box');
        if (loginReminder) loginReminder.style.display = 'none';
      } else {
        this.firebaseUser = null;
        this.state.user = { isLoggedIn: false, name: '' };
        if (this.dom.settingsStatus) this.dom.settingsStatus.textContent = '未登入 (目前僅保存在本機)';
        if (this.dom.sidebarUser) this.dom.sidebarUser.textContent = '未登入';
        if (this.dom.settingsLogin) this.dom.settingsLogin.style.display = 'block';
        if (this.dom.sidebarLogout) this.dom.sidebarLogout.style.display = 'none';
        this.saveStateLocally(); 
        const loginReminder = document.getElementById('login-reminder-box');
        if (loginReminder) loginReminder.style.display = 'block';
      }
      this.applyTheme();
      this.renderAll();

      setTimeout(() => {
        // 如果還沒登入，且這次打開網頁還沒看過教學，就自動彈出教學與登入提醒
        if (!user && !sessionStorage.getItem('guideShown')) {
          this.showGuidePopup();
          sessionStorage.setItem('guideShown', 'true');
        } 
        // 否則，如果已經登入，且今天還沒簽到，就自動彈出簽到視窗
        else if (this.state.lastCheckInDate !== this.getTodayStr()) {
          this.showDailyCheckInPopup();
        }
      }, 500);
    });
  },

  cacheDom() {
    this.dom = {
      pages: document.querySelectorAll('.page'),
      navBtns: document.querySelectorAll('.nav-item, .tab-item'),
      menuToggles: document.querySelectorAll('.btn-menu'),
      sidebar: document.querySelector('.desktop-sidebar'),
      
      settingsPunchMode: document.getElementById('settings-punch-mode'),
      settingsHoursMode: document.getElementById('settings-hours-mode'),
      settingsHoursTarget: document.getElementById('settings-hours-target'),
      settingsStart: document.getElementById('settings-start'),
      settingsEnd: document.getElementById('settings-end'),
      btnHoursHelp: document.getElementById('btn-hours-help'),
      settingsLogin: document.getElementById('settings-login'),
      sidebarLogout: document.getElementById('sidebar-logout'),
      settingsStatus: document.getElementById('settings-status'),
      sidebarUser: document.getElementById('sidebar-user'),
      
      secRealtime: document.getElementById('punch-realtime-section'),
      secManual: document.getElementById('punch-manual-section'),
      btnIn: document.getElementById('punch-in'),
      btnOut: document.getElementById('punch-out'),
      manualInput: document.getElementById('manual-hours-input'),
      manualSubmit: document.getElementById('manual-hours-submit'),
      todayPunchList: document.getElementById('today-punch-list'),
      
      btnPrevMonth: document.getElementById('btn-prev-month'),
      btnNextMonth: document.getElementById('btn-next-month'),
      monthDisplay: document.getElementById('current-month-display'),
      monthlyExpenseList: document.getElementById('monthly-expense-list'),
      
      fabAddExpense: document.getElementById('btn-fab-add-expense'), // 新增：懸浮按鈕
      
      themeSelect: document.getElementById('settings-theme-select'),
      historyCheckinCount: document.getElementById('history-checkin-count'),
      historyLastCheckin: document.getElementById('history-last-checkin'),
      
      modal: document.getElementById('modal-overlay'),
      modalClose: document.getElementById('modal-close'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
    };
  },

  setupListeners() {
    // 🌟 把它放在這裡！setupListeners 的一開頭，讓它只綁定一次
    const btnShowGuide = document.getElementById('btn-show-guide');
    if (btnShowGuide) {
      btnShowGuide.addEventListener('click', () => this.showGuidePopup());
    }

    this.dom.navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.pages.forEach(p => p.classList.remove('active'));
        this.dom.navBtns.forEach(b => b.classList.remove('active'));
        
        const targetPage = document.getElementById(`page-${btn.dataset.page}`);
        if (targetPage) targetPage.classList.add('active');
        document.querySelectorAll(`[data-page="${btn.dataset.page}"]`).forEach(b => b.classList.add('active'));
        if (window.innerWidth < 1024 && this.dom.sidebar) {
          this.dom.sidebar.style.display = 'none';
        }
      });
    });

    if (this.dom.menuToggles) {
      this.dom.menuToggles.forEach(btn => {
        btn.addEventListener('click', () => {
          if (this.dom.sidebar) {
            this.dom.sidebar.style.display = (this.dom.sidebar.style.display === 'flex') ? 'none' : 'flex';
          }
        });
      });
    }

    if (this.dom.settingsPunchMode) this.dom.settingsPunchMode.addEventListener('change', (e) => { this.state.punchMode = e.target.value; this.saveState(); this.renderHoursPage(); });
    if (this.dom.settingsHoursMode) this.dom.settingsHoursMode.addEventListener('change', (e) => { this.state.hoursTargetMode = e.target.value; this.saveState(); this.renderHoursPage(); this.updateDashboard(); });
    if (this.dom.settingsHoursTarget) this.dom.settingsHoursTarget.addEventListener('change', (e) => { this.state.hoursTarget = Number(e.target.value) || 160; this.saveState(); this.renderHoursPage(); this.updateDashboard(); });
    if (this.dom.settingsStart) this.dom.settingsStart.addEventListener('change', (e) => { this.state.startDate = e.target.value; this.saveState(); this.updateDashboard(); });
    if (this.dom.settingsEnd) this.dom.settingsEnd.addEventListener('change', (e) => { this.state.endDate = e.target.value; this.saveState(); this.updateDashboard(); });

    if (this.dom.settingsLogin) {
      this.dom.settingsLogin.addEventListener('click', async () => {
        try { await signInWithPopup(auth, provider); } catch (error) { alert('登入失敗：' + error.message); }
      });
    }
    const guideLoginBtn = document.getElementById('guide-login-btn');
    if (guideLoginBtn) {
      guideLoginBtn.addEventListener('click', async () => {
        try { 
          await signInWithPopup(auth, provider); 
        } catch (error) { 
          alert('登入失敗：' + error.message); 
        }
      });
    }

    if (this.dom.sidebarLogout) {
      this.dom.sidebarLogout.addEventListener('click', async () => {
        if (confirm('確定要登出嗎？登出後將無法同步雲端資料。')) {
          await signOut(auth); alert('已登出');
        }
      });
    }

    if (this.dom.btnHoursHelp) this.dom.btnHoursHelp.addEventListener('click', () => { alert('【每月目標】\n進度只算當月累積。\n\n【總時數目標】\n進度會累加實習期間的所有時數。'); });

    if (this.dom.btnIn) this.dom.btnIn.addEventListener('click', () => this.handleRealtimePunch('in'));
    if (this.dom.btnOut) this.dom.btnOut.addEventListener('click', () => this.handleRealtimePunch('out'));
    if (this.dom.manualSubmit) this.dom.manualSubmit.addEventListener('click', () => this.handleManualPunch());

    if (this.dom.btnPrevMonth) this.dom.btnPrevMonth.addEventListener('click', () => this.changeExpenseMonth(-1));
    if (this.dom.btnNextMonth) this.dom.btnNextMonth.addEventListener('click', () => this.changeExpenseMonth(1));

    // ⬇️ 綁定懸浮按鈕：開啟記帳選單
    if (this.dom.fabAddExpense) {
      this.dom.fabAddExpense.addEventListener('click', () => {
        this.openModal('addExpense');
      });
    }

    if (this.dom.themeSelect) {
      this.dom.themeSelect.addEventListener('change', (e) => {
        this.state.currentTheme = e.target.value;
        this.saveState();
        this.applyTheme();
      });
    }

    const saveNoteBtn = document.getElementById('save-note');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', () => {
        const noteInput = document.getElementById('quick-note');
        const text = noteInput.value.trim();
        if (text) { 
          this.state.notes.push({ id: Date.now(), text, date: this.getNowString() }); 
          this.checkShibaEgg(text); 
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
          this.checkShibaEgg(text); 
          journalInput.value = ''; 
          this.saveState(); 
          alert('週誌已儲存'); 
        }
      });
    }

    const btnExportCsv = document.getElementById('export-csv');
    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => this.exportToCSV());
    }

    const addReminderBtn = document.getElementById('add-reminder');
    if (addReminderBtn) {
      addReminderBtn.addEventListener('click', () => {
        const title = document.getElementById('new-reminder-title').value.trim();
        const date = document.getElementById('new-reminder-date').value;
        if (title && date) { this.state.reminders.push({ id: Date.now().toString(), title, date }); this.saveState(); this.renderReminders(); this.updateDashboard(); }
      });
    }

    const bindModal = (btnId, type) => {
      const btn = document.getElementById(btnId);
      if (btn) btn.addEventListener('click', () => this.openModal(type));
    };
    
    bindModal('btn-manage-punch', 'punch');
    bindModal('btn-manage-expense', 'expense');
    bindModal('btn-manage-note', 'note');
    bindModal('btn-manage-journal', 'journal');
    bindModal('btn-view-checkin-history', 'checkInHistory');
    bindModal('btn-manage-checklist', 'manageChecklist');
    
    const btnOpenGallery = document.getElementById('btn-open-gallery');
    if (btnOpenGallery) {
      btnOpenGallery.addEventListener('click', () => this.openModal('gallery'));
    }
    
    if (this.dom.modalClose) this.dom.modalClose.addEventListener('click', () => { this.dom.modal.classList.remove('active'); });

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
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  
  getWeekNum() { 
    if (!this.state.startDate) return '未設定';
    const msDiff = new Date() - new Date(this.state.startDate);
    return Math.floor(msDiff / 86400000 / 7) + 1; 
  },

  handleRealtimePunch(type) {
    const today = this.getTodayStr();
    const timeStr = new Date().toTimeString().slice(0,5);
    if (!this.state.punchRecords[today]) this.state.punchRecords[today] = { records: [], manualTotal: 0 };
    const recs = this.state.punchRecords[today].records;
    
    if (type === 'in') recs.push({ in: timeStr, out: null });
    else if (type === 'out' && recs.length > 0) recs[recs.length - 1].out = timeStr;
    
    this.saveState(); this.renderHoursPage();
  },
  
  handleManualPunch() {
    const hours = Number(this.dom.manualInput.value);
    if (hours > 0) {
      const today = this.getTodayStr();
      if (!this.state.punchRecords[today]) this.state.punchRecords[today] = { records: [], manualTotal: 0 };
      this.state.punchRecords[today].manualTotal = hours; 
      this.saveState(); this.renderHoursPage(); this.dom.manualInput.value = ''; alert('今日總時數已紀錄！');
    }
  },

  calcTotalHours() {
    let total = 0;
    Object.values(this.state.punchRecords).forEach(day => {
      if (day.manualTotal > 0) total += day.manualTotal; 
      else if (day.records) {
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

  changeExpenseMonth(offset) {
    if (!this.state.currentExpenseMonth) return;
    let [year, month] = this.state.currentExpenseMonth.split('-').map(Number);
    month += offset;
    if (month > 12) { month = 1; year++; }
    else if (month < 1) { month = 12; year--; }
    this.state.currentExpenseMonth = `${year}-${String(month).padStart(2, '0')}`;
    this.saveState();
    this.renderExpenses();
  },

  addExpenseRecord(desc, amount, customDate = null) {
    const targetDate = customDate || this.getTodayStr();
    const currentIsoMonth = targetDate.slice(0, 7);
    this.state.expenses.push({ 
      id: Date.now(), 
      desc, 
      amount, 
      date: targetDate, 
      isoMonth: currentIsoMonth
    });
    this.state.currentExpenseMonth = currentIsoMonth; 
    this.saveState(); 
    this.renderExpenses();
  },

  async fetchExchangeRate() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/JPY');
      const data = await res.json();
      if (data && data.rates && data.rates.TWD) { 
        this.state.exchangeRate = data.rates.TWD; 
        this.saveStateLocally(); 
        this.renderExpenses(); 
      }
    } catch (e) { console.warn('匯率更新失敗'); }
  },

  showDailyCheckInPopup() {
    if (!this.dom.modal) return;
    this.dom.modal.classList.add('active');
    this.dom.modalTitle.textContent = '🌟 每日簽到';
    
    this.dom.modalBody.innerHTML = `
      <div style="text-align: center; padding: 20px 10px;">
        <p style="margin-bottom: 24px; font-size: 1.1rem; color: var(--text); line-height: 1.6;">
          日安！新的一天開始了！<br>
          記得完成今日簽到，累積專屬主題解鎖進度喔！
        </p>
        <button class="btn" id="btn-modal-checkin" style="width: 100%; font-size: 1.1rem; padding: 12px;">完成簽到 <span class="dynamic-icon icon-checkin"></span></button>
      </div>
    `;

    document.getElementById('btn-modal-checkin').addEventListener('click', () => {
      this.handleCheckIn();
      this.dom.modal.classList.remove('active');
    });
  },

  handleCheckIn() {
    const today = this.getTodayStr();
    if (this.state.lastCheckInDate === today) return;
    
    this.state.checkInCount++;
    this.state.lastCheckInDate = today;
    
    if (!this.state.checkInHistory) this.state.checkInHistory = [];
    if (!this.state.checkInHistory.includes(today)) {
      this.state.checkInHistory.push(today);
    }
    
    let msg = `簽到成功！目前已累計簽到 ${this.state.checkInCount} 天！`;
    
    if (this.state.checkInCount >= 14 && !this.state.unlockedThemes.includes('theme-monochrome')) {
      this.state.unlockedThemes.push('theme-monochrome');
      msg += '\n\n🎉 達成 14 天簽到！已解鎖主題「簡約黑白」！';
    }
    if (this.state.checkInCount >= 50 && !this.state.unlockedThemes.includes('theme-neon-sakura')) {
      this.state.unlockedThemes.push('theme-neon-sakura');
      msg += '\n\n🎉 達成 50 天簽到！已解鎖主題「夜櫻霓虹」！';
    }
    if (this.state.checkInCount >= 100 && !this.state.unlockedThemes.includes('theme-makie-gold')) {
      this.state.unlockedThemes.push('theme-makie-gold');
      msg += '\n\n🎉 達成 100 天簽到！已解鎖主題「蒔繪金箔」！';
    }
    if (this.state.checkInCount >= 200 && !this.state.unlockedThemes.includes('theme-aurora-stage')) {
      this.state.unlockedThemes.push('theme-aurora-stage');
      msg += '\n\n🎉 達成 200 天簽到！已解鎖主題「幻光星海」！';
    }
    
    alert(msg);
    this.saveState();
    this.renderAll();
  },

  checkShibaEgg(text) {
    if (this.state.unlockedThemes.includes('theme-shiba-gold')) return;
    const dogKeywords = ['狗', '犬', 'dog', '柴犬', 'shiba', '汪汪', '小狗', '因', 'puppy'];
    const hasKeyword = dogKeywords.some(kw => text.toLowerCase().includes(kw));
    if (hasKeyword) {
      this.state.unlockedThemes.push('theme-shiba-gold');
      alert('🐾 隱藏彩蛋觸發！\n偵測到紀錄中包含狗的相關文字！已成功解鎖特殊單獨主題：「暖心柴柴版」！🐶✨\n可以去設定頁面切換看看囉！');
    }
  },

  applyTheme() {
    document.body.classList.remove('theme-monochrome', 'theme-neon-sakura', 'theme-makie-gold', 'theme-aurora-stage', 'theme-shiba-gold');
    if (this.state.currentTheme !== 'default') {
      document.body.classList.add(this.state.currentTheme);
    }
  },

  renderAll() {
    if (this.dom.settingsPunchMode) this.dom.settingsPunchMode.value = this.state.punchMode;
    if (this.dom.settingsHoursMode) this.dom.settingsHoursMode.value = this.state.hoursTargetMode;
    if (this.dom.settingsHoursTarget) this.dom.settingsHoursTarget.value = this.state.hoursTarget;
    if (this.dom.settingsStart) this.dom.settingsStart.value = this.state.startDate;
    if (this.dom.settingsEnd) this.dom.settingsEnd.value = this.state.endDate;

    this.renderHoursPage();
    this.renderExpenses();
    this.renderReminders();
    this.renderChecklist();
    this.updateDashboard();
    
    this.renderCheckInHistoryUI();
    this.renderThemeSelectUI();
  },

  renderCheckInHistoryUI() {
    if (!this.dom.historyCheckinCount || !this.dom.historyLastCheckin) return;
    this.dom.historyCheckinCount.textContent = this.state.checkInCount || 0;
    this.dom.historyLastCheckin.textContent = this.state.lastCheckInDate || '尚無紀錄';
  },

  showGuidePopup() {
    if (!this.dom.modal) return;
    this.dom.modal.classList.add('active');
    this.dom.modalTitle.textContent = '👋 歡迎使用實習助手';
    
    let loginHtml = '';
    if (!this.firebaseUser) {
      loginHtml = `
        <div style="margin-top: 20px; padding: 16px; background: rgba(255, 68, 68, 0.08); border-radius: 12px; border: 1px dashed #ff4444; text-align: center;">
          <p style="margin: 0 0 8px 0; color: #ff4444; font-size: 1rem; font-weight: 700;">⚠️ 尚未登入雲端帳號</p>
          <p style="margin: 0 0 12px 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.5;">目前資料僅保存在本機，若清除瀏覽器紀錄將會遺失。<br>強烈建議登入以啟用自動雲端備份！</p>
          <button class="btn" id="modal-guide-login" style="background: #ff4444; color: white; width: 100%; border: none;">立即登入 Google</button>
        </div>
      `;
    } else {
      loginHtml = `
        <div style="margin-top: 20px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 12px; text-align: center;">
          <p style="margin: 0; color: #10b981; font-weight: 700;">✅ 已登入雲端，資料安全同步中</p>
        </div>
      `;
    }

    this.dom.modalBody.innerHTML = `
      <div style="padding: 10px 4px;">
        <p style="font-size: 0.95rem; color: var(--text); line-height: 1.8; margin-top: 0;">
          這是一款專為實習生打造的紀錄工具：<br><br>
          <span style="display:flex; align-items:center; margin-bottom:8px;"><span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center;">⏳</span> <b>工時打卡</b>：自動計算總工時與進度。</span>
          <span style="display:flex; align-items:center; margin-bottom:8px;"><span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center;">💰</span> <b>記帳系統</b>：追蹤花費，自動換算台幣。</span>
          <span style="display:flex; align-items:center; margin-bottom:8px;"><span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center;">📝</span> <b>實習週誌</b>：隨手記錄，一鍵匯出報告。</span>
          <span style="display:flex; align-items:center; margin-bottom:8px;"><span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center;">✅</span> <b>檢查表</b>：追蹤學校文件，不漏接死線。</span>
        </p>
        ${loginHtml}
        <button class="btn secondary" id="btn-guide-close" style="width: 100%; margin-top: 16px;">我知道了</button>
      </div>
    `;

    // 綁定彈窗內的登入按鈕
    const loginBtn = document.getElementById('modal-guide-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        try { 
          await signInWithPopup(auth, provider); 
          this.showGuidePopup(); // 登入成功後，重新整理彈窗變成「已登入」狀態
        } catch (error) { 
          alert('登入失敗：' + error.message); 
        }
      });
    }

    // 綁定關閉按鈕
    document.getElementById('btn-guide-close').addEventListener('click', () => {
      this.dom.modal.classList.remove('active');
    });
  },

  renderThemeSelectUI() {
    if (!this.dom.themeSelect) return;
    this.dom.themeSelect.innerHTML = '';
    const themeOptions = [
      { value: 'default', label: '預設標準藍 (原始外觀)' },
      { value: 'theme-monochrome', label: '🔒 14天簽到：簡約黑白' },
      { value: 'theme-neon-sakura', label: '🔒 50天簽到：夜櫻霓虹' },
      { value: 'theme-makie-gold', label: '🔒 100天簽到：蒔繪金箔' },
      { value: 'theme-aurora-stage', label: '🔒 200天簽到：幻光星海' },
      { value: 'theme-shiba-gold', label: '🐾 特殊彩蛋：暖心柴柴版 🐶' },
    ];
    themeOptions.forEach(opt => {
      if (opt.value === 'default' || this.state.unlockedThemes.includes(opt.value)) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label.replace('🔒 ', '✨ 已解鎖：');
        if (this.state.currentTheme === opt.value) o.selected = true;
        this.dom.themeSelect.appendChild(o);
      }
    });
  },

  renderHoursPage() {
    if (!this.dom.secRealtime || !this.dom.secManual) return;
    if (this.state.punchMode === 'manual') {
      this.dom.secRealtime.style.display = 'none'; this.dom.secManual.style.display = 'block';
    } else {
      this.dom.secRealtime.style.display = 'block'; this.dom.secManual.style.display = 'none';
    }

    const today = this.getTodayStr();
    const todayData = this.state.punchRecords[today];
    let punchHtml = '<p style="margin:0; font-size:0.9rem; color:var(--text-muted);">今日狀態：</p>';
    
    if (todayData) {
      if (todayData.manualTotal > 0) punchHtml += `<strong>已手動紀錄 ${todayData.manualTotal} 小時</strong>`;
      else todayData.records.forEach(r => { punchHtml += `<div>進: ${r.in} - 出: ${r.out || '進行中'}</div>`; });
    } else { punchHtml += '尚未記錄'; }
    this.dom.todayPunchList.innerHTML = punchHtml;

    const total = this.calcTotalHours();
    if (document.getElementById('hours-display')) document.getElementById('hours-display').textContent = total.toFixed(1);
    if (document.getElementById('hours-target-label')) document.getElementById('hours-target-label').textContent = this.state.hoursTargetMode === 'total' ? '總工時目標' : '月度工時目標';
    if (document.getElementById('hours-hint')) document.getElementById('hours-hint').textContent = `目標 ${this.state.hoursTarget} 小時`;
    
    const pct = Math.min(100, Math.round((total / this.state.hoursTarget) * 100));
    if (document.getElementById('progress-hours-text')) document.getElementById('progress-hours-text').textContent = `${total.toFixed(1)}/${this.state.hoursTarget} 小時`;
    if (document.getElementById('progress-hours')) document.getElementById('progress-hours').style.width = `${pct}%`;
  },

  renderExpenses() {
    if (this.dom.monthDisplay && this.state.currentExpenseMonth) {
      const [year, month] = this.state.currentExpenseMonth.split('-');
      this.dom.monthDisplay.textContent = `${year}年${parseInt(month)}月`;
    }

    const monthlyData = this.state.expenses.filter(e => {
      const eMonth = e.isoMonth || this.state.currentExpenseMonth;
      return eMonth === this.state.currentExpenseMonth;
    });

    const totalJpy = monthlyData.reduce((sum, e) => sum + e.amount, 0);
    const totalNtd = Math.round(totalJpy * this.state.exchangeRate);
    
    if (document.getElementById('expense-jpy')) document.getElementById('expense-jpy').textContent = `￥${totalJpy}`;
    if (document.getElementById('expense-ntd')) document.getElementById('expense-ntd').textContent = `NT$${totalNtd}`;

    // ⬇️ 核心升級：將明細依照「日期」打包成精美卡片
    if (this.dom.monthlyExpenseList) {
      this.dom.monthlyExpenseList.innerHTML = '';
      
      if (monthlyData.length === 0) {
        this.dom.monthlyExpenseList.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:20px 0;">本月尚無明細</p>';
      } else {
        // 先將當月資料依據具體日期 (e.date) 進行分組
        const groupedByDate = {};
        monthlyData.forEach(e => {
          if (!groupedByDate[e.date]) groupedByDate[e.date] = [];
          groupedByDate[e.date].push(e);
        });

        // 取出所有日期並由新到舊排序
        const sortedDates = Object.keys(groupedByDate).sort().reverse();

        sortedDates.forEach(dateStr => {
          const d = new Date(dateStr);
          const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
          const weekdayStr = isNaN(d.getTime()) ? '' : weekdays[d.getDay()];
          const dayTotal = groupedByDate[dateStr].reduce((sum, item) => sum + item.amount, 0);

          const groupDiv = document.createElement('div');
          groupDiv.className = 'expense-day-group';
          
          // 卡片頂部的日期與單日總計
          let html = `
            <div class="expense-day-header">
                <span>${dateStr} ${weekdayStr}</span>
                <span class="expense-day-total">￥-${dayTotal}</span>
            </div>
          `;
          
          // 卡片內部的品項清單
          groupedByDate[dateStr].forEach(e => {
            const trueIdx = this.state.expenses.indexOf(e); // 抓取真實索引供刪除用
            html += `
              <div class="expense-item">
                <div style="display:flex; align-items:center;">
                  <div style="font-weight:600; font-size:1rem; color:var(--text);">${escapeHtml(e.desc)}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="font-weight:700; font-size:1rem; color:var(--text);">￥-${e.amount}</div>
                  <button class="btn-icon" style="color:#ff4444; font-size:1.1rem; cursor:pointer;" onclick="APP.deleteItem('expenses', ${trueIdx})">🗑️</button>
                </div>
              </div>
            `;
          });
          
          groupDiv.innerHTML = html;
          this.dom.monthlyExpenseList.appendChild(groupDiv);
        });
      }
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
      row.innerHTML = `<div class="reminder-text"><h4>${escapeHtml(r.title)}</h4><p>${r.date} (${status})</p></div><div><button class="btn-icon" style="color:var(--primary);" onclick="APP.editReminder(${idx})">✏️</button> <button class="btn-icon" style="color:var(--danger);" onclick="APP.deleteItem('reminders', ${idx})">🗑️</button></div>`;
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
      const isUrgent = (!c.checked && d <= 30 && d >= 0); 
      const status = d < 0 ? '已過期' : (d === 0 ? '今天截止' : `剩 ${d} 天 (${c.date})`);

      const lbl = document.createElement('label'); 
      lbl.className = `checklist-item ${isUrgent ? 'urgent' : ''}`;
      lbl.innerHTML = `<input type="checkbox" ${c.checked ? 'checked' : ''}><div><span>${escapeHtml(c.label)}</span><span class="checklist-item-meta">${status}</span></div>`;
      lbl.querySelector('input').addEventListener('change', e => { c.checked = e.target.checked; this.saveState(); this.updateDashboard(); this.renderChecklist(); });
      cl.appendChild(lbl);
    });

    if (document.getElementById('progress-checklist-text')) document.getElementById('progress-checklist-text').textContent = `${checked}/${this.state.checklist.length} 項`;
    if (document.getElementById('progress-checklist')) document.getElementById('progress-checklist').style.width = `${Math.round((checked / this.state.checklist.length) * 100)}%`;
  },

  updateDashboard() {
    if (this.state.startDate && this.state.endDate) {
      const msTotal = new Date(this.state.endDate) - new Date(this.state.startDate);
      const total = Math.max(1, Math.ceil(msTotal / 86400000));
      const msPassed = new Date() - new Date(this.state.startDate);
      const passed = Math.max(0, Math.ceil(msPassed / 86400000));
      
      const pct = Math.min(100, Math.round((passed / total) * 100));
      if (document.getElementById('progress-text')) document.getElementById('progress-text').textContent = `${pct}%`;
      if (document.getElementById('progress-main')) document.getElementById('progress-main').style.width = `${pct}%`;
    }
    
    const dashList = document.getElementById('dash-reminders');
    if (!dashList) return;
    dashList.innerHTML = '';
    
    const urgents = [];
    this.state.checklist.forEach(c => { 
      if (!c.checked) { const d = Math.ceil((new Date(c.date) - new Date()) / 86400000); if (d <= 30 && d >= 0) urgents.push({ title: c.label, days: d, type: '重要文件' }); }
    });
    this.state.reminders.forEach(r => { 
      const d = Math.ceil((new Date(r.date) - new Date()) / 86400000); if (d <= 30 && d >= 0) urgents.push({ title: r.title, days: d, type: '近期提醒' }); 
    });
    
    urgents.sort((a, b) => a.days - b.days).slice(0, 4).forEach(u => {
      dashList.innerHTML += `<div class="reminder-item urgent"><div class="reminder-text"><h4>${escapeHtml(u.title)}</h4><p>⚠️ ${u.type} - 剩 ${u.days} 天</p></div></div>`;
    });
    if (urgents.length === 0) dashList.innerHTML = '<p style="color:gray; font-size:0.9rem; padding:10px;">目前無 30 天內即將到期的任務，請繼續保持！</p>';
  },

  openModal(type) {
    if (!this.dom.modal) return;
    this.dom.modal.classList.add('active'); 
    this.dom.modalBody.innerHTML = '';

    const renderGrouped = (items, dateExtractor, renderItemFn) => {
      const grouped = {};
      items.forEach(item => {
        const month = dateExtractor(item);
        if (!grouped[month]) grouped[month] = [];
        grouped[month].push(item);
      });
      const sortedMonths = Object.keys(grouped).sort().reverse();
      if (sortedMonths.length === 0) {
        this.dom.modalBody.innerHTML = '<p style="text-align:center; color:gray; padding: 20px;">尚無紀錄</p>';
        return;
      }
      sortedMonths.forEach((month, index) => {
        const details = document.createElement('details');
        if (index === 0) details.open = true;
        details.style.marginBottom = '12px';
        const summary = document.createElement('summary');
        const [y, m] = month.split('-');
        summary.style.cssText = 'font-size: 1.05rem; font-weight: 600; padding: 12px 16px; background: var(--primary-light); color: var(--primary); border-radius: 8px; cursor: pointer; outline: none; margin-bottom: 8px; list-style: none; display: flex; justify-content: space-between; align-items: center;';
        summary.innerHTML = `<span>${y}年 ${parseInt(m)}月</span><span style="font-size: 0.8rem; opacity: 0.7;">▼ 點擊展開/收起</span>`;
        details.appendChild(summary);
        const content = document.createElement('div');
        content.style.cssText = 'display: flex; flex-direction: column; gap: 10px; padding: 0 4px 8px 4px;';
        [...grouped[month]].reverse().forEach(item => { content.appendChild(renderItemFn(item)); });
        details.appendChild(content);
        this.dom.modalBody.appendChild(details);
      });
    };

    const getMonthFromId = (id) => {
      const d = new Date(Number(id));
      return isNaN(d.getTime()) ? '未分類' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // ⬇️ 處理點擊 FAB 跳出的「新增記帳」彈窗
    if (type === 'addExpense') {
      this.dom.modalTitle.textContent = '新增記帳';
      this.dom.modalBody.innerHTML = `
        <div class="input-group" style="margin-bottom: 24px;">
          <label style="font-weight:600; font-size:0.9rem; color:var(--text-muted);">📅 選擇日期</label>
          <input type="date" id="modal-exp-date" value="${this.getTodayStr()}">
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 1rem;">⚡ 快速記帳</h3>
          <button class="btn-icon" onclick="APP.openModal('quickExpense')" style="font-size:0.8rem; color:var(--primary);">編輯快捷鍵 ⚙️</button>
        </div>
        <div class="expense-buttons" id="modal-quick-box" style="margin-bottom: 32px;"></div>
        
        <h3 style="margin: 0 0 12px; font-size: 1rem;">✍️ 自訂輸入</h3>
        <div class="input-group">
          <input type="text" id="modal-exp-desc" placeholder="買了什麼？ (例如: 午餐)">
          <input type="number" id="modal-exp-amount" placeholder="輸入日幣金額" min="0" step="10">
          <button class="btn" id="modal-exp-add" style="background: #f67280; color: white;">確認記帳</button>
        </div>
      `;

      // 渲染裡面的快速按鈕
      const quickBox = document.getElementById('modal-quick-box');
      this.state.quickExpenses.forEach(q => {
        const btn = document.createElement('button'); 
        btn.className = 'btn-expense';
        btn.textContent = `${q.label} ￥${q.amount}`;
        btn.onclick = () => {
          const d = document.getElementById('modal-exp-date').value || this.getTodayStr();
          this.addExpenseRecord(q.label, q.amount, d);
          this.dom.modal.classList.remove('active'); // 自動關閉視窗
        };
        quickBox.appendChild(btn);
      });

      // 綁定自訂輸入按鈕
      document.getElementById('modal-exp-add').onclick = () => {
        const desc = document.getElementById('modal-exp-desc').value.trim() || '自訂支出';
        const amt = Number(document.getElementById('modal-exp-amount').value);
        const d = document.getElementById('modal-exp-date').value || this.getTodayStr();
        if (amt > 0) {
          this.addExpenseRecord(desc, amt, d);
          this.dom.modal.classList.remove('active'); // 自動關閉視窗
        }
      };

    } else if (type === 'checkInHistory') {
      this.dom.modalTitle.textContent = '📅 歷史簽到月曆';
      let currentViewDate = new Date(); 
      const renderCalendar = () => {
        this.dom.modalBody.innerHTML = '';
        const year = currentViewDate.getFullYear();
        const month = currentViewDate.getMonth();
        
        const headerDiv = document.createElement('div');
        headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 0 4px;';
        
        const btnPrev = document.createElement('button'); 
        btnPrev.className = 'btn-icon'; 
        btnPrev.innerHTML = '&#10094;'; 
        btnPrev.style.cssText = 'font-size: 1rem; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;'; 
        btnPrev.onclick = () => { currentViewDate.setMonth(month - 1); renderCalendar(); };
        
        const titleSpan = document.createElement('span'); 
        titleSpan.style.cssText = 'font-weight: 700; font-size: 1.15rem; color: var(--text); letter-spacing: 1px;'; 
        titleSpan.textContent = `${year}年 ${month + 1}月`;
        
        const btnNext = document.createElement('button'); 
        btnNext.className = 'btn-icon'; 
        btnNext.innerHTML = '&#10095;'; 
        btnNext.style.cssText = 'font-size: 1rem; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;'; 
        btnNext.onclick = () => { currentViewDate.setMonth(month + 1); renderCalendar(); };
        
        headerDiv.appendChild(btnPrev); 
        headerDiv.appendChild(titleSpan); 
        headerDiv.appendChild(btnNext);
        this.dom.modalBody.appendChild(headerDiv);
        
        const grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; text-align: center; width: 100%; box-sizing: border-box;';
        
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        days.forEach(d => { 
            const el = document.createElement('div'); 
            el.style.cssText = 'font-weight: 600; font-size: 0.8rem; color: var(--text-muted); padding-bottom: 8px;'; 
            el.textContent = d; 
            grid.appendChild(el); 
        });
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDay; i++) { grid.appendChild(document.createElement('div')); }
        
        const historySet = new Set(this.state.checkInHistory || []);
        for (let i = 1; i <= daysInMonth; i++) {
          const dateDiv = document.createElement('div');
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
          const hasCheckedIn = historySet.has(dateStr);
          const isToday = dateStr === this.getTodayStr();
          
          dateDiv.style.cssText = `aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid ${isToday ? 'var(--primary)' : 'var(--border)'}; background: ${hasCheckedIn ? 'var(--primary-light)' : 'transparent'}; color: ${hasCheckedIn ? 'var(--primary)' : 'var(--text)'}; font-weight: ${hasCheckedIn || isToday ? '600' : 'normal'}; font-size: 0.9rem; padding: 2px; box-sizing: border-box;`;
          dateDiv.innerHTML = `<span style="line-height: 1;">${i}</span><span style="font-size: 0.7rem; height: 12px; margin-top: 2px;">${hasCheckedIn ? '<span class="dynamic-icon icon-checkin"></span>' : ''}</span>`;
          grid.appendChild(dateDiv);
        }
        this.dom.modalBody.appendChild(grid);
      };
      renderCalendar();

    } else if (type === 'punch') {
      this.dom.modalTitle.textContent = '打卡歷史紀錄 (依月份分類)';
      const punchArray = Object.keys(this.state.punchRecords).map(date => ({ date, data: this.state.punchRecords[date] }));
      renderGrouped(punchArray, item => item.date.substring(0, 7), (item) => {
        const { date, data: day } = item;
        const div = document.createElement('div'); div.className = 'history-card';
        let html = `<p><strong>${date}</strong></p>`;
        if (day.manualTotal > 0) html += `<p>手動時數: ${day.manualTotal} 小時 <button class="btn-sm secondary" onclick="APP.editManualPunch('${date}')">修改</button></p>`;
        else day.records.forEach((r, i) => html += `<p>進: ${r.in} | 出: ${r.out || '--'} <button class="btn-sm secondary" onclick="APP.editPunch('${date}', ${i})">修改</button></p>`);
        html += `<div class="history-actions"><button class="btn btn-sm danger" onclick="APP.deletePunchDay('${date}')">刪除整日</button></div>`;
        div.innerHTML = html; return div;
      });

    } else if (type === 'quickExpense') {
      this.dom.modalTitle.textContent = '編輯快速記帳按鈕';
      this.state.quickExpenses.forEach((q, idx) => {
        const div = document.createElement('div'); div.className = 'history-card';
        div.innerHTML = `<p>${q.label} (￥${q.amount})</p><div class="history-actions"><button class="btn btn-sm secondary" onclick="APP.editQuickExpense(${idx})">編輯</button> <button class="btn btn-sm danger" onclick="APP.deleteItem('quickExpenses', ${idx}, 'quickExpense')">刪除</button></div>`;
        this.dom.modalBody.appendChild(div);
      });
      const addBtn = document.createElement('button'); addBtn.className = 'btn secondary'; addBtn.textContent = '+ 新增快捷鍵';
      addBtn.onclick = () => { const label = prompt('按鈕名稱 (例: 咖啡)'); if (!label) return; const amount = Number(prompt('金額')); if (amount) { this.state.quickExpenses.push({ id: Date.now(), label, amount }); this.saveState(); this.renderExpenses(); this.openModal('quickExpense'); } };
      this.dom.modalBody.appendChild(addBtn);

    } else if (type === 'note' || type === 'journal') {
      this.dom.modalTitle.textContent = type === 'note' ? '歷史備註 (依月份分類)' : '歷史週誌 (依月份分類)';
      const targetArr = this.state[type + 's'].map((item, idx) => ({ ...item, _idx: idx }));
      renderGrouped(targetArr, item => getMonthFromId(item.id), (item) => {
        const div = document.createElement('div'); div.className = 'history-card';
        const title = type === 'journal' ? `第 ${item.week} 週` : '';
        div.innerHTML = `<p><strong>${title}</strong> <span style="font-size:0.8rem; color:gray;">${item.date}</span></p><p style="white-space:pre-wrap;">${escapeHtml(item.text)}</p><div class="history-actions">${type === 'journal' ? `<button class="btn btn-sm secondary" onclick="APP.exportJournal(${item._idx})">匯出 PDF</button>` : ''} <button class="btn btn-sm secondary" onclick="APP.editTextItem('${type}s', ${item._idx}, '${type}')">編輯</button> <button class="btn btn-sm danger" onclick="APP.deleteItem('${type}s', ${item._idx}, '${type}')">刪除</button></div>`;
        return div;
      });

    } else if (type === 'manageChecklist') {
      this.dom.modalTitle.textContent = '📋 管理學校規定文件清單';
      this.dom.modalBody.innerHTML = '';

      // 渲染現有的清單項目
      this.state.checklist.forEach((c, idx) => {
        const div = document.createElement('div');
        div.className = 'history-card';
        div.style.marginBottom = '12px';
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="margin: 0; font-weight: 600; color: var(--text);">${escapeHtml(c.label)}</p>
              <p style="margin: 4px 0 0 0; color:var(--text-muted); font-size: 0.85rem;">期限: ${c.date || '無'}</p>
            </div>
            <div class="history-actions" style="margin-top:0;">
              <button class="btn-icon" style="color:var(--primary); font-size:1.1rem; cursor:pointer;" onclick="APP.editChecklistItem(${idx})">✏️</button>
              <button class="btn-icon" style="color:#ff4444; font-size:1.1rem; cursor:pointer;" onclick="APP.deleteItem('checklist', ${idx}, 'manageChecklist')">🗑️</button>
            </div>
          </div>
        `;
        this.dom.modalBody.appendChild(div);
      });

      // 新增按鈕
      const addBtn = document.createElement('button');
      addBtn.className = 'btn secondary';
      addBtn.textContent = '+ 新增規定文件';
      addBtn.style.marginTop = '8px';
      addBtn.onclick = () => {
        const label = prompt('文件名稱 (例如: 實習合約):');
        if (!label) return;
        const date = prompt('截止日期 (YYYY-MM-DD):', this.getTodayStr());
        if (date) {
          this.state.checklist.push({ id: 'c' + Date.now(), label, date, checked: false });
          this.saveState();
          this.renderChecklist();
          this.updateDashboard();
          this.openModal('manageChecklist'); // 自動重新整理彈窗
        }
      };
      this.dom.modalBody.appendChild(addBtn);

    } else if (type === 'gallery') {
      this.dom.modalTitle.textContent = '📸 實習相簿';
      this.dom.modalBody.innerHTML = `
        <div style="margin-bottom: 20px; display:flex; gap: 10px;">
            <input type="file" id="image-upload" accept="image/*" multiple style="display:none">
            <!-- 🌟 加上 display: none 隱藏上傳按鈕 -->
            <button class="btn" style="display:none;" onclick="document.getElementById('image-upload').click()">上傳新圖片</button>
            <button class="btn secondary" id="export-gallery">匯出相簿</button>
        </div>
        <div id="upload-progress-container" style="display:none; margin-bottom: 20px;">
            <div class="progress-bar" style="background: rgba(0,0,0,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                <span id="upload-progress-bar" style="display: block; height: 100%; width: 0%; background: var(--primary); transition: width 0.3s;"></span>
            </div>
            <p id="upload-status" style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top: 8px;">準備上傳...</p>
        </div>
        <div class="masonry-grid" id="modal-gallery-grid" style="column-count: 2; column-gap: 15px;"></div>
      `;

      const grid = document.getElementById('modal-gallery-grid');
      const images = this.state.galleryImages || [];
      if (images.length === 0) {
        // 🌟 修改提示文字，讓使用者知道目前不開放
        grid.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 20px 0;">(因資料庫空間限制，目前暫不開放雲端圖片上傳功能)</p>';
      } else {
        images.forEach((img, idx) => {
          grid.innerHTML += `
            <div class="gallery-item" style="margin-bottom: 15px; border-radius: 12px; overflow: hidden; position: relative; border: 1px solid var(--border);">
              <img src="${img.url}" style="width: 100%; display: block;" alt="實習照片">
              <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; padding: 6px; font-size: 0.75rem;">
                ${img.date}
                <button onclick="APP.deleteItem('galleryImages', ${idx}, 'gallery')" style="float:right; background:none; border:none; color:#ff4444; cursor:pointer;">刪除</button>
              </div>
            </div>`;
        });
      }

      document.getElementById('image-upload').addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length === 0) return;
        
        if (!this.firebaseUser) {
          alert('🚨 錯誤：請先在設定頁登入 Google 帳號！');
          return;
        }

        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const statusText = document.getElementById('upload-status');
        
        progressContainer.style.display = 'block';
        let completedCount = 0;

        Array.from(files).forEach((file, index) => {
          try {
            console.log(`開始準備上傳檔案: ${file.name}`);
            const storageRef = ref(storage, `images/${this.firebaseUser.uid}/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = `${progress}%`;
                statusText.textContent = `正在上傳第 ${index + 1} 張 (${Math.round(progress)}%)`;
              }, 
              (error) => {
                console.error('[上傳失敗詳細資訊]:', error);
                alert(`上傳失敗！\n錯誤代碼：${error.code}\n原因：${error.message}`);
                progressContainer.style.display = 'none';
              }, 
              async () => {
                try {
                  const url = await getDownloadURL(uploadTask.snapshot.ref);
                  this.state.galleryImages = this.state.galleryImages || [];
                  this.state.galleryImages.push({ url, date: this.getNowString() });
                  this.saveState();
                  
                  completedCount++;
                  if (completedCount === files.length) {
                     statusText.textContent = '全部上傳完成！';
                     setTimeout(() => { this.openModal('gallery'); }, 1000);
                  }
                } catch (downloadErr) {
                  console.error('[取得網址失敗]:', downloadErr);
                  alert('圖片上傳了，但無法取得顯示網址。');
                }
              }
            );
          } catch (initErr) {
            console.error('[啟動任務失敗]:', initErr);
            alert('系統錯誤：無法啟動上傳任務');
          }
        });
      });
    }
  },

  deleteItem(arrayName, index, modalToReopen) { 
    if (confirm('確定刪除？')) { this.state[arrayName].splice(index, 1); this.saveState(); this.renderAll(); if (modalToReopen) this.openModal(modalToReopen); } 
  },
  
  editTextItem(arrayName, index, modalToReopen) { 
    const newText = prompt('請修改內容:', this.state[arrayName][index].text); 
    if (newText) { this.state[arrayName][index].text = newText; this.saveState(); this.renderAll(); this.openModal(modalToReopen); } 
  },

  editReminder(index) { 
    const r = this.state.reminders[index]; 
    const newTitle = prompt('修改提醒標題:', r.title); if (newTitle) r.title = newTitle; 
    const newDate = prompt('修改日期 (YYYY-MM-DD):', r.date); if (newDate) r.date = newDate; 
    this.saveState(); this.renderReminders(); this.updateDashboard(); 
  },

  editQuickExpense(index) { 
    const q = this.state.quickExpenses[index]; 
    const newLabel = prompt('名稱:', q.label); if (newLabel) q.label = newLabel; 
    const newAmt = Number(prompt('金額:', q.amount)); if (newAmt) q.amount = newAmt; 
    this.saveState(); this.renderExpenses(); this.openModal('quickExpense'); 
  },

  editChecklistItem(index) {
    const c = this.state.checklist[index];
    const newLabel = prompt('修改文件名稱:', c.label);
    if (newLabel) c.label = newLabel;
    
    const newDate = prompt('修改截止日期 (YYYY-MM-DD):', c.date);
    if (newDate) c.date = newDate;

    this.saveState();
    this.renderChecklist();
    this.updateDashboard();
    this.openModal('manageChecklist'); // 修改完自動重新整理彈窗
  },

  editPunch(date, idx) { 
    const rec = this.state.punchRecords[date].records[idx]; 
    const i = prompt('進 (HH:MM)', rec.in); if (i) rec.in = i; 
    const o = prompt('出 (HH:MM)', rec.out || ''); if (o !== null) rec.out = o; 
    this.saveState(); this.renderHoursPage(); this.openModal('punch'); 
  },

  editManualPunch(date) { 
    const h = Number(prompt('修改手動總時數', this.state.punchRecords[date].manualTotal)); 
    if (h > 0) { this.state.punchRecords[date].manualTotal = h; this.saveState(); this.renderHoursPage(); this.openModal('punch'); } 
  },

  deletePunchDay(date) { 
    if (confirm('確定要刪除這天的所有打卡紀錄嗎？')) { delete this.state.punchRecords[date]; this.saveState(); this.renderHoursPage(); this.openModal('punch'); } 
  },

  exportJournal(index) { 
    const j = this.state.journals[index]; const win = window.open('', '_blank'); win.document.write(`<html><head><title>第 ${j.week} 週週誌</title></head><body style="font-family: sans-serif; padding: 40px; line-height: 1.8;"><h2>第 ${j.week} 週實習週誌</h2><hr><p style="white-space: pre-wrap;">${escapeHtml(j.text)}</p></body></html>`); win.document.close(); 
  },
  
  exportData() { 
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `intern-backup-${this.getTodayStr()}.json`; a.click(); 
  },

  exportToCSV() {
    let csvContent = "\uFEFF";
    csvContent += "=== 打卡紀錄 ===\n日期,上班時間,下班時間,手動登記時數\n"; 
    const punchDates = Object.keys(this.state.punchRecords).sort();
    if (punchDates.length === 0) {
      csvContent += "尚無打卡紀錄\n";
    } else {
      punchDates.forEach(date => {
        const day = this.state.punchRecords[date];
        if (day.manualTotal > 0) {
          csvContent += `${date},--,--,${day.manualTotal}\n`;
        } else {
          day.records.forEach(r => {
            csvContent += `${date},${r.in},${r.out || '未打卡'},0\n`;
          });
        }
      });
    }

    csvContent += "\n\n=== 記帳紀錄 ===\n紀錄時間,消費項目,金額(日圓)\n"; 
    if (this.state.expenses.length === 0) {
      csvContent += "尚無記帳紀錄\n";
    } else {
      const sortedExpenses = [...this.state.expenses].sort((a, b) => a.date.localeCompare(b.date));
      sortedExpenses.forEach(exp => {
        const safeDesc = `"${exp.desc.replace(/"/g, '""')}"`;
        csvContent += `${exp.date},${safeDesc},${exp.amount}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `實習報表_${this.getTodayStr()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  
  importData(event) { 
    const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = e => { try { const data = JSON.parse(e.target.result); this.state = { ...this.state, ...data }; this.saveState(); this.renderAll(); alert('資料匯入成功！'); } catch { alert('檔案格式錯誤，匯入失敗。'); } }; reader.readAsText(file); 
  },

  async saveState() { 
    this.saveStateLocally();
    if (this.firebaseUser) { try { await setDoc(doc(db, "users", this.firebaseUser.uid), this.state); } catch (e) { console.error('同步雲端失敗', e); } }
  },

  saveStateLocally() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); },
  
  loadLocalState() { const s = localStorage.getItem(STORAGE_KEY); if (s) { try { this.state = { ...this.state, ...JSON.parse(s) }; } catch(e) {} } },

  async loadCloudState(user) {
    try {
      const docSnap = await getDoc(doc(db, "users", user.uid));
      if (docSnap.exists()) { this.state = { ...this.state, ...docSnap.data() }; this.state.user = { isLoggedIn: true, name: user.displayName }; } 
      else { this.state.user = { isLoggedIn: true, name: user.displayName }; await this.saveState(); }
    } catch (e) { console.error("讀取雲端資料失敗", e); }
  }
};

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

window.APP = APP; 
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => APP.init()); } else { APP.init(); }