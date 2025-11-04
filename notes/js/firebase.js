export const firebaseConfig = {
    apiKey: "AIzaSyDu3L4WmMTBhSDCAw4060nKsv1961a8OIc",
    authDomain: "notes-9879e.firebaseapp.com",
    databaseURL: "https://notes-9879e-default-rtdb.firebaseio.com",
    projectId: "notes-9879e",
    storageBucket: "notes-9879e.firebasestorage.app",
    messagingSenderId: "764305636861",
    appId: "1:764305636861:web:0db4a28d821b7e7a3aad94"
};

export function initFirebase() {
    firebase.initializeApp(firebaseConfig);
    // allow modifying existing data
    const db = firebase.database();
    db.ref('notes').on('child_added', (snapshot) => {
       
    });
    return db;
}
