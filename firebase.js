// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD02egBPI7FnsliANDKa8noTkVmGMW0POg",
  authDomain: "nrd-db.firebaseapp.com",
  databaseURL: "https://nrd-db-default-rtdb.firebaseio.com",
  projectId: "nrd-db",
  storageBucket: "nrd-db.firebasestorage.app",
  messagingSenderId: "544444461682",
  appId: "1:544444461682:web:110c97ffffc984ddd208eb"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase services
const auth = firebase.auth();
const database = firebase.database();

