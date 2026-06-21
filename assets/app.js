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
const storage = getStorage(app); // 必須正確初始化 storage
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
    galleryImages: [], // 確保有這個陣列
    checkInCount: 0,
    lastCheckInDate: '',
    checkInHistory: [],
    currentTheme: 'default',
    unlockedThemes: ['default'],
    reminders: [],
    checklist: [],
    quickExpenses: []
  },
  
  firebaseUser: null,

  init() {
    this.cacheDom();
    this.setupListeners();
    this.loadLocalState();
    this.applyTheme();
    this.renderAll();
    
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        this.firebaseUser = user;
        await this.loadCloudState(user);
      }
      this.renderAll();
    });
  },

  cacheDom() {
    this.dom = {
      modal: document.getElementById('modal-overlay'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalClose: document.getElementById('modal-close')
    };
  },

  setupListeners() {
    // 綁定開啟相簿按鈕
    const btnOpenGallery = document.getElementById('btn-open-gallery');
    if (btnOpenGallery) btnOpenGallery.addEventListener('click', () => this.openModal('gallery'));

    if (this.dom.modalClose) this.dom.modalClose.addEventListener('click', () => this.dom.modal.classList.remove('active'));
    
    // ... 其他既有的監聽器 ...
  },

  openModal(type) {
    if (!this.dom.modal) return;
    this.dom.modal.classList.add('active');
    this.dom.modalBody.innerHTML = '';

    if (type === 'gallery') {
      this.dom.modalTitle.textContent = '📸 實習相簿';
      this.dom.modalBody.innerHTML = `
        <div style="margin-bottom: 20px; display:flex; gap: 10px;">
            <input type="file" id="image-upload" accept="image/*" multiple style="display:none">
            <button class="btn" onclick="document.getElementById('image-upload').click()">上傳新圖片</button>
        </div>
        <div class="masonry-grid" id="modal-gallery-grid"></div>
      `;
      document.getElementById('image-upload').addEventListener('change', (e) => this.handleImageUpload(e));
    }
    // ... 其他 type 的處理 ...
  },

  handleImageUpload(e) {
    const files = e.target.files;
    if (files.length === 0 || !this.firebaseUser) return;
    
    Array.from(files).forEach(file => {
      const storageRef = ref(storage, `images/${this.firebaseUser.uid}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on('state_changed', null, (err) => alert(err.message), async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        this.state.galleryImages = this.state.galleryImages || [];
        this.state.galleryImages.push({ url, date: new Date().toLocaleString() });
        this.saveState();
        this.openModal('gallery');
        alert('上傳成功');
      });
    });
  },

  saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    if (this.firebaseUser) setDoc(doc(db, "users", this.firebaseUser.uid), this.state).catch(console.error);
  },

  loadLocalState() {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) try { this.state = { ...this.state, ...JSON.parse(s) }; } catch(e) {}
  },

  async loadCloudState(user) {
    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (docSnap.exists()) { this.state = { ...this.state, ...docSnap.data() }; }
  },

  renderAll() { /* 渲染邏輯 */ },
  getNowString() { return new Date().toLocaleString(); },
  applyTheme() { /* 主題邏輯 */ }
};

window.APP = APP;
APP.init();