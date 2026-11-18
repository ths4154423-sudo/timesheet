// Service Worker לאתר "גיליון שעות".
// אסטרטגיה: "רשת קודם, מטמון כגיבוי" (Network First) - כשיש אינטרנט, תמיד מביא את הגרסה
// הכי עדכנית מהשרת (כדי שלא תיתקעו שוב עם גרסה ישנה בלי לדעת למה). רק כשאין בכלל אינטרנט,
// חוזר לגרסה השמורה מהפעם האחרונה שהאתר נטען בהצלחה.

const CACHE_VERSION = 'v4'; // כל פעם שרוצים "לאלץ" ניקוי מטמון ישן, פשוט מעלים את המספר
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

// ---------- התראות דחיפה (Firebase Cloud Messaging) ----------
// ההודעה מגיעה גם כשהאתר סגור. אם האתר פתוח וגלוי, הוא כבר מציג התראה בעצמו – אז לא מציגים פעמיים.
self.addEventListener('push', (event) => {
  let d = {};
  try{ const j = event.data ? event.data.json() : {}; d = j.data || (j.notification ? { title: j.notification.title, body: j.notification.body } : j) || {}; }catch(e){ d = { title: 'דירתא', body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if(wins.some(w => w.visibilityState === 'visible') && d.tag !== 'call') return;
    await self.registration.showNotification(d.title || 'דירתא', {
      body: d.body || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || 'dirata', renotify: true,
      requireInteraction: d.tag === 'call', data: { link: d.link || './' }, dir: 'rtl', lang: 'he'
    });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || './';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const w = wins.find(x => x.url.includes(self.registration.scope)) || wins[0];
    if(w){ await w.focus(); try{ w.postMessage({ type: 'open-link', link }); }catch(e){} return; }
    await self.clients.openWindow(link);
  })());
});
