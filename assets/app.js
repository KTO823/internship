// 引入 Firebase 模組
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyA_O2QrUhJo7YqG9rX0DvucMDslw4sF-Io",
  authDomain: "internship-5434c.firebaseapp.com",
  projectId: "internship-5434c",
  storageBucket: "internship-5434c.firebasestorage.app",
  messagingSenderId: "997860315918",
  appId: "1:997860315918:web:562eba719dcd16780f7d5f"
};

// 🌟 Cloudinary 免費圖床設定 —— 去 https://cloudinary.com 註冊後，
// Dashboard 左上角看得到 Cloud name；Settings → Upload → Add upload preset，
// Signing Mode 選「Unsigned」，把 preset 名稱貼在下面。兩個都不是密鑰，可以放在前端。
const CLOUDINARY_CLOUD_NAME = 'eg9zs5ul';
const CLOUDINARY_UPLOAD_PRESET = 'internship';

// 🌟 網頁推播用的 VAPID 金鑰 —— Firebase 主控台 → 專案設定 → Cloud Messaging →
// 「網頁設定」→ 產生金鑰組，把那串金鑰貼在這裡（這也不是密鑰，是公開金鑰）。
const FCM_VAPID_KEY = 'BNf0YnsW4eqvsozpgUTkoBxhsMm1kys_TAiefS9aVUwWOQxkafs7BaKTrtgMnD9Sevg_obIDswrUZf6T-mYJ3Vs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
let messaging = null;
try { messaging = getMessaging(app); } catch (e) { console.warn('此瀏覽器不支援推播通知', e); }

// ---- PWA：安裝到主畫面 + 離線快取 ----
const PWA = {
  deferredPrompt: null,
  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  },
  isIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  },
  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => { this.swRegistration = reg; })
        .catch((err) => {
          console.warn('Service worker 註冊失敗：', err);
        });
    });
  },
  setupInstallPrompt(onReady) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      onReady('android');
    });
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      onReady('installed');
    });
    if (this.isStandalone()) {
      onReady('installed');
    } else if (this.isIOS()) {
      onReady('ios');
    }
  },
  async promptInstall() {
    if (!this.deferredPrompt) return;
    this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
  },
};
PWA.registerServiceWorker();

// ---- 推播通知：跟 Firebase Cloud Messaging 拿一組這台裝置專屬的 token，
// 存進 Firestore 的使用者資料，讓後端排程（Cloudflare Worker）知道要推給誰 ----
const PushNotify = {
  async enable() {
    if (!messaging) {
      alert('このブラウザはプッシュ通知に対応していません（iOSは、先に「ホーム画面に追加」してアプリとしてインストールする必要があります）。');
      return null;
    }
    if (FCM_VAPID_KEY.includes('請填入')) {
      alert('🚨 VAPIDキーが未設定です。app.js の先頭にある FCM_VAPID_KEY を入力してください。');
      return null;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    try {
      const registration = PWA.swRegistration || await navigator.serviceWorker.ready;
      const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
      return token || null;
    } catch (err) {
      console.error('取得推播 token 失敗：', err);
      alert('通知をオンにできませんでした。httpsで開いているか、ブラウザがプッシュ通知に対応しているか確認してください。');
      return null;
    }
  },
};

if (messaging) {
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || '實習時期｜お知らせ';
    const body = payload.notification?.body || '';
    if (PWA.swRegistration) {
      PWA.swRegistration.showNotification(title, { body, icon: './assets/icons/icon-192.jpg' });
    } else {
      alert(`${title}\n${body}`);
    }
  });
}

// 記帳カテゴリ —— 保存される値(key)は、自分のExcel帳簿の「分類清單」と一字一句同じ表記のままにしています。
// （Excelへ貼り付けたとき、カテゴリ集計の数式などがそのまま使えるように）
// 画面に表示するときだけ日本語（CATEGORY_JA）に変換します。
const EXPENSE_CATEGORIES = [
  '1.飲食類-正餐', '2.飲食類-點心', '3.飲食類-飲品', '4.飲食類-其他',
  '5.交通', '6.購物', '7.娛樂', '8.日用品', '9.醫療', '10理髮', '11.保險費', '12.投資',
  '13.帳單',
];
const CATEGORY_JA = {
  '1.飲食類-正餐': '1.食費-食事',
  '2.飲食類-點心': '2.食費-おやつ',
  '3.飲食類-飲品': '3.食費-飲み物',
  '4.飲食類-其他': '4.食費-その他',
  '5.交通': '5.交通費',
  '6.購物': '6.買い物',
  '7.娛樂': '7.娯楽',
  '8.日用品': '8.日用品',
  '9.醫療': '9.医療',
  '10理髮': '10.理美容',
  '11.保險費': '11.保険料',
  '12.投資': '12.投資',
  '13.帳單': '13.請求書',
};
const categoryLabel = (key) => CATEGORY_JA[key] || key || '未分類';

const STORAGE_KEY = 'intern-dashboard-v9'; 

