// Service Worker - 传讯后台通知
// 在页面后台运行时，配合 Notification API 实现类似微信的消息弹窗

var CACHE_NAME = 'chuanxun-v3';
var CACHE_FILES = [
    '/source.html',
    '/css/styles.css',
    '/js/data.js',
    '/js/core.js',
    '/js/app.js',
    '/js/utils.js',
    '/js/listeners.js',
    '/js/features.js',
    '/js/games.js',
    '/js/onboarding.js',
    '/js/backup-engine.js',
    '/js/cloud-sync.js',
    '/js/cloud-sync-engine.js',
    '/js/features/truth.js',
    '/js/features/period.js',
    '/js/features/more-features.js',
    '/js/features/location-query.js',
    '/manifest.json'
];

// 备份下载：页面将 blob 数据暂存到 SW，再通过虚拟 HTTP URL 触发 DownloadManager 下载
var pendingBackup = null;

// 安装：缓存核心文件
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(CACHE_FILES).catch(function() {});
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// 激活：清理旧缓存
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(names.map(function(name) {
                if (name !== CACHE_NAME) return caches.delete(name);
            }));
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// 网络请求：优先网络，回退缓存
self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;
    var url = new URL(event.request.url);
    if (url.pathname === '/_download_backup') {
        if (pendingBackup) {
            var fileName = pendingBackup.fileName;
            var mime = pendingBackup.mime;
            var blob = pendingBackup.blob;
            pendingBackup = null; // Clear after use
            var resp = new Response(blob, {
                headers: {
                    'Content-Type': mime,
                    'Content-Disposition': 'attachment; filename="' + fileName + '"'
                }
            });
            event.respondWith(resp);
            return;
        }
    }
    event.respondWith(
        fetch(event.request).catch(function() {
            return caches.match(event.request);
        })
    );
});

// 通知点击：聚焦/打开应用
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.visibilityState === 'visible') return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow('/');
        })
    );
});

// 接收页面消息：在后台时由页面请求 SW 发送通知
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'STORE_BACKUP') {
        pendingBackup = {
            blob: event.data.blob,
            fileName: event.data.fileName || 'backup.zip',
            mime: event.data.mime || 'application/zip'
        };
        if (event.source) {
            event.source.postMessage({ type: 'BACKUP_STORED' });
        }
        return; // Don't fall through to SHOW_NOTIFICATION
    }
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        var d = event.data;
        event.waitUntil(
            self.registration.showNotification(d.title || '传讯', {
                body: d.body || '对方发来了消息',
                icon: d.icon || '',
                badge: d.icon || '',
                tag: d.tag || 'partner-msg',
                renotify: true,
                vibrate: [200, 100, 200],
                requireInteraction: true,
                silent: false,
                data: { url: d.url || '/' }
            })
        );
    }
});

// 推送通知（如果配置了推送服务器）
self.addEventListener('push', function(event) {
    var data = { title: '传讯', body: '对方发来了消息' };
    try {
        if (event.data) data = event.data.json();
    } catch(e) {}

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            tag: 'partner-msg',
            renotify: true,
            vibrate: [200, 100, 200]
        })
    );
});
