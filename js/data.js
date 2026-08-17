(function () {
    'use strict';
    (function blockDm6CSS() {
        if (document.getElementById('dm6-style')) return; 
        var s = document.createElement('style');
        s.id = 'dm6-style'; 
        s.textContent = '/* dm6-style blocked by data-modal v9 */';
        document.head.appendChild(s);
    })();

    var INNER_HTML =
        '<div class="modal-title" style="flex-shrink:0;">'
        +   '<i class="fas fa-database"></i><span>数据管理</span>'
        + '</div>'

        + '<div class="dm-body">'

        +   '<div class="dm-storage-card">'
        +     '<div class="dm-storage-header">'
        +       '<span class="dm-storage-title"><i class="fas fa-database" style="margin-right:5px;opacity:0.55"></i>存储用量</span>'
        +       '<span class="dm-storage-label" id="dm-storage-total">计算中…</span>'
        +     '</div>'
        +     '<div class="dm-stats-grid">'
        +       '<div class="dm-stat-block"><div class="dm-stat-block-icon" style="color:var(--accent-color)"><i class="fas fa-comments"></i></div><div class="dm-stat-pill-val" id="dm-stat-msgs">—</div><div class="dm-stat-pill-key">聊天记录</div></div>'
        +       '<div class="dm-stat-block"><div class="dm-stat-block-icon" style="color:#9C6FD4"><i class="fas fa-sliders"></i></div><div class="dm-stat-pill-val" id="dm-stat-settings">—</div><div class="dm-stat-pill-key">设置数据</div></div>'
        +       '<div class="dm-stat-block"><div class="dm-stat-block-icon" style="color:#3BC8A4"><i class="fas fa-images"></i></div><div class="dm-stat-pill-val" id="dm-stat-media">—</div><div class="dm-stat-pill-key">图片媒体</div></div>'
        +     '</div>'
        +     '<div class="dm-progress-track"><div class="dm-progress-fill" id="dm-storage-bar" style="width:0%"></div></div>'
        +   '</div>'

        +   '<div class="dm-section-label"><i class="fas fa-cloud-upload-alt"></i> 备份与恢复</div>'
        +   '<div class="dm-grid">'
        +     '<div class="dm-tile" id="dm-tile-full-backup">'
        +       '<div class="dm-tile-icon blue"><i class="fas fa-layer-group"></i></div>'
        +       '<div class="dm-tile-info"><div class="dm-tile-title">全量备份</div><div class="dm-tile-desc">所有设置与数据</div></div>'
        +       '<i class="fas fa-chevron-right dm-tile-arrow"></i>'
        +     '</div>'
        +     '<div class="dm-tile" id="dm-tile-chat-backup">'
        +       '<div class="dm-tile-icon teal"><i class="fas fa-comments"></i></div>'
        +       '<div class="dm-tile-info"><div class="dm-tile-title">聊天记录</div><div class="dm-tile-desc">消息内容单独备份</div></div>'
        +       '<i class="fas fa-chevron-right dm-tile-arrow"></i>'
        +     '</div>'
        +   '</div>'

        +   '<div style="display:none">'
        +     '<button id="export-all-settings"></button>'
        +     '<button id="import-all-settings"></button>'
        +     '<button id="export-chat-btn"></button>'
        +     '<button id="import-chat-btn"></button>'
        +   '</div>'

        +   '<div class="dm-section-label"><i class="fas fa-info-circle"></i> 关于</div>'
        +   '<div class="dm-row-card">'
        +     '<div class="dm-row-item" id="replay-tutorial-btn-row" style="cursor:pointer">'
        +       '<div class="dm-row-icon slate"><i class="fas fa-compass"></i></div>'
        +       '<div class="dm-row-info"><div class="dm-row-title">重放新手引导</div><div class="dm-row-desc">重新播放功能介绍教程</div></div>'
        +       '<button class="dm-nav-btn" id="replay-tutorial-btn"><i class="fas fa-play"></i></button>'
        +     '</div>'
        +     '<div class="dm-row-item" id="open-credits-row" style="cursor:pointer">'
        +       '<div class="dm-row-icon violet"><i class="fas fa-scroll"></i></div>'
        +       '<div class="dm-row-info"><div class="dm-row-title">声明与致谢</div><div class="dm-row-desc">开源声明、致谢名单</div></div>'
        +       '<button class="dm-nav-btn" id="open-credits-btn"><i class="fas fa-chevron-right"></i></button>'
        +     '</div>'
        +   '</div>'

        +   '<div class="dm-section-label danger-label"><i class="fas fa-triangle-exclamation"></i> 危险操作</div>'
        +   '<div class="dm-danger-cards dm-danger-cards-row">'
        +     '<button class="dm-danger-card dm-danger-card-orange dm-danger-card-half" id="clear-chat-only">'
        +       '<div class="dm-danger-card-icon"><i class="fas fa-eraser"></i></div>'
        +       '<div class="dm-danger-card-body">'
        +         '<div class="dm-danger-card-title">清除会话</div>'
        +         '<div class="dm-danger-card-desc">删除本会话消息</div>'
        +       '</div>'
        +     '</button>'
        +     '<button class="dm-danger-card dm-danger-card-red dm-danger-card-half" id="clear-storage">'
        +       '<div class="dm-danger-card-icon"><i class="fas fa-skull-crossbones"></i></div>'
        +       '<div class="dm-danger-card-body">'
        +         '<div class="dm-danger-card-title">重置数据</div>'
        +         '<div class="dm-danger-card-desc">清空所有，不可撤销</div>'
        +       '</div>'
        +     '</button>'
        +   '</div>'

        + '</div>'
        + '<div class="modal-buttons" style="display:flex;justify-content:space-between;padding:12px 20px;border-top:1px solid var(--border-color);background:var(--secondary-bg);flex-shrink:0;">'
        +   '<button class="modal-btn modal-btn-secondary" id="back-data"><i class="fas fa-arrow-left"></i> 返回</button>'
        +   '<button class="modal-btn modal-btn-secondary" id="close-data">关闭</button>'
        + '</div>';

    var DRAWER_FULL_HTML =
        '<div class="dm-action-drawer" id="dm-drawer-full">'
        +   '<div class="dm-drawer-backdrop" id="dm-drawer-full-backdrop"></div>'
        +   '<div class="dm-drawer-sheet">'
        +     '<div class="dm-drawer-handle"></div>'
        +     '<div class="dm-drawer-title">'
        +       '<div class="dm-drawer-title-icon blue" style="background:linear-gradient(135deg,#4A90E2,#3576C8);color:#fff"><i class="fas fa-layer-group"></i></div>'
        +       '<div><div class="dm-drawer-title-text">全量备份</div><div class="dm-drawer-subtitle">包含所有设置、外观、字卡等数据</div></div>'
        +     '</div>'
        +     '<div class="dm-drawer-actions">'
        +       '<button class="dm-drawer-action-btn primary" id="export-all-settings-real">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-download"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">导出备份</div><div class="dm-drawer-btn-desc">将数据保存为文件</div></div>'
        +       '</button>'
        +       '<button class="dm-drawer-action-btn" id="import-all-settings-real">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-upload"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">从文件恢复</div><div class="dm-drawer-btn-desc">选择之前导出的备份文件</div></div>'
        +       '</button>'
        +     '</div>'
        +     '<div id="dm-drawer-full-notice"></div>'
        +     '<button class="dm-drawer-cancel" id="dm-drawer-full-cancel">取消</button>'
        +   '</div>'
        + '</div>';

    var DRAWER_CHAT_HTML =
        '<div class="dm-action-drawer" id="dm-drawer-chat">'
        +   '<div class="dm-drawer-backdrop" id="dm-drawer-chat-backdrop"></div>'
        +   '<div class="dm-drawer-sheet">'
        +     '<div class="dm-drawer-handle"></div>'
        +     '<div class="dm-drawer-title">'
        +       '<div class="dm-drawer-title-icon" style="background:linear-gradient(135deg,#3BC8A4,#20A882);color:#fff"><i class="fas fa-comments"></i></div>'
        +       '<div><div class="dm-drawer-title-text">聊天记录</div><div class="dm-drawer-subtitle">仅包含消息内容</div></div>'
        +     '</div>'
        +     '<div class="dm-drawer-actions">'
        +       '<button class="dm-drawer-action-btn primary" id="export-chat-btn-real" style="background:linear-gradient(135deg,#3BC8A4,#20A882);border-color:#3BC8A4">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-download"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">导出聊天</div><div class="dm-drawer-btn-desc">将消息记录保存为文件</div></div>'
        +       '</button>'
        +       '<button class="dm-drawer-action-btn" id="import-chat-btn-real">'
        +         '<div class="dm-drawer-btn-icon"><i class="fas fa-upload"></i></div>'
        +         '<div class="dm-drawer-btn-text"><div class="dm-drawer-btn-title">导入聊天</div><div class="dm-drawer-btn-desc">从文件恢复历史消息</div></div>'
        +       '</button>'
        +     '</div>'
        +     '<button class="dm-drawer-cancel" id="dm-drawer-chat-cancel">取消</button>'
        +   '</div>'
        + '</div>'

    function isCorrect(mc) {
        return mc.querySelector('.modal-title') !== null
            && mc.querySelector('.dm-storage-card') !== null
            && mc.querySelector('.dm6') === null
            && mc.querySelector('.dm6-tabs') === null;
    }

    function ensureDrawersOnBody() {
        var DRAWER_IDS = ['dm-drawer-full', 'dm-drawer-chat'];
        DRAWER_IDS.forEach(function(id) {
            var existing = document.getElementById(id);
            if (existing && existing.parentElement === document.body) return;
            if (existing) {
                document.body.appendChild(existing);
                return;
            }
            var dummy = document.createElement('div');
            if (id === 'dm-drawer-full') dummy.innerHTML = DRAWER_FULL_HTML;
            else dummy.innerHTML = DRAWER_CHAT_HTML;
            document.body.appendChild(dummy.firstElementChild);
        });
    }

    function writeHTML(mc) {
        mc.innerHTML = INNER_HTML;
        mc.dataset.dm6Built = 'v11'; 
        ensureDrawersOnBody();
        bindAll(mc);
    }

    function ensureHTML(mc) {
        if (!mc) return;
        if (mc.dataset.dm6Built !== 'v11' || !isCorrect(mc)) writeHTML(mc);
        else ensureDrawersOnBody(); 
    }

    function fmt(b) {
        if (b < 1024) return Math.round(b) + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(2) + ' MB';
    }

    function applyStats(total, msgs, cfg, media) {
        var g = function (id) { return document.getElementById(id); };

        // 直接显示手动累加的分类
        if (g('dm-stat-msgs'))     g('dm-stat-msgs').textContent     = fmt(msgs);
        if (g('dm-stat-settings')) g('dm-stat-settings').textContent = fmt(cfg);
        if (g('dm-stat-media'))    g('dm-stat-media').textContent    = fmt(media);

        // 顶部总用量 = total（手动累加），进度条 = total / quota
        var totalEl = g('dm-storage-total');
        var barEl   = g('dm-storage-bar');

        if (navigator.storage && navigator.storage.estimate) {
            navigator.storage.estimate().then(function(est) {
                var quota = est.quota || 0;
                var pct = quota > 0 ? Math.min(100, total / quota * 100) : 0;
                var pctStr = pct.toFixed(1);
                var quotaStr = quota >= 1073741824 ? (quota/1073741824).toFixed(2)+' GB'
                             : quota >= 1048576    ? (quota/1048576).toFixed(1)+' MB'
                             : quota > 0           ? (quota/1024).toFixed(1)+' KB' : '未知';
                if (totalEl) totalEl.textContent = fmt(total) + ' / ' + quotaStr + ' (' + pctStr + '%)';
                if (barEl) {
                    barEl.style.width = pctStr + '%';
                    barEl.style.background = pct > 80
                        ? 'linear-gradient(90deg,#FF3B30,#CC0000)'
                        : pct > 50
                        ? 'linear-gradient(90deg,#FF9F0A,#E07000)'
                        : 'linear-gradient(90deg,var(--accent-color),rgba(var(--accent-color-rgb),0.6))';
                }
            }).catch(function() {
                if (totalEl) totalEl.textContent = fmt(total);
                if (barEl) barEl.style.width = '0%';
            });
        } else {
            if (totalEl) totalEl.textContent = fmt(total);
            if (barEl) barEl.style.width = '0%';
        }
    }

    function updateStats() {
        var total = 0, msgs = 0, cfg = 0, media = 0;
        var processLS = function () {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i) || '';
                var v = localStorage.getItem(k) || '';
                var bytes = (k.length + v.length) * 2;
                total += bytes;
                if (/messages|msgs|session/i.test(k)) msgs += bytes;
                else if (v.startsWith('data:image') || v.startsWith('data:video')) media += bytes;
                else cfg += bytes;
            }
            applyStats(total, msgs, cfg, media);
        };
        try {
            if (window.localforage) {
                localforage.keys().then(function (keys) {
                    var promises = keys.map(function (k) {
                        // favAudio_ 是音频 Base64 或 oss:// 引用，直接估算大小，不读内容避免内存爆炸
                        // 阶段四：键名格式变为 CHAT_APP_V3_<SID>_favAudio_<msgId>，兼容旧格式
                        if (k.startsWith('favAudio_') || k.includes('_favAudio_')) {
                            return localforage.getItem(k).then(function(raw) {
                                var bytes = typeof raw === 'string' ? raw.length * 2 : 0;
                                return { k: k, b: bytes };
                            }).catch(function() { return { k: k, b: 0 }; });
                        }
                        return localforage.getItem(k).then(function (raw) {
                            if (raw == null) return { k: k, b: 0 };
                            var str = typeof raw === 'string' ? raw : JSON.stringify(raw);
                            return { k: k, b: (k.length + str.length) * 2 };
                        });
                    });
                    Promise.all(promises).then(function (results) {
                        results.forEach(function (r) {
                            total += r.b;
                            if (/messages|msgs|session/i.test(r.k)) msgs += r.b;
                            else if (/avatar|image|photo|bg|background|wallpaper/i.test(r.k)) media += r.b;
                            else cfg += r.b;
                        });
                        applyStats(total, msgs, cfg, media);
                    }).catch(processLS);
                }).catch(processLS);
            } else { processLS(); }
        } catch (e) { processLS(); }
    }

    function syncToggles() {
        var n = document.getElementById('notif-permission-toggle');
        if (n) n.checked = localStorage.getItem('notifEnabled') === '1'
                        && 'Notification' in window
                        && Notification.permission === 'granted';
    }

    function openDrawer(drawerId) {
        var drawer = document.getElementById(drawerId);
        if (!drawer) return;
        drawer.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    function closeDrawer(drawerId) {
        var drawer = document.getElementById(drawerId);
        if (!drawer) return;
        drawer.classList.remove('open');
        document.body.style.overflow = '';
    }

    function bindAll(mc) {
        var closeBtn = mc.querySelector('#close-data');
        if (closeBtn) closeBtn.addEventListener('click', function () {
            var modal = document.getElementById('data-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        });

        var backBtn = mc.querySelector('#back-data');
        if (backBtn) backBtn.addEventListener('click', function () {
            var dataModal = document.getElementById('data-modal');
            if (dataModal && typeof hideModal === 'function') hideModal(dataModal);
            var settingsModal = document.getElementById('settings-modal');
            if (settingsModal && typeof showModal === 'function') showModal(settingsModal);
        });

        var tileFullBackup = mc.querySelector('#dm-tile-full-backup');
        if (tileFullBackup) tileFullBackup.addEventListener('click', function () {
            openDrawer('dm-drawer-full');
            var notice = document.getElementById('dm-drawer-full-notice');
            if (notice) {
                var isCloudConnected = window.CloudSync && typeof window.CloudSync.isConnected === 'function' && window.CloudSync.isConnected();
                if (isCloudConnected) {
                    notice.innerHTML = '<div style="margin:12px 0 4px;padding:10px 12px;background:rgba(197,164,126,0.12);border:1px solid rgba(197,164,126,0.35);border-radius:10px;font-size:12px;color:var(--text-secondary);line-height:1.6;">'
                        + '<i class="fas fa-circle-info" style="color:var(--accent-color);margin-right:5px;"></i>'
                        + '已启用云端存储：全量备份<b>不包含</b>背景图、表情包、聊天图片、收藏语音等媒体文件，这些文件仅存储在云端。文字类数据（聊天记录、字卡回复库、陪伴日记、心情手账、纪念日/倒计时、主题配色）可通过「聊天记录 → 选择导出」单独备份。'
                        + '</div>';
                } else {
                    notice.innerHTML = '';
                }
            }
        });

        var tileChatBackup = mc.querySelector('#dm-tile-chat-backup');
        if (tileChatBackup) tileChatBackup.addEventListener('click', function () { openDrawer('dm-drawer-chat'); });

        var fullDrawer = document.getElementById('dm-drawer-full');
        if (fullDrawer) {
            var backdrop1 = fullDrawer.querySelector('#dm-drawer-full-backdrop');
            if (backdrop1) backdrop1.addEventListener('click', function () { closeDrawer('dm-drawer-full'); });
            var cancelBtn1 = fullDrawer.querySelector('#dm-drawer-full-cancel');
            if (cancelBtn1) cancelBtn1.addEventListener('click', function () { closeDrawer('dm-drawer-full'); });
            var exportAllReal = fullDrawer.querySelector('#export-all-settings-real');
            if (exportAllReal) exportAllReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-full');
                if (typeof exportAllData === 'function') exportAllData();
            });
            var importAllReal = fullDrawer.querySelector('#import-all-settings-real');
            if (importAllReal) importAllReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-full');
                var inp = document.createElement('input');
                inp.type = 'file'; inp.accept = '.json,.zip,application/json,application/zip';
                inp.onchange = function (e) {
                    var f = e.target.files && e.target.files[0];
                    if (f && typeof importAllData === 'function') importAllData(f);
                };
                inp.click();
            });
        }

        var chatDrawer = document.getElementById('dm-drawer-chat');
        if (chatDrawer) {
            var backdrop2 = chatDrawer.querySelector('#dm-drawer-chat-backdrop');
            if (backdrop2) backdrop2.addEventListener('click', function () { closeDrawer('dm-drawer-chat'); });
            var cancelBtn2 = chatDrawer.querySelector('#dm-drawer-chat-cancel');
            if (cancelBtn2) cancelBtn2.addEventListener('click', function () { closeDrawer('dm-drawer-chat'); });
            var exportChatReal = chatDrawer.querySelector('#export-chat-btn-real');
            if (exportChatReal) exportChatReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-chat');
                if (typeof exportChatHistory === 'function') exportChatHistory();
            });
            var importChatReal = chatDrawer.querySelector('#import-chat-btn-real');
            if (importChatReal) importChatReal.addEventListener('click', function () {
                closeDrawer('dm-drawer-chat');
                var inp = document.createElement('input');
                inp.type = 'file'; inp.accept = '.json';
                inp.onchange = function (e) {
                    var f = e.target.files && e.target.files[0];
                    if (f && typeof importChatHistory === 'function') importChatHistory(f);
                };
                inp.click();
            });
        }

        var clearChatBtn = mc.querySelector('#clear-chat-only');
        if (clearChatBtn) clearChatBtn.addEventListener('click', function () {
            if (!confirm('确定要清除当前会话的所有消息吗？\n\n所有设置、头像、字卡等数据将保留，仅聊天记录会被删除。\n\n此操作无法恢复！')) return;
            // 修复：直接赋值 let messages（window.messages 赋值不影响 let 绑定）
            messages = [];
            displayedMessageCount = typeof HISTORY_BATCH_SIZE !== 'undefined' ? HISTORY_BATCH_SIZE : 20;
            try { localStorage.removeItem('BACKUP_V1_critical'); } catch(e) {}
            try { localStorage.removeItem('BACKUP_V1_timestamp'); } catch(e) {}
            if (window.localforage && typeof getStorageKey === 'function') {
                localforage.setItem(getStorageKey('chatMessages'), []).catch(function() {});
            }
            if (typeof renderMessages === 'function') renderMessages();
            if (typeof showNotification === 'function') showNotification('聊天记录已清除', 'success');
        });

        var clearBtn = mc.querySelector('#clear-storage');
        if (clearBtn) clearBtn.addEventListener('click', function () {
            if (!confirm('⚠️ 确定要清空全部数据吗？\n\n所有消息、设置、字卡、头像等将被永久删除，不可恢复！')) return;
            if (!confirm('最后确认：清空后页面将自动刷新，无法撤销，继续吗？')) return;
            window._skipBackup = true;
            var doReset = function () {
                localStorage.clear();
                if (typeof showNotification === 'function') showNotification('所有数据已清空，即将刷新…', 'info', 2000);
                setTimeout(function () { window.location.href = window.location.pathname + '?reset=' + Date.now(); }, 2000);
            };
            window.localforage ? localforage.clear().then(doReset).catch(doReset) : doReset();
        });

        var exportAll = mc.querySelector('#export-all-settings');
        if (exportAll) exportAll.addEventListener('click', function () {
            if (typeof exportAllData === 'function') exportAllData();
        });

        var importAll = mc.querySelector('#import-all-settings');
        if (importAll) importAll.addEventListener('click', function () {
            var inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json,.zip,application/json,application/zip';
            inp.onchange = function (e) {
                var f = e.target.files && e.target.files[0];
                if (f && typeof importAllData === 'function') importAllData(f);
            };
            inp.click();
        });

        var exportChat = mc.querySelector('#export-chat-btn');
        if (exportChat) exportChat.addEventListener('click', function () {
            if (typeof exportChatHistory === 'function') exportChatHistory();
        });

        var importChat = mc.querySelector('#import-chat-btn');
        if (importChat) importChat.addEventListener('click', function () {
            var inp = document.createElement('input');
            inp.type = 'file'; inp.accept = '.json';
            inp.onchange = function (e) {
                var f = e.target.files && e.target.files[0];
                if (f && typeof importChatHistory === 'function') importChatHistory(f);
            };
            inp.click();
        });

        var creditsBtn = mc.querySelector('#open-credits-btn');
        if (creditsBtn) creditsBtn.addEventListener('click', function () {
            var dataModal = document.getElementById('data-modal');
            if (dataModal && typeof hideModal === 'function') hideModal(dataModal);
            var disc = document.getElementById('disclaimer-modal');
            if (disc && typeof showModal === 'function') showModal(disc);
        });

        var tutorialBtn = mc.querySelector('#replay-tutorial-btn');
        if (tutorialBtn) tutorialBtn.addEventListener('click', function () {
            var dataModal = document.getElementById('data-modal');
            if (dataModal && typeof hideModal === 'function') hideModal(dataModal);
            if (typeof startTour === 'function') {
                if (window.localforage && window.APP_PREFIX) {
                    localforage.removeItem(APP_PREFIX + 'tour_seen').then(startTour).catch(startTour);
                } else { startTour(); }
            }
        });
    }

    function onModalOpen(modal) {
        var mc = modal.querySelector('.modal-content');
        if (!mc) return;
        ensureHTML(mc);
        requestAnimationFrame(function () {
            mc.style.opacity = '1';
            mc.style.transform = 'none';
        });
        setTimeout(function () {
            updateStats();
            syncToggles();
        }, 60);
    }

    var _styleObserver = null;
    var _contentObserver = null;

    function init() {
        var modal = document.getElementById('data-modal');
        if (!modal) return;

        var mc = modal.querySelector('.modal-content');
        if (mc) mc.dataset.dm6Built = 'v9';

        if (_styleObserver) { _styleObserver.disconnect(); _styleObserver = null; }
        if (_contentObserver) { _contentObserver.disconnect(); _contentObserver = null; }

        _styleObserver = new MutationObserver(function () {
            var d = modal.style.display;
            if (d === 'flex' || d === 'block') onModalOpen(modal);
        });
        _styleObserver.observe(modal, { attributes: true, attributeFilter: ['style'] });

        if (mc) {
            _contentObserver = new MutationObserver(function () {
                var mc2 = modal.querySelector('.modal-content');
                if (mc2 && !isCorrect(mc2)) {
                    mc2.dataset.dm6Built = 'v9';
                    writeHTML(mc2);
                }
            });
            _contentObserver.observe(mc, { childList: true, subtree: false });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 0); });
    } else {
        init();
    }

    window.updateStats = updateStats;

})();

