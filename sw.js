// Service Worker לאתר "גיליון שעות".
// אסטרטגיה: "רשת קודם, מטמון כגיבוי" (Network First) - כשיש אינטרנט, תמיד מביא את הגרסה
// הכי עדכנית מהשרת (כדי שלא תיתקעו שוב עם גרסה ישנה בלי לדעת למה). רק כשאין בכלל אינטרנט,
// חוזר לגרסה השמורה מהפעם האחרונה שהאתר נטען בהצלחה.

const CACHE_VERSION = 'v3'; // כל פעם שרוצים "לאלץ" ניקוי מטמון ישן, פשוט מעלים את המספר
const CACHE_NAME = 'timesheet-cache-' + CACHE_VERSION;

// קבצי הליבה שחייבים להיות זמינים גם בלי אינטרנט. אם קובץ מסוים לא קיים (שם שונה וכו'),
// זה לא ישבור את כל ההתקנה - כל קובץ מנוסה בנפרד.
const CORE_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'logo.jpg',
  'welcome.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await Promise.all(CORE_ASSETS.map(async (url) => {
        try{ await cache.add(url); }
        catch(e){ console.warn('SW: לא הצלחתי לשמור במטמון:', url, e); }
      }));
    })
  );
  self.skipWaiting(); // מפעיל את הגרסה החדשה של ה-SW מיד, בלי לחכות שכל הטאבים הישנים ייסגרו
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim(); // משתלט מיד על כל הטאבים הפתוחים, בלי צורך ברענון ידני
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return; // לא נוגעים בבקשות כתיבה (Firestore וכו')

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return; // לא נוגעים ב-CDN חיצוניים (Chart.js, xlsx, EmailJS וכו')

  event.respondWith(
    fetch(req)
      .then((response) => {
        // הצלחה מהרשת: משתמשים בתגובה, ומעדכנים את המטמון לפעם הבאה שלא יהיה אינטרנט
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return response;
      })
      .catch(() =>
        // אין אינטרנט: מנסים למצוא את הדף/קובץ הזה במטמון, ואם אין - חוזרים ל-index.html
        // (כדי שהאפליקציה עצמה תיפתח גם אם הבקשה הספציפית לא נשמרה)
        caches.match(req).then((cached) => cached || caches.match('index.html'))
      )
  );
});