const APP = {
  state: {
    user: { isLoggedIn: false, name: '' },
    startDate: '',
    endDate: '',
    hoursTargetMode: 'monthly',
    hoursTarget: 160,
    exchangeRate: 0.21,
    currentExpenseMonth: '',
    punchRecords: {},   // 旧「日次打刻」データ（互換用・読み取りのみ）
    monthlyHours: {},   // 月次の勤務時間 { 'YYYY-MM': 時間 }
    expenses: [],
    notes: [],
    galleryImages: [], 
    checkInCount: 0,
    lastCheckInDate: '',
    checkInHistory: [], 
    currentTheme: 'default',
    unlockedThemes: ['default'],
    reminders: [
      { id: 'r1', title: '渡航前の準備：生活費として日本円10万円', date: '2026-07-01' },
    ],
    checklist: [
      { id: 'c1', label: '学外実習機関への到着確認書を記入', date: '2026-07-07', checked: false },
      { id: 'c2', label: '搭乗券／日本実習の到着報告書をQQに提出', date: '2026-07-31', checked: false },
      { id: 'c5', label: '前期実習生の勤務週誌（全16週）を提出', date: '2026-12-31', checked: false },
      { id: 'c6', label: '実習動画（5分以上）を提出', date: '2027-03-31', checked: false },
      { id: 'c9', label: '帰国時の搭乗券・感想レポート・満足度アンケートを提出', date: '2027-05-18', checked: false },
      { id: 'c10', label: '実習成果報告会で発表', date: '2027-05-27', checked: false },
    ],
    quickExpenses: [
      { id: 'q1', label: '朝食', amount: 450, category: '1.飲食類-正餐', mode: 'fixed' },
      { id: 'q2', label: '電車', amount: 180, category: '5.交通', mode: 'fixed' },
      { id: 'q3', label: 'スーパー', amount: 1200, category: '8.日用品', mode: 'fixed' },
    ],
  },
  
  firebaseUser: null,
  hoursViewMonth: '',   // 勤務時間ページで表示中の月（画面状態なので保存はしない）

  init() {
    this.cacheDom();
    this.setupListeners();
    this.loadLocalState();
    this.hoursViewMonth = this.getCurrentMonthStr();
    
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
        if (this.dom.settingsStatus) this.dom.settingsStatus.textContent = `ログイン済み：${user.displayName}（同期中...）`;
        await this.loadCloudState(user);
        if (this.dom.settingsStatus) this.dom.settingsStatus.textContent = `クラウド接続中：${user.displayName}`;
        if (this.dom.sidebarUser) this.dom.sidebarUser.textContent = user.displayName;
        if (this.dom.settingsLogin) this.dom.settingsLogin.style.display = 'none';
        if (this.dom.sidebarLogout) this.dom.sidebarLogout.style.display = 'block';
        const loginReminder = document.getElementById('login-reminder-box');
        if (loginReminder) loginReminder.style.display = 'none';
      } else {
        this.firebaseUser = null;
        this.state.user = { isLoggedIn: false, name: '' };
        if (this.dom.settingsStatus) this.dom.settingsStatus.textContent = '未ログイン';
        if (this.dom.sidebarUser) this.dom.sidebarUser.textContent = '未ログイン';
        if (this.dom.settingsLogin) this.dom.settingsLogin.style.display = 'block';
        if (this.dom.sidebarLogout) this.dom.sidebarLogout.style.display = 'none';
        this.saveStateLocally(); 
        const loginReminder = document.getElementById('login-reminder-box');
        if (loginReminder) loginReminder.style.display = 'block';
      }
      this.applyTheme();
      this.renderAll();

      setTimeout(() => {
        // 只要沒有登入，就強制彈出教學與登入提醒
        if (!user) {
          this.showGuidePopup();
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
      
      settingsHoursMode: document.getElementById('settings-hours-mode'),
      settingsHoursTarget: document.getElementById('settings-hours-target'),
      settingsStart: document.getElementById('settings-start'),
      settingsEnd: document.getElementById('settings-end'),
      btnHoursHelp: document.getElementById('btn-hours-help'),
      settingsLogin: document.getElementById('settings-login'),
      sidebarLogout: document.getElementById('sidebar-logout'),
      settingsStatus: document.getElementById('settings-status'),
      sidebarUser: document.getElementById('sidebar-user'),
      
      btnHoursPrev: document.getElementById('btn-hours-prev'),
      btnHoursNext: document.getElementById('btn-hours-next'),
      hoursMonthDisplay: document.getElementById('hours-month-display'),
      hoursMonthInput: document.getElementById('hours-month-input'),
      hoursMonthSave: document.getElementById('hours-month-save'),
      hoursMonthList: document.getElementById('hours-month-list'),
      
      btnPrevMonth: document.getElementById('btn-prev-month'),
      btnNextMonth: document.getElementById('btn-next-month'),
      monthDisplay: document.getElementById('current-month-display'),
      monthlyExpenseList: document.getElementById('monthly-expense-list'),
      
      fabAddExpense: document.getElementById('btn-fab-add-expense'), // 新增：懸浮按鈕
      
      themeSelect: document.getElementById('settings-theme-select'),
      historyCheckinCount: document.getElementById('history-checkin-count'),
      historyLastCheckin: document.getElementById('history-last-checkin'),
      
      notifyRow: document.getElementById('notify-row'),
      notifyRowDesc: document.getElementById('notify-row-desc'),
      btnEnableNotify: document.getElementById('btn-enable-notify'),

      installRow: document.getElementById('install-row'),
      installRowDesc: document.getElementById('install-row-desc'),
      btnInstallApp: document.getElementById('btn-install-app'),

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

    if (this.dom.settingsHoursMode) this.dom.settingsHoursMode.addEventListener('change', (e) => { this.state.hoursTargetMode = e.target.value; this.saveState(); this.renderHoursPage(); this.updateDashboard(); });
    if (this.dom.settingsHoursTarget) this.dom.settingsHoursTarget.addEventListener('change', (e) => { this.state.hoursTarget = Number(e.target.value) || 160; this.saveState(); this.renderHoursPage(); this.updateDashboard(); });
    if (this.dom.settingsStart) this.dom.settingsStart.addEventListener('change', (e) => { this.state.startDate = e.target.value; this.saveState(); this.updateDashboard(); });
    if (this.dom.settingsEnd) this.dom.settingsEnd.addEventListener('change', (e) => { this.state.endDate = e.target.value; this.saveState(); this.updateDashboard(); });

    if (this.dom.btnEnableNotify) {
      // 如果之前已經拿過權限且有 token，直接顯示完成狀態
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && this.state.fcmToken) {
        this.dom.btnEnableNotify.style.display = 'none';
        if (this.dom.notifyRowDesc) this.dom.notifyRowDesc.textContent = '✅ オン済み：期限が近づくと通知が届きます';
      }
      this.dom.btnEnableNotify.addEventListener('click', async () => {
        this.dom.btnEnableNotify.textContent = 'オンにしています...';
        const result = await PushNotify.enable();
        this.dom.btnEnableNotify.textContent = 'オンにする';
        if (result === 'denied') {
          if (this.dom.notifyRowDesc) this.dom.notifyRowDesc.textContent = '⚠️ 通知がブロックされています。ブラウザの設定から許可してください';
          return;
        }
        if (result) {
          this.state.fcmToken = result;
          this.saveState();
          this.dom.btnEnableNotify.style.display = 'none';
          if (this.dom.notifyRowDesc) this.dom.notifyRowDesc.textContent = '✅ オン済み：期限が近づくと通知が届きます';
        }
      });
    }

    if (this.dom.btnInstallApp) {
      this.dom.btnInstallApp.addEventListener('click', () => PWA.promptInstall());
    }
    PWA.setupInstallPrompt((mode) => {
      if (!this.dom.installRow) return;
      this.dom.installRow.style.display = 'flex';
      if (mode === 'android') {
        this.dom.btnInstallApp.style.display = 'inline-flex';
        if (this.dom.installRowDesc) this.dom.installRowDesc.textContent = 'ホーム画面に追加すると、起動が速くオフラインでも見られます';
      } else if (mode === 'ios') {
        this.dom.btnInstallApp.style.display = 'none';
        if (this.dom.installRowDesc) this.dom.installRowDesc.textContent = 'ブラウザ下部の「共有」→「ホーム画面に追加」をタップ';
      } else if (mode === 'installed') {
        this.dom.btnInstallApp.style.display = 'none';
        if (this.dom.installRowDesc) this.dom.installRowDesc.textContent = '✅ インストール済み：ホーム画面から直接開けます';
      }
    });

    if (this.dom.settingsLogin) {
      this.dom.settingsLogin.addEventListener('click', async () => {
        try { await signInWithPopup(auth, provider); } catch (error) { alert('ログインに失敗しました：' + error.message); }
      });
    }
    const guideLoginBtn = document.getElementById('guide-login-btn');
    if (guideLoginBtn) {
      guideLoginBtn.addEventListener('click', async () => {
        try { 
          await signInWithPopup(auth, provider); 
        } catch (error) { 
          alert('ログインに失敗しました：' + error.message); 
        }
      });
    }

    if (this.dom.sidebarLogout) {
      this.dom.sidebarLogout.addEventListener('click', async () => {
        if (confirm('ログアウトしますか？ログアウトするとクラウド同期ができなくなります。')) {
          await signOut(auth); alert('ログアウトしました');
        }
      });
    }

    if (this.dom.btnHoursHelp) this.dom.btnHoursHelp.addEventListener('click', () => { alert('【月ごとの目標】\n進捗は当月の累計だけで計算します。\n\n【累計の目標】\n実習期間中のすべての時間を合計して進捗を計算します。'); });

    if (this.dom.btnHoursPrev) this.dom.btnHoursPrev.addEventListener('click', () => this.changeHoursMonth(-1));
    if (this.dom.btnHoursNext) this.dom.btnHoursNext.addEventListener('click', () => this.changeHoursMonth(1));
    if (this.dom.hoursMonthSave) this.dom.hoursMonthSave.addEventListener('click', () => this.saveMonthHours());

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
          alert('メモを保存しました'); 
        }
      });
    }

    const clearNoteBtn = document.getElementById('clear-note');
    if (clearNoteBtn) {
      clearNoteBtn.addEventListener('click', () => { document.getElementById('quick-note').value = ''; });
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
    
    bindModal('btn-manage-expense', 'expense');
    bindModal('btn-manage-note', 'note');
    bindModal('btn-view-checkin-history', 'checkInHistory');
    bindModal('btn-manage-checklist', 'manageChecklist');
    bindModal('btn-export-expense-month', 'exportExpenseMonth');
    
    const btnOpenGallery = document.getElementById('btn-open-gallery');
    if (btnOpenGallery) {
      btnOpenGallery.addEventListener('click', () => this.openModal('gallery'));
    }
    
    if (this.dom.modalClose) this.dom.modalClose.addEventListener('click', () => { this.dom.modal.classList.remove('active'); });
  },

  getNowString() { 
    return new Date().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); 
  },
  
  getTodayStr() { 
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  
  getWeekNum() { 
    if (!this.state.startDate) return 1; // 実習開始日が未設定なら第1週として扱う
    const msDiff = new Date() - new Date(this.state.startDate);
    const weekNum = Math.floor(msDiff / 86400000 / 7) + 1; 
    return weekNum > 0 ? weekNum : 1;
  },

  // 支出が属する月（isoMonth が無い古いデータは日付から判定）
  getExpenseMonth(e) {
    return e.isoMonth || (e.date ? e.date.slice(0, 7) : '');
  },

  formatYen(n) {
    return `￥${Number(n).toLocaleString('ja-JP')}`;
  },

  // 跟 getWeekNum() 邏輯一樣，但可以指定任何一個日期（例如照片的拍攝/上傳日），
  // 用來把相簿照片依實習週次分類
  getWeekNumForDate(dateStr) {
    if (!this.state.startDate || !dateStr) return 1;
    const msDiff = new Date(dateStr) - new Date(this.state.startDate);
    const weekNum = Math.floor(msDiff / 86400000 / 7) + 1;
    return weekNum > 0 ? weekNum : 1;
  },

  // ===== 勤務時間（月次記録） =====
  getCurrentMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  // 旧バージョンの「日次打刻」データから、その月の合計時間を計算（互換用）
  getLegacyMonthHours(month) {
    let total = 0;
    const records = this.state.punchRecords || {};
    Object.keys(records).forEach(date => {
      if (date.slice(0, 7) !== month) return;
      const day = records[date];
      if (day.manualTotal > 0) { total += day.manualTotal; return; }
      (day.records || []).forEach(r => {
        if (r.in && r.out) {
          const [ih, im] = r.in.split(':').map(Number);
          const [oh, om] = r.out.split(':').map(Number);
          total += Math.max(0, (oh * 60 + om) - (ih * 60 + im)) / 60;
        }
      });
    });
    return total;
  },

  // 記録のある月の一覧（月次入力 + 旧データ由来の月）
  getHoursMonths() {
    const months = new Set();
    const mh = this.state.monthlyHours || {};
    Object.keys(mh).forEach(m => { if (mh[m] !== null) months.add(m); });
    Object.keys(this.state.punchRecords || {}).forEach(date => {
      const m = date.slice(0, 7);
      if (!(m in mh) && this.getLegacyMonthHours(m) > 0) months.add(m);
    });
    return [...months].sort();
  },

  getMonthHours(month) {
    const mh = this.state.monthlyHours || {};
    if (month in mh) return Number(mh[month]) || 0;
    return this.getLegacyMonthHours(month);
  },

  calcTotalHours() {
    return this.getHoursMonths().reduce((sum, m) => sum + this.getMonthHours(m), 0);
  },

  // 目標タイプに応じた「達成値」：月ごと→今月の時間 / 累計→全期間の合計
  getHoursProgressValue() {
    return this.state.hoursTargetMode === 'total'
      ? this.calcTotalHours()
      : this.getMonthHours(this.getCurrentMonthStr());
  },

  changeHoursMonth(offset) {
    let [year, month] = this.hoursViewMonth.split('-').map(Number);
    month += offset;
    if (month > 12) { month = 1; year++; }
    else if (month < 1) { month = 12; year--; }
    this.hoursViewMonth = `${year}-${String(month).padStart(2, '0')}`;
    this.renderHoursPage();
  },

  saveMonthHours() {
    const input = this.dom.hoursMonthInput;
    const hours = Number(input.value);
    if (input.value === '' || isNaN(hours) || hours < 0) { alert('0以上の数値を入力してください。'); return; }
    if (hours > 744) { alert('1か月の最大は744時間です。入力内容を確認してください。'); return; }
    if (!this.state.monthlyHours) this.state.monthlyHours = {};
    this.state.monthlyHours[this.hoursViewMonth] = Math.round(hours * 10) / 10;
    this.saveState();
    this.renderHoursPage();
    const btn = this.dom.hoursMonthSave;
    if (btn) {
      btn.textContent = '✅ 保存しました';
      setTimeout(() => { btn.textContent = 'この月の時間を保存'; }, 1500);
    }
  },

  editHoursMonth(month) {
    this.hoursViewMonth = month;
    this.renderHoursPage();
    if (this.dom.hoursMonthInput) {
      this.dom.hoursMonthInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.dom.hoursMonthInput.focus();
    }
  },

  deleteHoursMonth(month) {
    if (!confirm('この月の勤務時間の記録を削除しますか？')) return;
    if (!this.state.monthlyHours) this.state.monthlyHours = {};
    // 旧データ由来の月は null で「削除済み」を記録（残さないと旧データが再び表示されてしまうため）
    if (this.getLegacyMonthHours(month) > 0) this.state.monthlyHours[month] = null;
    else delete this.state.monthlyHours[month];
    this.saveState();
    this.renderHoursPage();
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

  addExpenseRecord(desc, amount, customDate = null, category = null) {
    const targetDate = customDate || this.getTodayStr();
    const currentIsoMonth = targetDate.slice(0, 7);
    this.state.expenses.push({ 
      id: Date.now(), 
      desc, 
      amount, 
      date: targetDate, 
      isoMonth: currentIsoMonth,
      category: category || '未分類',
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
    this.dom.modalTitle.textContent = '🌟 毎日のチェックイン';
    
    this.dom.modalBody.innerHTML = `
      <div style="text-align: center; padding: 20px 10px;">
        <p style="margin-bottom: 24px; font-size: 1.1rem; color: var(--text); line-height: 1.6;">
          おはようございます！新しい一日の始まりです！<br>
          今日のチェックインを済ませて、限定テーマの解放を進めましょう！
        </p>
        <button class="btn" id="btn-modal-checkin" style="width: 100%; font-size: 1.1rem; padding: 12px;">チェックインする <span class="dynamic-icon icon-checkin"></span></button>
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
    
    let msg = `チェックイン完了！累計 ${this.state.checkInCount} 日になりました！`;
    
    if (this.state.checkInCount >= 14 && !this.state.unlockedThemes.includes('theme-monochrome')) {
      this.state.unlockedThemes.push('theme-monochrome');
      msg += '\n\n🎉 14日チェックイン達成！テーマ「シンプルモノクロ」が解放されました！';
    }
    if (this.state.checkInCount >= 50 && !this.state.unlockedThemes.includes('theme-neon-sakura')) {
      this.state.unlockedThemes.push('theme-neon-sakura');
      msg += '\n\n🎉 50日チェックイン達成！テーマ「夜桜ネオン」が解放されました！';
    }
    if (this.state.checkInCount >= 100 && !this.state.unlockedThemes.includes('theme-makie-gold')) {
      this.state.unlockedThemes.push('theme-makie-gold');
      msg += '\n\n🎉 100日チェックイン達成！テーマ「蒔絵金箔」が解放されました！';
    }
    if (this.state.checkInCount >= 200 && !this.state.unlockedThemes.includes('theme-aurora-stage')) {
      this.state.unlockedThemes.push('theme-aurora-stage');
      msg += '\n\n🎉 200日チェックイン達成！テーマ「幻光星海」が解放されました！';
    }
    
    alert(msg);
    this.saveState();
    this.renderAll();
  },

  checkShibaEgg(text) {
    if (this.state.unlockedThemes.includes('theme-shiba-gold')) return;
    const dogKeywords = ['狗', '犬', 'dog', '柴犬', 'shiba', '汪汪', '小狗', '因', 'puppy', 'いぬ', 'イヌ', 'わんこ', 'ワンコ', 'わんわん', 'しば'];
    const hasKeyword = dogKeywords.some(kw => text.toLowerCase().includes(kw));
    if (hasKeyword) {
      this.state.unlockedThemes.push('theme-shiba-gold');
      alert('🐾 隠しイースターエッグ発動！\n記録に犬に関する言葉が含まれていました！特別テーマ「ほっこり柴犬版」が解放されました！🐶✨\n設定ページで切り替えてみてください！');
    }
  },

  applyTheme() {
    document.body.classList.remove('theme-monochrome', 'theme-neon-sakura', 'theme-makie-gold', 'theme-aurora-stage', 'theme-shiba-gold');
    if (this.state.currentTheme !== 'default') {
      document.body.classList.add(this.state.currentTheme);
    }
  },

  renderAll() {
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
    this.dom.historyLastCheckin.textContent = this.state.lastCheckInDate || 'なし';
  },

  showGuidePopup() {
    if (!this.dom.modal) return;
    this.dom.modal.classList.add('active');
    this.dom.modalTitle.textContent = '👋 實習時期へようこそ';
    
    let loginHtml = '';
    if (!this.firebaseUser) {
      loginHtml = `
        <div style="margin-top: 20px; padding: 16px; background: rgba(239, 68, 68, 0.08); border-radius: 12px; border: 1px dashed var(--danger); text-align: center;">
          <p style="margin: 0 0 8px 0; color: var(--danger); font-size: 1rem; font-weight: 700;">⚠️ クラウドアカウントに未ログイン</p>
          <p style="margin: 0 0 12px 0; color: var(--text-muted); font-size: 0.85rem; line-height: 1.5;">データは端末にのみ保存されており、ブラウザの履歴を消すと失われます。<br>ログインして自動クラウドバックアップを有効にしましょう！</p>
          <button class="btn" id="modal-guide-login" style="background: var(--danger); color: white; width: 100%; border: none;">今すぐGoogleでログイン</button>
        </div>
      `;
    } else {
      loginHtml = `
        <div style="margin-top: 20px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 12px; text-align: center;">
          <p style="margin: 0; color: #10b981; font-weight: 700;">✅ ログイン済み：データはクラウドで安全に同期されています</p>
        </div>
      `;
    }

    this.dom.modalBody.innerHTML = `
      <div style="padding: 10px 4px;">
        <p style="font-size: 0.95rem; color: var(--text); line-height: 1.8; margin-top: 0;">
          実習生のために作られた記録ツールです：<br><br>
          
          <span style="display:flex; align-items:flex-start; margin-bottom:8px;">
            <span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center; flex-shrink:0;">⏳</span> 
            <span><b style="white-space:nowrap;">勤務時間</b>：月ごとの合計時間を記録し、目標までの進捗を確認。</span>
          </span>
          
          <span style="display:flex; align-items:flex-start; margin-bottom:8px;">
            <span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center; flex-shrink:0;">💰</span> 
            <span><b style="white-space:nowrap;">家計簿</b>：支出をカテゴリ別に集計し、台湾ドルへ自動換算。</span>
          </span>
          
          <span style="display:flex; align-items:flex-start; margin-bottom:8px;">
            <span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center; flex-shrink:0;">📝</span> 
            <span><b style="white-space:nowrap;">メモ・アルバム</b>：メモや写真を記録し、写真は週ごとにWordへ出力。</span>
          </span>
          
          <span style="display:flex; align-items:flex-start; margin-bottom:8px;">
            <span style="font-size:1.2rem; margin-right:8px; width: 24px; text-align:center; flex-shrink:0;">✅</span> 
            <span><b style="white-space:nowrap;">チェックリスト</b>：期限の30日前からお知らせ。</span>
          </span>
        </p>
        ${loginHtml}
        <button class="btn secondary" id="btn-guide-close" style="width: 100%; margin-top: 16px;">わかりました</button>
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
          alert('ログインに失敗しました：' + error.message); 
        }
      });
    }

    // 綁定關閉按鈕
    document.getElementById('btn-guide-close').addEventListener('click', () => {
      this.dom.modal.classList.remove('active');
      
      // 🌟 新增：關閉教學視窗後，如果今天還沒簽到，就接著跳出簽到！
      if (this.state.lastCheckInDate !== this.getTodayStr()) {
        setTimeout(() => {
          this.showDailyCheckInPopup();
        }, 300); // 稍微等 0.3 秒，讓前一個視窗先優雅地關閉完畢
      }
    });
  },

  renderThemeSelectUI() {
    if (!this.dom.themeSelect) return;
    this.dom.themeSelect.innerHTML = '';
    const themeOptions = [
      { value: 'default', label: 'デフォルト（スタンダードブルー）' },
      { value: 'theme-monochrome', label: '🔒 14日チェックイン：シンプルモノクロ' },
      { value: 'theme-neon-sakura', label: '🔒 50日チェックイン：夜桜ネオン' },
      { value: 'theme-makie-gold', label: '🔒 100日チェックイン：蒔絵金箔' },
      { value: 'theme-aurora-stage', label: '🔒 200日チェックイン：幻光星海' },
      { value: 'theme-shiba-gold', label: '🐾 特別イースターエッグ：ほっこり柴犬版 🐶' },
    ];
    themeOptions.forEach(opt => {
      if (opt.value === 'default' || this.state.unlockedThemes.includes(opt.value)) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label.replace('🔒 ', '✨ 解放済み：');
        if (this.state.currentTheme === opt.value) o.selected = true;
        this.dom.themeSelect.appendChild(o);
      }
    });
  },

  renderHoursPage() {
    const target = this.state.hoursTarget || 160;
    const isTotal = this.state.hoursTargetMode === 'total';
    const value = this.getHoursProgressValue();
    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    // 上部のサマリーカード
    setText('hours-display', value.toFixed(1));
    setText('hours-target-label', isTotal ? '累計の勤務時間' : '今月の勤務時間');
    setText('hours-hint', `目標 ${target} 時間`);

    // ホームの進捗バー
    const pct = Math.min(100, Math.round((value / target) * 100));
    setText('progress-hours-label', isTotal ? '勤務時間（累計）' : '今月の勤務時間');
    setText('progress-hours-text', `${value.toFixed(1)}/${target} 時間`);
    const bar = document.getElementById('progress-hours');
    if (bar) bar.style.width = `${pct}%`;

    // 月ナビ & 入力欄
    if (this.dom.hoursMonthDisplay && this.hoursViewMonth) {
      const [y, m] = this.hoursViewMonth.split('-');
      this.dom.hoursMonthDisplay.textContent = `${y}年${parseInt(m)}月`;
    }
    const input = this.dom.hoursMonthInput;
    if (input && document.activeElement !== input) {
      const has = this.getHoursMonths().includes(this.hoursViewMonth);
      input.value = has ? String(Math.round(this.getMonthHours(this.hoursViewMonth) * 10) / 10) : '';
    }

    // 記録一覧
    if (this.dom.hoursMonthList) {
      const months = this.getHoursMonths().reverse();
      if (months.length === 0) {
        this.dom.hoursMonthList.innerHTML = '<p class="empty-note">まだ記録がありません。</p>';
      } else {
        this.dom.hoursMonthList.innerHTML = months.map(m => {
          const [y, mo] = m.split('-');
          return `<div class="hours-month-row">
            <div><div class="month-name">${y}年${parseInt(mo)}月</div><div class="month-hours">${this.getMonthHours(m).toFixed(1)} 時間</div></div>
            <div>
              <button class="btn-icon" style="color:var(--primary); font-size:1.1rem; cursor:pointer;" aria-label="編集" onclick="APP.editHoursMonth('${m}')">✏️</button>
              <button class="btn-icon" style="color:var(--danger); font-size:1.1rem; cursor:pointer;" aria-label="削除" onclick="APP.deleteHoursMonth('${m}')">🗑️</button>
            </div>
          </div>`;
        }).join('');
      }
    }
  },

  renderExpenses() {
    if (this.dom.monthDisplay && this.state.currentExpenseMonth) {
      const [year, month] = this.state.currentExpenseMonth.split('-');
      this.dom.monthDisplay.textContent = `${year}年${parseInt(month)}月`;
    }

    const monthlyData = this.state.expenses.filter(e => this.getExpenseMonth(e) === this.state.currentExpenseMonth);

    const totalJpy = monthlyData.reduce((sum, e) => sum + e.amount, 0);
    const totalNtd = Math.round(totalJpy * this.state.exchangeRate);
    
    if (document.getElementById('expense-jpy')) document.getElementById('expense-jpy').textContent = this.formatYen(totalJpy);
    if (document.getElementById('expense-ntd')) document.getElementById('expense-ntd').textContent = `NT$${totalNtd.toLocaleString('ja-JP')}`;

    this.renderCategoryBreakdown(monthlyData, totalJpy);

    // 日付ごとにまとめたカード表示
    if (this.dom.monthlyExpenseList) {
      this.dom.monthlyExpenseList.innerHTML = '';
      
      if (monthlyData.length === 0) {
        this.dom.monthlyExpenseList.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding:20px 0;">この月の明細はありません</p>';
      } else {
        const groupedByDate = {};
        monthlyData.forEach(e => {
          if (!groupedByDate[e.date]) groupedByDate[e.date] = [];
          groupedByDate[e.date].push(e);
        });

        // 新しい日付が上
        const sortedDates = Object.keys(groupedByDate).sort().reverse();

        sortedDates.forEach(dateStr => {
          const d = new Date(dateStr);
          const weekdays = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
          const weekdayStr = isNaN(d.getTime()) ? '' : weekdays[d.getDay()];
          const dayTotal = groupedByDate[dateStr].reduce((sum, item) => sum + item.amount, 0);

          const groupDiv = document.createElement('div');
          groupDiv.className = 'expense-day-group';
          
          let html = `
            <div class="expense-day-header">
                <span>${dateStr} ${weekdayStr}</span>
                <span class="expense-day-total">￥-${dayTotal.toLocaleString('ja-JP')}</span>
            </div>
          `;
          
          groupedByDate[dateStr].forEach(e => {
            const trueIdx = this.state.expenses.indexOf(e); // 削除用に元の配列での位置を取得
            html += `
              <div class="expense-item">
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <div style="font-weight:600; font-size:1rem; color:var(--text);">${escapeHtml(e.desc)}</div>
                  <div style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(categoryLabel(e.category))}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="font-weight:700; font-size:1rem; color:var(--text);">￥-${e.amount.toLocaleString('ja-JP')}</div>
                  <button class="btn-icon" style="color:var(--danger); font-size:1.1rem; cursor:pointer;" aria-label="削除" onclick="APP.deleteItem('expenses', ${trueIdx})">🗑️</button>
                </div>
              </div>
            `;
          });
          
          groupDiv.innerHTML = html;
          this.dom.monthlyExpenseList.appendChild(groupDiv);
        });
      }
    }

    // ホームの「今月の支出合計」も同期させる
    this.updateDashboard();
  },

  // カテゴリ別の合計（金額の大きい順）
  renderCategoryBreakdown(monthlyData, totalJpy) {
    const box = document.getElementById('expense-category-list');
    if (!box) return;
    if (monthlyData.length === 0) {
      box.innerHTML = '<p class="empty-note">この月の支出はまだありません。</p>';
      return;
    }
    const sums = {};
    monthlyData.forEach(e => {
      const key = e.category || '未分類';
      sums[key] = (sums[key] || 0) + e.amount;
    });
    box.innerHTML = Object.entries(sums)
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount]) => {
        const pct = totalJpy > 0 ? Math.round((amount / totalJpy) * 100) : 0;
        return `
          <div class="category-row">
            <div class="category-row-top">
              <span class="category-name">${escapeHtml(categoryLabel(key))}</span>
              <span class="category-amount">${this.formatYen(amount)}<small>${pct}%</small></span>
            </div>
            <div class="category-bar"><span style="width:${pct}%"></span></div>
          </div>`;
      }).join('');
  },

  renderReminders() {
    const fullList = document.getElementById('reminder-list');
    if (!fullList) return;
    fullList.innerHTML = '';

    this.state.reminders.forEach((r, idx) => {
      const msDiff = new Date(r.date) - new Date();
      const d = Math.ceil(msDiff / 86400000);
      const isUrgent = (d <= 30 && d >= 0);
      const status = d < 0 ? '期限切れ' : (d === 0 ? '本日締切' : `あと ${d} 日`);
      
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
      const status = d < 0 ? '期限切れ' : (d === 0 ? '本日締切' : `あと ${d} 日 (${c.date})`);

      const lbl = document.createElement('label'); 
      lbl.className = `checklist-item ${isUrgent ? 'urgent' : ''}`;
      lbl.innerHTML = `<input type="checkbox" ${c.checked ? 'checked' : ''}><div><span>${escapeHtml(c.label)}</span><span class="checklist-item-meta">${status}</span></div>`;
      lbl.querySelector('input').addEventListener('change', e => { c.checked = e.target.checked; this.saveState(); this.updateDashboard(); this.renderChecklist(); });
      cl.appendChild(lbl);
    });

    if (document.getElementById('progress-checklist-text')) document.getElementById('progress-checklist-text').textContent = `${checked}/${this.state.checklist.length} 項目`;
    if (document.getElementById('progress-checklist')) document.getElementById('progress-checklist').style.width = `${Math.round((checked / this.state.checklist.length) * 100)}%`;
  },

  updateDashboard() {
    // 今月（実際のカレンダー月）の支出合計 —— 家計簿の記録と連動
    const nowMonth = this.getCurrentMonthStr();
    const monthJpy = this.state.expenses
      .filter(e => this.getExpenseMonth(e) === nowMonth)
      .reduce((sum, e) => sum + e.amount, 0);
    const monthNtd = Math.round(monthJpy * this.state.exchangeRate);
    const expenseText = document.getElementById('progress-expense-text');
    if (expenseText) expenseText.textContent = `${this.formatYen(monthJpy)} / NT$${monthNtd.toLocaleString('ja-JP')}`;

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
      if (!c.checked) { const d = Math.ceil((new Date(c.date) - new Date()) / 86400000); if (d <= 30 && d >= 0) urgents.push({ title: c.label, days: d, type: '重要書類' }); }
    });
    this.state.reminders.forEach(r => { 
      const d = Math.ceil((new Date(r.date) - new Date()) / 86400000); if (d <= 30 && d >= 0) urgents.push({ title: r.title, days: d, type: 'リマインダー' }); 
    });
    
    urgents.sort((a, b) => a.days - b.days).slice(0, 4).forEach(u => {
      dashList.innerHTML += `<div class="reminder-item urgent"><div class="reminder-text"><h4>${escapeHtml(u.title)}</h4><p>⚠️ ${u.type} - あと ${u.days} 日</p></div></div>`;
    });
    if (urgents.length === 0) dashList.innerHTML = '<p style="color:gray; font-size:0.9rem; padding:10px;">30日以内に期限が来るタスクはありません。この調子で頑張りましょう！</p>';
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
        this.dom.modalBody.innerHTML = '<p style="text-align:center; color:gray; padding: 20px;">記録がありません</p>';
        return;
      }
      sortedMonths.forEach((month, index) => {
        const details = document.createElement('details');
        if (index === 0) details.open = true;
        details.style.marginBottom = '12px';
        const summary = document.createElement('summary');
        const [y, m] = month.split('-');
        summary.style.cssText = 'font-size: 1.05rem; font-weight: 600; padding: 12px 16px; background: var(--primary-light); color: var(--primary); border-radius: 8px; cursor: pointer; outline: none; margin-bottom: 8px; list-style: none; display: flex; justify-content: space-between; align-items: center;';
        summary.innerHTML = `<span>${y}年 ${parseInt(m)}月</span><span style="font-size: 0.8rem; opacity: 0.7;">▼ タップで開閉</span>`;
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
      this.dom.modalTitle.textContent = '支出を追加';
      this.dom.modalBody.innerHTML = `
        <div class="input-group" style="margin-bottom: 24px;">
          <label style="font-weight:600; font-size:0.9rem; color:var(--text-muted);">📅 日付を選択</label>
          <input type="date" id="modal-exp-date" value="${this.getTodayStr()}">
        </div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 1rem;">⚡ クイック入力</h3>
          <button class="btn-icon" onclick="APP.openModal('quickExpense')" style="font-size:0.8rem; color:var(--primary);">ショートカットを編集 ⚙️</button>
        </div>
        <div class="expense-buttons" id="modal-quick-box" style="margin-bottom: 32px;"></div>
        
        <h3 style="margin: 0 0 12px; font-size: 1rem;">✍️ 手動入力</h3>
        <div class="input-group">
          <input type="text" id="modal-exp-desc" placeholder="何を買いましたか？（例：昼食）">
          <label for="modal-exp-category" class="field-hint">支出カテゴリ</label>
          <select id="modal-exp-category">
            ${EXPENSE_CATEGORIES.map((c) => `<option value="${c}">${categoryLabel(c)}</option>`).join('')}
          </select>
          <input type="number" id="modal-exp-amount" placeholder="金額（円）を入力" min="0" step="10">
          <button class="btn" id="modal-exp-add">記録する</button>
        </div>
      `;

      // 渲染裡面的快速按鈕
      const quickBox = document.getElementById('modal-quick-box');
      this.state.quickExpenses.forEach(q => {
        const btn = document.createElement('button'); 
        btn.className = 'btn-expense';
        // 固定金額：按鈕上直接顯示金額；每次輸入：顯示「輸入金額」提示使用者按下去還要打字
        btn.textContent = q.mode === 'variable' ? `${q.label}（金額を入力）` : `${q.label} ￥${q.amount}`;
        btn.onclick = () => {
          const d = document.getElementById('modal-exp-date').value || this.getTodayStr();
          if (q.mode === 'variable') {
            // 只帶入名稱跟分類，金額留給使用者自己打，視窗不關閉
            document.getElementById('modal-exp-desc').value = q.label;
            document.getElementById('modal-exp-category').value = q.category || EXPENSE_CATEGORIES[0];
            const amountInput = document.getElementById('modal-exp-amount');
            amountInput.value = '';
            amountInput.focus();
          } else {
            this.addExpenseRecord(q.label, q.amount, d, q.category);
            this.dom.modal.classList.remove('active'); // 自動關閉視窗
          }
        };
        quickBox.appendChild(btn);
      });

      // 綁定自訂輸入按鈕
      document.getElementById('modal-exp-add').onclick = () => {
        const desc = document.getElementById('modal-exp-desc').value.trim() || '支出（手入力）';
        const amt = Number(document.getElementById('modal-exp-amount').value);
        const d = document.getElementById('modal-exp-date').value || this.getTodayStr();
        const category = document.getElementById('modal-exp-category').value;
        if (amt > 0) {
          this.addExpenseRecord(desc, amt, d, category);
          this.dom.modal.classList.remove('active'); // 自動關閉視窗
        }
      };

    } else if (type === 'exportExpenseMonth') {
      this.dom.modalTitle.textContent = '📋 明細をExcelに出力';

      // 找出所有有記帳資料的月份，預設選目前正在看的那個月
      const monthsWithData = [...new Set(this.state.expenses.map(e => this.getExpenseMonth(e)).filter(Boolean))].sort();
      const defaultMonth = this.state.currentExpenseMonth && monthsWithData.includes(this.state.currentExpenseMonth)
        ? this.state.currentExpenseMonth
        : (monthsWithData[monthsWithData.length - 1] || this.getTodayStr().slice(0, 7));

      this.dom.modalBody.innerHTML = `
        <div class="input-group" style="margin-bottom: 20px;">
          <label for="export-month-select" class="field-hint">月を選択</label>
          <select id="export-month-select">
            ${monthsWithData.length === 0 ? `<option value="${defaultMonth}">データがありません</option>` : ''}
            ${monthsWithData.map(m => {
              const [y, mo] = m.split('-');
              return `<option value="${m}" ${m === defaultMonth ? 'selected' : ''}>${y}年${parseInt(mo)}月</option>`;
            }).join('')}
          </select>
        </div>
        <div style="display:flex; gap:10px; margin-bottom: 20px; flex-wrap:wrap;">
          <button class="btn" id="btn-copy-expense-month" style="flex:1;">📋 クリップボードにコピー</button>
          <button class="btn secondary" id="btn-download-expense-month" style="flex:1;">📥 Excelファイルをダウンロード</button>
        </div>
        <p class="hint" style="margin-top:0; font-size:0.82rem;">コピー後、Excel帳簿の該当月の空白行に貼り付けるだけでOKです。列の順番は「日付・分類・項目・実際の支出」。分類は既存のExcelに合わせて中国語表記のままコピーされます。</p>
        <div style="overflow-x:auto; border:1px solid var(--border); border-radius: 12px;">
          <table id="export-preview-table" style="width:100%; border-collapse: collapse; font-size:0.85rem;">
            <thead>
              <tr style="background: var(--primary-light);">
                <th style="padding:8px; text-align:left;">日付</th>
                <th style="padding:8px; text-align:left;">分類</th>
                <th style="padding:8px; text-align:left;">項目</th>
                <th style="padding:8px; text-align:right;">実際の支出</th>
              </tr>
            </thead>
            <tbody id="export-preview-body"></tbody>
          </table>
        </div>
      `;

      const monthSelect = document.getElementById('export-month-select');
      const previewBody = document.getElementById('export-preview-body');
      const copyBtn = document.getElementById('btn-copy-expense-month');
      const downloadBtn = document.getElementById('btn-download-expense-month');

      const getRowsForMonth = (month) => {
        return this.state.expenses
          .filter(e => this.getExpenseMonth(e) === month)
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(e => ({
            date: e.date,
            category: e.category || '未分類',
            desc: e.desc,
            amount: e.amount,
          }));
      };

      const renderPreview = () => {
        const rows = getRowsForMonth(monthSelect.value);
        if (rows.length === 0) {
          previewBody.innerHTML = `<tr><td colspan="4" style="padding:16px; text-align:center; color:var(--text-muted);">この月の支出記録はありません</td></tr>`;
          return;
        }
        previewBody.innerHTML = rows.map(r => `
          <tr style="border-top:1px solid var(--border);">
            <td style="padding:8px;">${escapeHtml(r.date)}</td>
            <td style="padding:8px;">${escapeHtml(r.category)}</td>
            <td style="padding:8px;">${escapeHtml(r.desc)}</td>
            <td style="padding:8px; text-align:right;">${r.amount}</td>
          </tr>
        `).join('');
      };
      renderPreview();
      monthSelect.addEventListener('change', renderPreview);

      copyBtn.addEventListener('click', async () => {
        const rows = getRowsForMonth(monthSelect.value);
        if (rows.length === 0) { alert('この月にはコピーできる支出記録がありません。'); return; }
        // Tab 分隔，貼到 Excel 時每個欄位會自動落在對應的儲存格
        const tsv = rows.map(r => `${r.date}\t${r.category}\t${r.desc}\t${r.amount}`).join('\n');
        try {
          await navigator.clipboard.writeText(tsv);
          copyBtn.textContent = '✅ コピーしました！';
          setTimeout(() => { copyBtn.textContent = '📋 クリップボードにコピー'; }, 2000);
        } catch (e) {
          alert('コピーに失敗しました。ブラウザが自動コピーに対応していない可能性があります。「Excelファイルをダウンロード」をご利用ください。');
        }
      });

      downloadBtn.addEventListener('click', () => {
        const rows = getRowsForMonth(monthSelect.value);
        if (rows.length === 0) { alert('この月にはダウンロードできる支出記録がありません。'); return; }
        const tableRows = rows.map(r => `
          <tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.category)}</td>
            <td>${escapeHtml(r.desc)}</td>
            <td>${r.amount}</td>
          </tr>`).join('');
        const html = `
          <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:x='urn:schemas-microsoft-com:office:excel' xmlns='http://www.w3.org/TR/REC-html40'>
          <head><meta charset="utf-8"></head>
          <body>
            <table border="1">
              <tr><th>日期</th><th>分類</th><th>項目</th><th>實際支出</th></tr>
              ${tableRows}
            </table>
          </body>
          </html>
        `;
        const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `支出明細_${monthSelect.value}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });

    } else if (type === 'checkInHistory') {
      this.dom.modalTitle.textContent = '📅 チェックイン履歴カレンダー';
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
        
        const days = ['日', '月', '火', '水', '木', '金', '土'];
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

    } else if (type === 'quickExpense') {
      this.dom.modalTitle.textContent = 'クイック入力ボタンの編集';
      const categoryListText = EXPENSE_CATEGORIES.map((c, i) => `${i + 1}: ${categoryLabel(c)}`).join('\n');
      this.state.quickExpenses.forEach((q, idx) => {
        const div = document.createElement('div'); div.className = 'history-card';
        const amountLabel = q.mode === 'variable' ? '金額：毎回入力' : `固定金額：￥${q.amount}`;
        div.innerHTML = `<p>${escapeHtml(q.label)}<br><span class="hint" style="font-size:0.8rem;">${amountLabel}｜カテゴリ：${escapeHtml(categoryLabel(q.category))}</span></p><div class="history-actions"><button class="btn btn-sm secondary" onclick="APP.editQuickExpense(${idx})">編集</button> <button class="btn btn-sm danger" onclick="APP.deleteItem('quickExpenses', ${idx}, 'quickExpense')">削除</button></div>`;
        this.dom.modalBody.appendChild(div);
      });
      const addBtn = document.createElement('button'); addBtn.className = 'btn secondary'; addBtn.textContent = '+ ショートカットを追加';
      addBtn.onclick = () => {
        const label = prompt('ボタン名（例：コーヒー）'); if (!label) return;
        const isVariable = confirm('この項目は毎回金額が変わりますか？\n\n「OK」＝ 押したあとに毎回金額を入力（例：コーヒー、昼食）\n「キャンセル」＝ 金額固定で、押すだけで記録（例：家賃￥5000）');
        let amount = 0;
        if (!isVariable) {
          amount = Number(prompt('固定金額'));
          if (!amount) return;
        }
        const catNum = Number(prompt(`支出カテゴリ（番号 1-13 を入力）：\n${categoryListText}`));
        const category = EXPENSE_CATEGORIES[catNum - 1] || '未分類';
        this.state.quickExpenses.push({ id: Date.now(), label, amount, category, mode: isVariable ? 'variable' : 'fixed' });
        this.saveState(); this.renderExpenses(); this.openModal('quickExpense');
      };
      this.dom.modalBody.appendChild(addBtn);

    } else if (type === 'note') {
      this.dom.modalTitle.textContent = '過去のメモ（月別）';
      const targetArr = this.state.notes.map((item, idx) => ({ ...item, _idx: idx }));
      renderGrouped(targetArr, item => getMonthFromId(item.id), (item) => {
        const div = document.createElement('div'); div.className = 'history-card';
        div.innerHTML = `<p><span style="font-size:0.8rem; color:gray;">${escapeHtml(item.date || '')}</span></p><p style="white-space:pre-wrap;">${escapeHtml(item.text || '')}</p><div class="history-actions"><button class="btn btn-sm danger" onclick="APP.deleteItem('notes', ${item._idx}, 'note')">削除</button></div>`;
        return div;
      });

    } else if (type === 'manageChecklist') {
      this.dom.modalTitle.textContent = '📋 学校指定書類リストの管理';
      this.dom.modalBody.innerHTML = '';

      // 渲染現有的清單項目
      this.state.checklist.forEach((c, idx) => {
        const div = document.createElement('div');
        div.className = 'history-card';
        div.style.marginBottom = '12px';
        
        // 🌟 這裡已復原為正確的檢查表顯示邏輯
        div.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="margin: 0; font-weight: 600; color: var(--text);">${escapeHtml(c.label)}</p>
              <p style="margin: 4px 0 0 0; color:var(--text-muted); font-size: 0.85rem;">期限：${c.date || 'なし'}</p>
            </div>
            <div class="history-actions" style="margin-top:0;">
              <button class="btn-icon" style="color:var(--primary); font-size:1.1rem; cursor:pointer;" onclick="APP.editChecklistItem(${idx})">✏️</button>
              <button class="btn-icon" style="color:var(--danger); font-size:1.1rem; cursor:pointer;" onclick="APP.deleteItem('checklist', ${idx}, 'manageChecklist')">🗑️</button>
            </div>
          </div>
        `;
        this.dom.modalBody.appendChild(div);
      });

      // 新增按鈕
      const addBtn = document.createElement('button');
      addBtn.className = 'btn secondary';
      addBtn.textContent = '+ 書類を追加';
      addBtn.style.marginTop = '8px';
      addBtn.onclick = () => {
        const label = prompt('書類名（例：実習契約書）：');
        if (!label) return;
        const date = prompt('締切日 (YYYY-MM-DD)：', this.getTodayStr());
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
      this.dom.modalTitle.textContent = '📸 実習アルバム';
      this.dom.modalBody.innerHTML = `
        <div style="margin-bottom: 20px; display:flex; gap: 10px; flex-wrap: wrap;">
            <input type="file" id="image-upload" accept="image/*" multiple style="display:none">
            <button class="btn" onclick="document.getElementById('image-upload').click()">写真を追加</button>
            <button class="btn secondary" id="export-gallery">📥 Wordに出力（週ごと）</button>
        </div>
        <div id="upload-progress-container" style="display:none; margin-bottom: 20px;">
            <div class="progress-bar" style="background: rgba(0,0,0,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                <span id="upload-progress-bar" style="display: block; height: 100%; width: 0%; background: var(--primary); transition: width 0.3s;"></span>
            </div>
            <p id="upload-status" style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top: 8px;">準備中...</p>
        </div>
        <div id="modal-gallery-groups"></div>
      `;

      const groupsContainer = document.getElementById('modal-gallery-groups');
      const images = this.state.galleryImages || [];
      if (images.length === 0) {
        groupsContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; text-align:center; padding: 20px 0;">まだ写真がありません。「写真を追加」から最初の1枚を追加しましょう！</p>';
      } else {
        // 依實習週次分組；沒有 week 欄位的舊照片，用當初上傳日期回推所屬週次
        const byWeek = {};
        images.forEach((img, idx) => {
          const week = parseInt(img.week) || this.getWeekNumForDate(img.date);
          if (!byWeek[week]) byWeek[week] = [];
          byWeek[week].push({ ...img, idx });
        });
        const weekKeys = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

        groupsContainer.innerHTML = weekKeys.map((week) => {
          const cards = byWeek[week].map((img) => `
            <div class="gallery-item" style="margin-bottom: 15px; border-radius: 12px; overflow: hidden; position: relative; border: 1px solid var(--border); break-inside: avoid;">
              <img src="${img.url}" style="width: 100%; display: block;" alt="実習の写真">
              <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.6); color: white; padding: 6px; font-size: 0.75rem;">
                ${img.date}
                <button class="btn-icon" onclick="APP.deleteItem('galleryImages', ${img.idx}, 'gallery')" style="float:right; background:none; border:none; color:var(--danger); font-size:1.1rem; cursor:pointer;">🗑️</button>
              </div>
            </div>`).join('');
          return `
            <div class="gallery-week-group" style="margin-bottom: 24px;">
              <h3 style="font-size: 0.95rem; color: var(--text-muted); margin: 0 0 12px;">第${week}週</h3>
              <div class="masonry-grid" style="column-count: 2; column-gap: 15px;">${cards}</div>
            </div>`;
        }).join('');
      }

      const exportGalleryBtn = document.getElementById('export-gallery');
      if (exportGalleryBtn) exportGalleryBtn.addEventListener('click', () => this.exportGalleryToWord());

      document.getElementById('image-upload').addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length === 0) return;

        if (!this.firebaseUser) {
          alert('🚨 エラー：先に設定ページでGoogleアカウントにログインしてください！');
          return;
        }

        if (CLOUDINARY_CLOUD_NAME.includes('請填入')) {
          alert('🚨 Cloudinaryが未設定です。app.js の先頭にある CLOUDINARY_CLOUD_NAME と CLOUDINARY_UPLOAD_PRESET を入力してください。');
          return;
        }

        const progressContainer = document.getElementById('upload-progress-container');
        const progressBar = document.getElementById('upload-progress-bar');
        const statusText = document.getElementById('upload-status');

        progressContainer.style.display = 'block';
        let completedCount = 0;

        Array.from(files).forEach((file, index) => {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
          // 用資料夾把每個使用者的照片分開放，方便之後管理
          formData.append('folder', `intern-app/${this.firebaseUser.uid}`);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

          xhr.upload.addEventListener('progress', (evt) => {
            if (!evt.lengthComputable) return;
            const progress = (evt.loaded / evt.total) * 100;
            progressBar.style.width = `${progress}%`;
            statusText.textContent = `${index + 1}枚目をアップロード中 (${Math.round(progress)}%)`;
          });

          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
              console.error('[上傳失敗詳細資訊]:', xhr.responseText);
              alert(`アップロードに失敗しました。\nHTTP ${xhr.status}\nCloudinaryの Cloud name / Upload preset が正しいか、presetが Unsigned になっているか確認してください。`);
              progressContainer.style.display = 'none';
              return;
            }
            try {
              const data = JSON.parse(xhr.responseText);
              this.state.galleryImages = this.state.galleryImages || [];
              this.state.galleryImages.push({ url: data.secure_url, date: this.getNowString(), week: this.getWeekNum() });
              this.saveState();

              completedCount++;
              if (completedCount === files.length) {
                statusText.textContent = 'すべてのアップロードが完了しました！';
                setTimeout(() => { this.openModal('gallery'); }, 1000);
              }
            } catch (parseErr) {
              console.error('[解析回應失敗]:', parseErr);
              alert('写真はアップロードされましたが、表示用のURLを取得できませんでした。');
            }
          };

          xhr.onerror = () => {
            console.error('[網路錯誤]: Cloudinary 上傳失敗');
            alert('アップロードに失敗しました：ネットワークエラーです。接続を確認してもう一度お試しください。');
            progressContainer.style.display = 'none';
          };

          xhr.send(formData);
        });
      });
    }
  },

  deleteItem(arrayName, index, modalToReopen) { 
    if (confirm('削除してもよろしいですか？')) { this.state[arrayName].splice(index, 1); this.saveState(); this.renderAll(); if (modalToReopen) this.openModal(modalToReopen); } 
  },
  
  editTextItem(arrayName, index, modalToReopen) { 
    const newText = prompt('内容を編集してください：', this.state[arrayName][index].text); 
    if (newText) { this.state[arrayName][index].text = newText; this.saveState(); this.renderAll(); this.openModal(modalToReopen); } 
  },

  editReminder(index) { 
    const r = this.state.reminders[index]; 
    const newTitle = prompt('リマインダー名を編集：', r.title); if (newTitle) r.title = newTitle; 
    const newDate = prompt('日付を編集 (YYYY-MM-DD)：', r.date); if (newDate) r.date = newDate; 
    this.saveState(); this.renderReminders(); this.updateDashboard(); 
  },

  editQuickExpense(index) { 
    const q = this.state.quickExpenses[index]; 
    const newLabel = prompt('名前：', q.label); if (newLabel) q.label = newLabel; 
    const isVariable = confirm('この項目は毎回金額が変わりますか？\n\n「OK」＝ 押したあとに毎回金額を入力\n「キャンセル」＝ 金額固定で、押すだけで記録');
    q.mode = isVariable ? 'variable' : 'fixed';
    if (!isVariable) {
      const newAmt = Number(prompt('固定金額：', q.amount || '')); if (newAmt) q.amount = newAmt;
    }
    const categoryListText = EXPENSE_CATEGORIES.map((c, i) => `${i + 1}: ${categoryLabel(c)}`).join('\n');
    const currentCatIdx = EXPENSE_CATEGORIES.indexOf(q.category) + 1;
    const catNum = prompt(`支出カテゴリ（番号 1-13 を入力、空欄なら変更なし）：\n${categoryListText}`, currentCatIdx > 0 ? currentCatIdx : '');
    if (catNum) { const c = EXPENSE_CATEGORIES[Number(catNum) - 1]; if (c) q.category = c; }
    this.saveState(); this.renderExpenses(); this.openModal('quickExpense'); 
  },

  editChecklistItem(index) {
    const c = this.state.checklist[index];
    const newLabel = prompt('書類名を編集：', c.label);
    if (newLabel) c.label = newLabel;
    
    const newDate = prompt('締切日を編集 (YYYY-MM-DD)：', c.date);
    if (newDate) c.date = newDate;

    this.saveState();
    this.renderChecklist();
    this.updateDashboard();
    this.openModal('manageChecklist'); // 修改完自動重新整理彈窗
  },

  // 把每張圖片抓下來轉成 base64，這樣存成的 .doc 檔案本身就包含完整照片，
  // 之後就算網路斷線、Cloudinary 網址失效，開啟舊檔案還是看得到照片。
  async _urlToBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  async exportGalleryToWord() {
    const images = this.state.galleryImages || [];
    if (images.length === 0) {
      alert('出力できる写真がまだありません。');
      return;
    }

    const exportBtn = document.getElementById('export-gallery');
    const originalLabel = exportBtn ? exportBtn.textContent : '';
    if (exportBtn) { exportBtn.disabled = true; exportBtn.textContent = '変換中です。しばらくお待ちください...'; }

    try {
      // 1. 依週次分組
      const byWeek = {};
      images.forEach((img) => {
        const week = parseInt(img.week) || this.getWeekNumForDate(img.date);
        if (!byWeek[week]) byWeek[week] = [];
        byWeek[week].push(img);
      });
      const weekKeys = Object.keys(byWeek).map(Number).sort((a, b) => a - b);

      // 2. 把每張圖轉成 base64（平行處理，加快速度）
      const base64Cache = {};
      await Promise.all(images.map(async (img) => {
        try {
          base64Cache[img.url] = await this._urlToBase64(img.url);
        } catch (e) {
          console.error('圖片轉換失敗：', img.url, e);
          base64Cache[img.url] = null;
        }
      }));

      // 3. 組成一週一列的表格
      const rows = weekKeys.map((week) => {
        const cellImages = byWeek[week].map((img) => {
          const src = base64Cache[img.url];
          if (!src) return `<p style="color:#999;">（這張照片轉換失敗：${img.date}）</p>`;
          return `<img src="${src}" style="width:220px; margin:6px; border:1px solid #ccc;"><br><span style="font-size:9pt; color:#666;">${img.date}</span>`;
        }).join('');
        return `
          <tr>
            <td style="border:1px solid black; padding:10px; width:80px; vertical-align:top; font-weight:normal;">第 ${week} 週</td>
            <td style="border:1px solid black; padding:10px; vertical-align:top;">${cellImages}</td>
          </tr>`;
      }).join('');

      const html = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <meta charset='utf-8'>
          <title>實習相簿</title>
          <style>
            @page { margin: 2.0cm; }
            body { font-family: "標楷體", "DFKai-SB", serif; font-weight: normal; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid black; font-weight: normal; }
            th { background-color: #e0e0e0; text-align: center; padding: 8px; }
          </style>
        </head>
        <body>
          <table>
            <tr><th>週次</th><th>照片</th></tr>
            ${rows}
          </table>
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '實習相簿_依週次.doc';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('匯出相簿失敗：', e);
      alert('出力に失敗しました。ネットワーク接続を確認してもう一度お試しください。');
    } finally {
      if (exportBtn) { exportBtn.disabled = false; exportBtn.textContent = originalLabel; }
    }
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