function updateStorageUsageBar() {
    if (typeof window.updateStats === 'function') window.updateStats();
}

(function() {
    var orig = window.showModal;
    if (typeof orig === 'function') {
        window.showModal = function(el) {
            orig.apply(this, arguments);
            if (el && el.id === 'data-modal') {
                setTimeout(updateStorageUsageBar, 250);
            }
        };
    }
})();

document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('data-settings');
    if (btn) {
        btn.addEventListener('click', function() { setTimeout(updateStorageUsageBar, 350); });
    }
});

window._sendPartnerNotification = function(title, body) {
    try {
        if (localStorage.getItem('notifEnabled') !== '1') return;

        var iconUrl = (document.querySelector('#partner-avatar img') || {}).src || '';
        var notifTitle = title || '传讯';
        var notifBody = body || '对方发来了消息';
        var notifSent = false;

        // 检测是否在 WebView 环境中（APK 内）
        var isWebView = !!(window.chrome && window.chrome.webview) ||
            (typeof window.AndroidInterface !== 'undefined') ||
            (navigator.userAgent.indexOf('wv') !== -1) ||
            !('Notification' in window);

        // WebView 环境：尝试 Service Worker 通知 + 页内浮动弹窗双重保障
        if (isWebView) {
            // 尝试通过 Service Worker 发送系统通知（部分 WebView 支持）
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: notifTitle,
                    body: notifBody,
                    icon: iconUrl,
                    tag: 'partner-msg',
                    url: '/'
                });
                // 同时尝试直接 showNotification
                if (navigator.serviceWorker.ready) {
                    navigator.serviceWorker.ready.then(function(reg) {
                        reg.showNotification(notifTitle, {
                            body: notifBody,
                            icon: iconUrl,
                            badge: iconUrl,
                            tag: 'partner-msg',
                            renotify: true,
                            vibrate: [200, 100, 200],
                            requireInteraction: true,
                            silent: false,
                            data: { url: '/' }
                        }).catch(function() {});
                    });
                }
            }
            // 页内浮动弹窗（forceShow=true 即使在前台也显示，位于屏幕顶部）
            _fallbackAlert(notifTitle, notifBody, true);
            return;
        }

        // 非 WebView：仅在后台时发送系统通知
        if (!document.hidden) return;

        // 方案1：Service Worker 通知
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.postMessage({
                type: 'SHOW_NOTIFICATION',
                title: notifTitle,
                body: notifBody,
                icon: iconUrl,
                tag: 'partner-msg',
                url: '/'
            });
            notifSent = true;
            if (navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then(function(reg) {
                    var options = {
                        body: notifBody,
                        icon: iconUrl,
                        badge: iconUrl,
                        tag: 'partner-msg',
                        renotify: true,
                        vibrate: [200, 100, 200],
                        requireInteraction: true,
                        data: { url: '/' }
                    };
                    reg.showNotification(notifTitle, options).catch(function() {});
                });
            }
        } else if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready.then(function(reg) {
                var options = {
                    body: notifBody,
                    icon: iconUrl,
                    badge: iconUrl,
                    tag: 'partner-msg',
                    renotify: true,
                    vibrate: [200, 100, 200],
                    requireInteraction: true,
                    data: { url: '/' }
                };
                reg.showNotification(notifTitle, options).then(function() {
                    notifSent = true;
                }).catch(function() {
                    _tryPlainNotification(notifTitle, notifBody, iconUrl, function(ok) {
                        if (!ok) _fallbackAlert(notifTitle, notifBody);
                    });
                });
            }).catch(function() {
                _tryPlainNotification(notifTitle, notifBody, iconUrl, function(ok) {
                    if (!ok) _fallbackAlert(notifTitle, notifBody);
                });
            });
        } else if ('Notification' in window) {
            _tryPlainNotification(notifTitle, notifBody, iconUrl, function(ok) {
                if (!ok) _fallbackAlert(notifTitle, notifBody);
            });
        } else {
            _fallbackAlert(notifTitle, notifBody);
        }
    } catch(e) {
        _fallbackAlert(title || '传讯', body || '对方发来了消息');
    }
};

