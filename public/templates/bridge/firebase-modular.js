// Modular Firebase v9 compatibility adapter for Tournament Admin Panel
export { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
export {
  getDatabase,
  ref,
  get,
  set,
  update,
  push,
  query,
  orderByChild,
  equalTo,
  onValue,
  off,
  remove,
  serverTimestamp,
  runTransaction,
  limitToLast
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
export {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
