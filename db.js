/**
 * OmniraDB — Base de datos Firebase + localStorage encriptado
 * ─────────────────────────────────────────────────────────────
 * Firebase como base de datos principal en la nube.
 * localStorage encriptado como fallback si Firebase no está disponible.
 */

// ── FIREBASE CONFIGURATION ──────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAa46owF9zad-KakVxnOg7hlsEaNwz0XaU",
  authDomain: "omnira-48300.firebaseapp.com",
  projectId: "omnira-48300",
  storageBucket: "omnira-48300.firebasestorage.app",
  messagingSenderId: "170811628686",
  appId: "1:170811628686:web:9508be8b106210df4a7dff"
};

// Firebase instances (loaded dynamically)
let _firebaseApp = null;
let _firebaseAuth = null;
let _firebaseDB = null;
let _firebaseFns = null;

async function initFirebase() {
  if (_firebaseDB) return true;
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
            signOut, onAuthStateChanged, sendPasswordResetEmail } =
      await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
            collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch } =
      await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    _firebaseApp = initializeApp(FIREBASE_CONFIG);
    _firebaseAuth = getAuth(_firebaseApp);
    _firebaseDB = getFirestore(_firebaseApp);
    _firebaseFns = {
      createUserWithEmailAndPassword, signInWithEmailAndPassword,
      signOut, onAuthStateChanged, sendPasswordResetEmail,
      doc, getDoc, setDoc, updateDoc, deleteDoc,
      collection, query, where, getDocs, addDoc, serverTimestamp, writeBatch
    };
    return true;
  } catch(e) {
    console.warn('Firebase no disponible, usando localStorage:', e);
    return false;
  }
}

/**
 * OmniraDB — Base de datos encriptada en localStorage (fallback)
 * ─────────────────────────────────────────────────────
 * Usa AES-256-GCM via Web Crypto API (nativa en todos los navegadores modernos).
 * Los datos NUNCA se almacenan en texto plano — siempre encriptados.
 *
 * Para migrar a backend real: cambiar los métodos get/set/delete
 * para que llamen a tu API en lugar de localStorage.
 *
 * ESTRUCTURA DE DATOS:
 * ─────────────────────────────────────────────────────
 * users[]     → clientes registrados
 * events[]    → reservas del calendario (por usuario)
 * business{}  → datos del negocio (por usuario)
 * bot{}       → config del bot (por usuario)
 * admin{}     → credenciales del administrador
 */