// 尝试普通 Notification
function _tryPlainNotification(title, body, iconUrl, cb) {
    try {
        if (Notification.permission !== 'granted') { cb(false); return; }
        var n = new Notification(title, {
            body: body,
            icon: iconUrl,
            tag: 'partner-msg',
            renotify: true,
            silent: false
        });
        n.onclick = function() {
            window.focus();
            n.close();
        };
        // 自动关闭
        setTimeout(function() { try { n.close(); } catch(e){} }, 10000);
        cb(true);
    } catch(e) {
        cb(false);
    }
}

// 兜底方案：页内浮动弹窗 + 声音 + 震动（适用于不支持通知的浏览器）
function _fallbackAlert(title, body, forceShow) {
    // 播放提示音
    try {
        if (typeof playSound === 'function') playSound('message');
    } catch(e) {}

    // 震动（移动端）
    try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    } catch(e) {}

    // 如果在前台且未强制显示，则跳过
    if (!forceShow && !document.hidden) return;

    // 获取屏幕顶部安全区域
    var safeTop = 0;
    try {
        safeTop = parseInt(getComputedStyle(document.body).getPropertyValue('env(safe-area-inset-top)')) || 0;
        if (isNaN(safeTop)) safeTop = 0;
    } catch(e) {}

    // 页内浮动通知弹窗（固定在屏幕顶部，模拟锁屏通知样式）
    var existing = document.getElementById('fallback-notif-popup');
    if (existing) existing.remove();

    var popup = document.createElement('div');
    popup.id = 'fallback-notif-popup';
    popup.style.cssText = 'position:fixed;top:' + safeTop + 'px;left:0;right:0;z-index:99999;' +
        'background:linear-gradient(135deg,var(--accent-color),rgba(var(--accent-color-rgb),0.9));' +
        'color:#fff;padding:16px 18px;display:flex;align-items:center;gap:12px;' +
        'box-shadow:0 4px 24px rgba(0,0,0,0.4);transform:translateY(-100%);' +
        'transition:transform 0.4s cubic-bezier(0.2,0.8,0.2,1);cursor:pointer;font-family:inherit;' +
        'min-height:60px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';

    var iconUrl = (document.querySelector('#partner-avatar img') || {}).src || '';
    var iconHtml = iconUrl
        ? '<img src="' + iconUrl + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.4);flex-shrink:0;">'
        : '<div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">&#128172;</div>';

    popup.innerHTML = iconHtml +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:2px;">' + _escNotif(title) + '</div>' +
        '<div style="font-size:13px;opacity:0.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escNotif(body) + '</div>' +
        '</div>' +
        '<div style="font-size:18px;opacity:0.7;flex-shrink:0;padding:4px;">✕</div>';

    popup.onclick = function() {
        _removeFallbackNotif();
        try { window.focus(); } catch(e) {}
    };

    document.body.appendChild(popup);

    // 动画滑入
    requestAnimationFrame(function() {
        setTimeout(function() {
            popup.style.transform = 'translateY(0)';
        }, 50);
    });

    // 保持显示更长时间（20秒），模拟锁屏通知
    setTimeout(function() {
        _removeFallbackNotif();
    }, 20000);
}

function _removeFallbackNotif() {
    var popup = document.getElementById('fallback-notif-popup');
    if (popup) {
        popup.style.transform = 'translateY(-100%)';
        setTimeout(function() {
            if (popup && popup.parentNode) popup.remove();
        }, 400);
    }
}

function _escNotif(s) {
    return String(s === undefined || s === null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 后台保活机制：使用静音音频循环 + 定时器，防止移动端浏览器杀后台
window._bgKeepAlive = {
    audioCtx: null,
    silentAudio: null,
    wakeLock: null,
    intervalId: null,
    started: false,

    start: function() {
        if (this.started) return;
        this.started = true;
        var self = this;

        // 1. 静音音频循环（防止浏览器暂停后台标签页）
        try {
            var AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
                // 创建一段静音的循环音频
                var buffer = this.audioCtx.createBuffer(1, 4410, 44100);
                var data = buffer.getChannelData(0);
                for (var i = 0; i < data.length; i++) data[i] = 0;
                this.silentAudio = this.audioCtx.createBufferSource();
                this.silentAudio.buffer = buffer;
                this.silentAudio.loop = true;
                this.silentAudio.connect(this.audioCtx.destination);
                this.silentAudio.start(0);
            }
        } catch(e) {}

        // 2. Wake Lock API（防止屏幕熄灭时暂停）
        try {
            if ('wakeLock' in navigator) {
                navigator.wakeLock.request('screen').then(function(lock) {
                    self.wakeLock = lock;
                }).catch(function() {});
            }
        } catch(e) {}

        // 3. 定时器心跳（保持 JS 引擎活跃）
        this.intervalId = setInterval(function() {
            // 空操作，仅保持引擎活跃
        }, 20000);
    },

    stop: function() {
        try { if (this.silentAudio) this.silentAudio.stop(); } catch(e) {}
        try { if (this.audioCtx) this.audioCtx.close(); } catch(e) {}
        try { if (this.wakeLock) this.wakeLock.release(); } catch(e) {}
        if (this.intervalId) clearInterval(this.intervalId);
        this.started = false;
    }
};

window.handleNotifToggle = function(checkbox) {
    var statusEl = document.getElementById('notif-status-text');
    var hasNotification = 'Notification' in window;
    var hasSW = 'serviceWorker' in navigator;

    // 检测 WebView 环境
    var isWebView = !!(window.chrome && window.chrome.webview) ||
        (typeof window.AndroidInterface !== 'undefined') ||
        (navigator.userAgent.indexOf('wv') !== -1) ||
        !hasNotification;

    if (isWebView) {
        // WebView 环境：直接启用页内弹窗提醒
        if (checkbox.checked) {
            localStorage.setItem('notifEnabled', '1');
            if (window._bgKeepAlive) window._bgKeepAlive.start();
            if (statusEl) statusEl.textContent = '✅ 已开启 — 收到消息时会弹出提醒（请保持应用在后台运行）';
            if (typeof showNotification === 'function') showNotification('✓ 后台提醒已开启', 'success', 3000);
            // 测试弹窗
            _fallbackAlert('传讯提醒已开启 ✨', '你现在可以在后台收到消息提醒了');
        } else {
            localStorage.setItem('notifEnabled', '0');
            if (window._bgKeepAlive) window._bgKeepAlive.stop();
            if (statusEl) statusEl.textContent = '已关闭 — 后台将不再弹出消息提醒';
        }
        return;
    }

    if (!hasNotification && !hasSW) {
        checkbox.checked = false;
        if (statusEl) statusEl.textContent = '⚠️ 您的浏览器不支持系统通知，将使用页内弹窗提醒';
        localStorage.setItem('notifEnabled', '1');
        checkbox.checked = true;
        if (window._bgKeepAlive) window._bgKeepAlive.start();
        if (typeof showNotification === 'function') showNotification('已开启页内消息提醒', 'info', 4000);
        return;
    }

    if (checkbox.checked) {
        var permPromise;
        if (hasNotification) {
            permPromise = Notification.requestPermission();
        } else {
            permPromise = Promise.resolve('granted');
        }

        permPromise.then(function(perm) {
            if (perm === 'granted' || !hasNotification) {
                if (statusEl) {
                    var msg = hasSW
                        ? '✅ 已开启 — 后台收到消息会弹出系统通知（类似微信弹窗）'
                        : '✅ 已开启 — 后台收到消息会弹出通知提醒';
                    statusEl.textContent = msg;
                }
                localStorage.setItem('notifEnabled', '1');
                if (window._bgKeepAlive) window._bgKeepAlive.start();
                if (hasNotification) {
                    try {
                        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                            navigator.serviceWorker.ready.then(function(reg) {
                                reg.showNotification('传讯通知已开启 ✨', {
                                    body: '你现在可以在后台收到消息提醒了',
                                    tag: 'notif-test'
                                }).catch(function() {
                                    new Notification('传讯通知已开启 ✨', { body: '你现在可以在后台收到消息提醒了', tag: 'notif-test' });
                                });
                            });
                        } else {
                            new Notification('传讯通知已开启 ✨', { body: '你现在可以在后台收到消息提醒了', tag: 'notif-test' });
                        }
                    } catch(e) {}
                }
            } else if (perm === 'denied') {
                checkbox.checked = false;
                if (statusEl) statusEl.textContent = '❌ 通知权限被拒绝。请在浏览器设置中允许通知';
                localStorage.setItem('notifEnabled', '0');
            } else {
                checkbox.checked = false;
                if (statusEl) statusEl.textContent = '⚠️ 未做出选择，请重试';
                localStorage.setItem('notifEnabled', '0');
            }
        }).catch(function() {
            checkbox.checked = false;
            if (statusEl) statusEl.textContent = '❌ 请求权限失败';
            localStorage.setItem('notifEnabled', '0');
        });
    } else {
        if (statusEl) statusEl.textContent = '已关闭 — 后台将不再弹出消息提醒';
        localStorage.setItem('notifEnabled', '0');
        if (window._bgKeepAlive) window._bgKeepAlive.stop();
    }
};