const OmniraDB = (() => {

  // ── CIFRADO LOCAL AES-256-GCM (para datos extra sensibles) ──
  const MASTER_PASS = 'Omnira_Secure_2025_#';
  const SALT = 'OmniraDBSalt_v1';
  let _cryptoKey = null;

  async function _getKey() {
    if (_cryptoKey) return _cryptoKey;
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey('raw', enc.encode(MASTER_PASS), 'PBKDF2', false, ['deriveKey']);
    _cryptoKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode(SALT), iterations: 100000, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
    return _cryptoKey;
  }

  async function _encrypt(data) {
    const key = await _getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
    const combined = new Uint8Array(iv.length + cipher.byteLength);
    combined.set(iv); combined.set(new Uint8Array(cipher), iv.length);
    return btoa(String.fromCharCode(...combined));
  }

  async function _decrypt(b64) {
    try {
      const key = await _getKey();
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0,12) }, key, bytes.slice(12));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { return null; }
  }

  async function _lstore(key, value) {
    localStorage.setItem('omnira_' + key, await _encrypt(value));
  }
  async function _lload(key, fallback = null) {
    const raw = localStorage.getItem('omnira_' + key);
    if (!raw) return fallback;
    const d = await _decrypt(raw);
    return d !== null ? d : fallback;
  }
  function _lremove(key) { localStorage.removeItem('omnira_' + key); }

  // ── FIRESTORE HELPERS ────────────────────────────────
  async function _fsGet(collection, docId) {
    if (!_firebaseReady) return null;
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const snap = await getDoc(doc(_db, collection, docId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }
  async function _fsSet(collection, docId, data) {
    if (!_firebaseReady) return;
    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await setDoc(doc(_db, collection, docId), data, { merge: true });
  }
  async function _fsQuery(collection, field, op, value) {
    if (!_firebaseReady) return [];
    const { collection: col, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const q = query(col(_db, collection), where(field, op, value));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function _fsGetAll(collection) {
    if (!_firebaseReady) return [];
    const { collection: col, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const snap = await getDocs(col(_db, collection));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function _fsDelete(collection, docId) {
    if (!_firebaseReady) return;
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    await deleteDoc(doc(_db, collection, docId));
  }

  return {

    // ── USERS ────────────────────────────────────────────
    async getUsers() {
      await _initFirebase();
      if (_firebaseReady) return await _fsGetAll('users');
      return await _lload('users', []);
    },

    async saveUser(user) {
      await _initFirebase();
      const { password, ...safeUser } = user;
      // Guardar password cifrado en local, resto en Firebase
      if (password) await _lstore('pwd_' + user.id, password);
      safeUser.updatedAt = new Date().toISOString();
      if (!safeUser.createdAt) safeUser.createdAt = new Date().toISOString();
      if (_firebaseReady) {
        await _fsSet('users', user.id, safeUser);
      } else {
        const users = await _lload('users', []);
        const idx = users.findIndex(u => u.id === user.id);
        if (idx >= 0) users[idx] = { ...users[idx], ...safeUser };
        else users.push(safeUser);
        await _lstore('users', users);
      }
      return safeUser;
    },

    async getUserByEmail(email) {
      await _initFirebase();
      if (_firebaseReady) {
        const results = await _fsQuery('users', 'email', '==', email.toLowerCase().trim());
        return results[0] || null;
      }
      const users = await _lload('users', []);
      return users.find(u => u.email?.toLowerCase() === email.toLowerCase().trim()) || null;
    },

    async getUserById(id) {
      await _initFirebase();
      if (_firebaseReady) return await _fsGet('users', id);
      const users = await _lload('users', []);
      return users.find(u => u.id === id) || null;
    },

    async getUserPassword(id) {
      return await _lload('pwd_' + id, null);
    },

    async deleteUser(id) {
      await _initFirebase();
      if (_firebaseReady) {
        await _fsDelete('users', id);
        // Borrar subcolecciones
        const events = await _fsQuery('events', 'userId', '==', id);
        for (const e of events) await _fsDelete('events', e.id);
        await _fsDelete('business', id);
        await _fsDelete('bot', id);
      } else {
        const users = (await _lload('users', [])).filter(u => u.id !== id);
        await _lstore('users', users);
        _lremove('events_' + id);
        _lremove('business_' + id);
        _lremove('bot_' + id);
      }
      _lremove('pwd_' + id);
    },

    async updateUserPlan(id, plan, botActive) {
      const user = await this.getUserById(id);
      if (!user) return null;
      return this.saveUser({ ...user, plan, botActive });
    },

    // ── EVENTS ───────────────────────────────────────────
    async getEvents(userId) {
      await _initFirebase();
      if (_firebaseReady) return await _fsQuery('events', 'userId', '==', userId);
      return await _lload('events_' + userId, []);
    },

    async getAllEvents() {
      await _initFirebase();
      if (_firebaseReady) {
        const all = await _fsGetAll('events');
        // Enriquecer con nombre del usuario
        const users = await this.getUsers();
        const uMap = {};
        users.forEach(u => uMap[u.id] = u);
        return all.map(e => ({ ...e, userName: uMap[e.userId]?.businessName || '—', userEmail: uMap[e.userId]?.email || '—' }));
      }
      const users = await this.getUsers();
      const all = [];
      for (const u of users) {
        const evs = await this.getEvents(u.id);
        evs.forEach(e => all.push({ ...e, userName: u.businessName, userEmail: u.email }));
      }
      return all;
    },

    async saveEvent(userId, event) {
      await _initFirebase();
      if (!event.id) {
        event.id = 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
        event.userId = userId;
        event.createdAt = new Date().toISOString();
      }
      event.updatedAt = new Date().toISOString();
      if (_firebaseReady) {
        await _fsSet('events', event.id, event);
      } else {
        const all = await _lload('events_' + userId, []);
        const idx = all.findIndex(e => e.id === event.id);
        if (idx >= 0) all[idx] = { ...all[idx], ...event };
        else all.push(event);
        await _lstore('events_' + userId, all);
      }
      return event;
    },

    async deleteEvent(userId, eventId) {
      await _initFirebase();
      if (_firebaseReady) { await _fsDelete('events', eventId); return; }
      const all = (await _lload('events_' + userId, [])).filter(e => e.id !== eventId);
      await _lstore('events_' + userId, all);
    },

    async getMonthlyEventCount(userId) {
      const events = await this.getEvents(userId);
      const now = new Date();
      return events.filter(e => {
        const d = new Date(e.datetime || e.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.source === 'manual';
      }).length;
    },

    // ── BUSINESS ─────────────────────────────────────────
    async getBusiness(userId) {
      await _initFirebase();
      if (_firebaseReady) return (await _fsGet('business', userId)) || {};
      return await _lload('business_' + userId, {});
    },

    async saveBusiness(userId, data) {
      await _initFirebase();
      const payload = { ...data, updatedAt: new Date().toISOString() };
      if (_firebaseReady) await _fsSet('business', userId, payload);
      else await _lstore('business_' + userId, payload);
    },

    // ── BOT ──────────────────────────────────────────────
    async getBot(userId) {
      await _initFirebase();
      if (_firebaseReady) return (await _fsGet('bot', userId)) || {};
      return await _lload('bot_' + userId, {});
    },

    async saveBot(userId, data) {
      await _initFirebase();
      const payload = { ...data, updatedAt: new Date().toISOString() };
      if (_firebaseReady) await _fsSet('bot', userId, payload);
      else await _lstore('bot_' + userId, payload);
    },

    // ── ADMIN AUTH ───────────────────────────────────────
    async initAdmin() {
      const admin = await _lload('admin', null);
      if (!admin) {
        await _lstore('admin', {
          username: 'admin',
          password: 'Omnira2025!',
          name: 'Omnira Admin',
          createdAt: new Date().toISOString()
        });
      }
    },

    async loginAdmin(username, password) {
      await this.initAdmin();
      const admin = await _lload('admin', null);
      if (!admin) throw new Error('Error de configuración');
      if (admin.username !== username) throw new Error('Usuario incorrecto');
      if (admin.password !== password) throw new Error('Contraseña incorrecta');
      return { ...admin, password: undefined };
    },

    async updateAdminPassword(currentPass, newPass) {
      const admin = await _lload('admin', null);
      if (!admin || admin.password !== currentPass) throw new Error('Contraseña actual incorrecta');
      await _lstore('admin', { ...admin, password: newPass, updatedAt: new Date().toISOString() });
    },

    // ── STATS ────────────────────────────────────────────
    async getGlobalStats() {
      const users = await this.getUsers();
      const allEvents = await this.getAllEvents();
      const now = new Date();
      return {
        totalUsers: users.length,
        proUsers: users.filter(u => u.plan === 'pro').length,
        freeUsers: users.filter(u => u.plan !== 'pro').length,
        activeUsers: users.filter(u => u.botActive).length,
        totalEvents: allEvents.length,
        monthlyEvents: allEvents.filter(e => {
          const d = new Date(e.datetime || e.createdAt);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length,
        monthlyRevenue: users.filter(u => u.plan === 'pro').length * 99,
      };
    },

    async exportUsers() {
      const users = await this.getUsers();
      return users.map(u => ({ ...u, password: undefined }));
    },

    // ── FIREBASE AUTH (para panel del cliente) ───────────
    async firebaseRegister(email, password, userData) {
      await _initFirebase();
      if (!_firebaseReady) throw new Error('Firebase no disponible');
      const { createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const cred = await createUserWithEmailAndPassword(_auth, email, password);
      const uid = cred.user.uid;
      await this.saveUser({ ...userData, id: uid, email });
      const token = await cred.user.getIdToken();
      return { user: { ...userData, id: uid, email }, token };
    },

    async firebaseLogin(email, password) {
      await _initFirebase();
      if (!_firebaseReady) throw new Error('Firebase no disponible');
      const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const cred = await signInWithEmailAndPassword(_auth, email, password).catch(err => {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') throw new Error('No existe ninguna cuenta con ese email.');
        if (err.code === 'auth/wrong-password') throw new Error('Contraseña incorrecta.');
        throw new Error('Error al iniciar sesión.');
      });
      const user = await this.getUserById(cred.user.uid) || { id: cred.user.uid, email };
      const token = await cred.user.getIdToken();
      return { user, token };
    },

    async firebaseLogout() {
      await _initFirebase();
      if (_firebaseReady) {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        await signOut(_auth).catch(()=>{});
      }
    },

    async firebaseResetPassword(email) {
      await _initFirebase();
      if (!_firebaseReady) throw new Error('Firebase no disponible');
      const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      await sendPasswordResetEmail(_auth, email);
    },

    getFirebaseAuth() { return _auth; },
    isFirebaseReady() { return _firebaseReady; },
  };
})();