document.addEventListener('DOMContentLoaded', function() {
    var toggle   = document.getElementById('notif-permission-toggle');
    var statusEl = document.getElementById('notif-status-text');
    if (!toggle) return;
    var enabled = localStorage.getItem('notifEnabled') === '1';
    var hasNotification = 'Notification' in window;
    var hasSW = 'serviceWorker' in navigator;
    var isWebView = !!(window.chrome && window.chrome.webview) ||
        (typeof window.AndroidInterface !== 'undefined') ||
        (navigator.userAgent.indexOf('wv') !== -1) ||
        !hasNotification;
    var granted = hasNotification && Notification.permission === 'granted';
    toggle.checked = enabled && (isWebView || granted || !hasNotification);
    if (!statusEl) return;
    if (toggle.checked) {
        if (isWebView) {
            statusEl.textContent = '✅ 已开启 — 收到消息时会弹出提醒（请保持应用在后台运行）';
            if (enabled && window._bgKeepAlive) window._bgKeepAlive.start();
        } else if (hasSW && granted) {
            statusEl.textContent = '✅ 已开启 — 后台收到消息会弹出系统通知';
            if (enabled && window._bgKeepAlive) window._bgKeepAlive.start();
        } else if (hasNotification && Notification.permission === 'denied') {
            statusEl.textContent = '❌ 通知权限被拒绝，请在浏览器设置中允许';
            toggle.checked = false;
        } else {
            statusEl.textContent = '关闭状态 — 开启后可在后台接收消息提醒';
        }
    } else {
        statusEl.textContent = '关闭状态 — 开启后可在后台接收消息提醒';
    }
});
