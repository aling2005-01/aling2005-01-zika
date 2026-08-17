/**
 * location-query.js — 位置查询模块
 * 入口：更多功能 → 位置查询
 * 功能：
 *   1. 两个板块：我身旁 / 梦角世界，可点击切换查看
 *   2. 雷达式可视化，扫描动画后显示梦角位置
 *   3. 梦角世界：可编辑多个位置（添加/命名/删除/拖拽移动）
 *   4. 梦角在设置标点周围随机刷新，重合显示"在xx位置"，附近显示"在xx附近"
 * 存储：localforage，key = <session前缀>_locationData
 */
(function () {
    'use strict';

    // ── 状态 ──────────────────────────────────────────
    var _data = {
        locations: []  // [{ id, name, x, y }]  x,y 为 0~1 归一化坐标
    };
    var _loaded = false;
    var _storageKey = null;
    var _currentModule = 'beside'; // 'beside' | 'dream'
    var _querying = false;
    var _radarAnimTimer = null;
    var _dragState = null;
    var _lastQueryTime = 0;           // 上次查询时间戳
    var _cooldownTimer = null;         // 冷却倒计时定时器
    var COOLDOWN_MS = 3 * 60 * 1000;  // 3分钟冷却

    // ── 存储 ──────────────────────────────────────────
    async function _getKey() {
        if (_storageKey) return _storageKey;
        try {
            var allKeys = await localforage.keys();
            var found = allKeys.find(function (k) { return k.indexOf('_locationData') !== -1; });
            if (found) { _storageKey = found; return found; }
            var msgKey = allKeys.find(function (k) { return k.indexOf('_messages') !== -1; });
            var prefix = msgKey ? msgKey.replace('_messages', '') : 'CHAT_APP_V3_';
            _storageKey = prefix + '_locationData';
        } catch (e) {
            _storageKey = 'CHAT_APP_V3__locationData';
        }
        return _storageKey;
    }

    async function _load() {
        try {
            var key = await _getKey();
            var saved = await localforage.getItem(key);
            if (saved && Array.isArray(saved.locations)) {
                _data = saved;
            }
        } catch (e) { console.warn('[location] load failed:', e); }
        _loaded = true;
    }

    async function _save() {
        try {
            var key = await _getKey();
            await localforage.setItem(key, _data);
        } catch (e) { console.warn('[location] save failed:', e); }
    }

    // ── 工具 ──────────────────────────────────────────
    function _uid() { return 'loc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
    function _esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _pname() {
        return (typeof settings !== 'undefined' && settings && settings.partnerName) || '对方';
    }

    // ── 板块切换 ──────────────────────────────────────
    function _switchModule(mod) {
        _currentModule = mod;
        // 更新 tab 样式
        var tabs = document.querySelectorAll('.lq-tab');
        tabs.forEach(function (t) {
            t.classList.toggle('lq-tab-active', t.dataset.module === mod);
        });
        // 清除标记和结果
        var markersWrap = document.getElementById('lq-markers');
        if (markersWrap) markersWrap.innerHTML = '';
        var resultEl = document.getElementById('lq-result');
        if (resultEl) resultEl.innerHTML = '';
        // 梦角世界：显示编辑器和已有标点
        var editorSection = document.getElementById('lq-editor-section');
        var editBtn = document.getElementById('lq-edit-locations-btn');
        if (mod === 'dream') {
            if (editorSection) editorSection.style.display = 'block';
            if (editBtn) editBtn.style.display = 'inline-flex';
            _renderEditableMarkers();
            _renderLocationList();
        } else {
            if (editorSection) editorSection.style.display = 'none';
            if (editBtn) editBtn.style.display = 'none';
        }
    }

    // ── 获取头像 ──────────────────────────────────────
    function _getUserAvatar() {
        if (window._avatarCache && window._avatarCache.me) return window._avatarCache.me;
        var img = document.querySelector('#user-avatar img, .user-avatar img');
        if (img && img.src) return img.src;
        return '';
    }
    function _getPartnerAvatar() {
        if (window._avatarCache && window._avatarCache.partner) return window._avatarCache.partner;
        var img = document.querySelector('#partner-avatar img');
        if (img && img.src) return img.src;
        return '';
    }

    // ── 冷却倒计时 ────────────────────────────────────
    function _startCooldown() {
        _lastQueryTime = Date.now();
        if (_cooldownTimer) clearInterval(_cooldownTimer);
        _updateCooldownText();
        _cooldownTimer = setInterval(function () {
            var remaining = COOLDOWN_MS - (Date.now() - _lastQueryTime);
            if (remaining <= 0) {
                clearInterval(_cooldownTimer);
                _cooldownTimer = null;
                _lastQueryTime = 0;
                _updateCooldownText();
            } else {
                _updateCooldownText();
            }
        }, 1000);
    }

    function _updateCooldownText() {
        var btn = document.getElementById('lq-query-btn');
        if (!btn) return;
        if (_querying) return; // 查询中不更新
        if (_lastQueryTime) {
            var remaining = Math.ceil((COOLDOWN_MS - (Date.now() - _lastQueryTime)) / 1000);
            if (remaining > 0) {
                var min = Math.floor(remaining / 60);
                var sec = remaining % 60;
                btn.innerHTML = '<i class="fas fa-clock"></i> 冷却中 ' + min + ':' + (sec < 10 ? '0' + sec : sec);
                btn.disabled = true;
                btn.style.opacity = '0.55';
                return;
            }
        }
        btn.innerHTML = '<i class="fas fa-search-location"></i> 查询位置';
        btn.disabled = false;
        btn.style.opacity = '';
    }

    // ── 查询逻辑 ──────────────────────────────────────
    function _doQuery() {
        if (_querying) return;
        // 冷却检查
        if (_lastQueryTime) {
            var remaining = COOLDOWN_MS - (Date.now() - _lastQueryTime);
            if (remaining > 0) {
                if (typeof showNotification === 'function') {
                    var sec = Math.ceil(remaining / 1000);
                    showNotification('查询冷却中，请等待 ' + Math.floor(sec / 60) + '分' + (sec % 60) + '秒', 'info', 2500);
                }
                return;
            }
        }

        _querying = true;
        // 开始冷却
        _startCooldown();

        // 随机选择板块（两板块随机查询）
        var randomModule = Math.random() < 0.5 ? 'beside' : 'dream';
        // 同步切换 Tab 到随机选中的板块
        _switchModule(randomModule);

        // 开始雷达扫描动画
        _startRadarSweep();

        // 2.5秒后显示结果
        if (_radarAnimTimer) clearTimeout(_radarAnimTimer);
        _radarAnimTimer = setTimeout(function () {
            _querying = false;
            _stopRadarSweep();
            _showResult();
            _updateCooldownText();
        }, 2500);
    }

    function _startRadarSweep() {
        var radar = document.getElementById('lq-radar-sweep');
        if (radar) radar.style.display = 'block';
        var result = document.getElementById('lq-result');
        if (result) { result.innerHTML = '<div class="lq-scanning">正在定位…</div>'; }
        var markersWrap = document.getElementById('lq-markers');
        if (markersWrap) markersWrap.innerHTML = '';
    }

    function _stopRadarSweep() {
        var radar = document.getElementById('lq-radar-sweep');
        if (radar) radar.style.display = 'none';
    }

    function _showResult() {
        var pname = _pname();

        if (_currentModule === 'beside') {
            // 我身旁：用户在中心，梦角在用户周围随机出现
            // 渲染用户位置（中心，使用主页用户头像）
            _renderMarker('user', 0.5, 0.5, '我');
            // 梦角在用户周围随机出现
            var angle = Math.random() * Math.PI * 2;
            var r = 0.15 + Math.random() * 0.3;
            var px = 0.5 + Math.cos(angle) * r;
            var py = 0.5 + Math.sin(angle) * r;
            _renderMarker('dream', px, py, pname);
            var resultEl = document.getElementById('lq-result');
            if (resultEl) {
                resultEl.innerHTML = '<div class="lq-result-text">' + _esc(pname) + ' 在你身旁 ✦</div>';
            }
        } else {
            // 梦角世界：在设置标点周围随机刷新
            var locs = _data.locations;
            var resultEl2 = document.getElementById('lq-result');
            if (!locs.length) {
                var rx = 0.2 + Math.random() * 0.6;
                var ry = 0.2 + Math.random() * 0.6;
                _renderMarker('dream', rx, ry, pname);
                if (resultEl2) {
                    resultEl2.innerHTML = '<div class="lq-result-text">' + _esc(pname) + ' 正在梦角世界漫游…</div>';
                }
            } else {
                // 显示所有标点
                locs.forEach(function (loc) {
                    _renderMarker('location', loc.x, loc.y, loc.name);
                });
                // 随机选一个标点，在其周围刷新
                var target = locs[Math.floor(Math.random() * locs.length)];
                var isCoincide = Math.random() < 0.3;
                var dAngle, dR, dx, dy;
                if (isCoincide) {
                    dx = target.x;
                    dy = target.y;
                } else {
                    dAngle = Math.random() * Math.PI * 2;
                    dR = 0.05 + Math.random() * 0.12;
                    dx = Math.max(0.05, Math.min(0.95, target.x + Math.cos(dAngle) * dR));
                    dy = Math.max(0.05, Math.min(0.95, target.y + Math.sin(dAngle) * dR));
                }
                _renderMarker('dream', dx, dy, pname);

                if (resultEl2) {
                    var text;
                    if (isCoincide) {
                        text = _esc(pname) + ' 在' + _esc(target.name) + '位置 ✦';
                    } else {
                        text = _esc(pname) + ' 在' + _esc(target.name) + '附近 ✧';
                    }
                    resultEl2.innerHTML = '<div class="lq-result-text">' + text + '</div>';
                }
            }
        }
    }

    function _renderMarker(type, x, y, label) {
        var markersWrap = document.getElementById('lq-markers');
        if (!markersWrap) return;
        var marker = document.createElement('div');
        marker.className = 'lq-marker lq-marker-' + type;
        marker.style.left = (x * 100) + '%';
        marker.style.top = (y * 100) + '%';
        if (type === 'dream') {
            // 梦角位置：使用主页梦角头像
            var pAvatar = _getPartnerAvatar();
            var iconHtml;
            if (pAvatar) {
                iconHtml = '<div class="lq-marker-avatar"><img src="' + _esc(pAvatar) + '" alt="' + _esc(label) + '"></div>';
            } else {
                iconHtml = '<div class="lq-marker-icon"><i class="fas fa-heart"></i></div>';
            }
            marker.innerHTML = '<div class="lq-marker-pulse"></div>'
                + iconHtml
                + '<div class="lq-marker-label">' + _esc(label) + '</div>';
        } else if (type === 'location') {
            marker.innerHTML = '<div class="lq-marker-pin"><i class="fas fa-map-pin"></i></div>'
                + '<div class="lq-marker-label">' + _esc(label) + '</div>';
        } else if (type === 'user') {
            // 用户位置：使用主页用户头像
            var uAvatar = _getUserAvatar();
            var userIconHtml;
            if (uAvatar) {
                userIconHtml = '<div class="lq-marker-avatar lq-marker-user-avatar"><img src="' + _esc(uAvatar) + '" alt="我"></div>';
            } else {
                userIconHtml = '<div class="lq-marker-icon"><i class="fas fa-user"></i></div>';
            }
            marker.innerHTML = userIconHtml
                + '<div class="lq-marker-label">我</div>';
        }
        markersWrap.appendChild(marker);
        setTimeout(function () { marker.classList.add('lq-marker-show'); }, 50);
    }

    // ── 梦角世界位置编辑 ──────────────────────────────
    function _toggleEditor() {
        var editor = document.getElementById('lq-editor');
        if (!editor) return;
        var isOpen = editor.style.display === 'block';
        if (isOpen) {
            editor.style.display = 'none';
        } else {
            editor.style.display = 'block';
            _renderLocationList();
            _renderEditableMarkers();
        }
    }

    function _renderLocationList() {
        var list = document.getElementById('lq-location-list');
        if (!list) return;
        if (!_data.locations.length) {
            list.innerHTML = '<div class="lq-empty">还没有添加位置，点击下方按钮添加</div>';
            return;
        }
        list.innerHTML = _data.locations.map(function (loc, i) {
            return '<div class="lq-loc-item">'
                + '<input type="text" class="lq-loc-name" value="' + _esc(loc.name) + '" data-idx="' + i + '" placeholder="位置名称">'
                + '<button class="lq-loc-del" data-idx="' + i + '" title="删除"><i class="fas fa-times"></i></button>'
                + '</div>';
        }).join('');

        list.querySelectorAll('.lq-loc-name').forEach(function (inp) {
            inp.addEventListener('change', function (e) {
                var idx = parseInt(e.target.dataset.idx, 10);
                var val = e.target.value.trim();
                if (_data.locations[idx]) {
                    _data.locations[idx].name = val || '未命名位置';
                    _save();
                    _renderEditableMarkers();
                }
            });
        });
        list.querySelectorAll('.lq-loc-del').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                var idx = parseInt(e.currentTarget.dataset.idx, 10);
                _data.locations.splice(idx, 1);
                _save();
                _renderLocationList();
                _renderEditableMarkers();
            });
        });
    }

    function _renderEditableMarkers() {
        var markersWrap = document.getElementById('lq-markers');
        if (!markersWrap) return;
        // 只有在梦角世界板块才渲染可编辑标点
        if (_currentModule !== 'dream') return;
        // 如果编辑器关闭，只显示标点不可拖拽
        var editor = document.getElementById('lq-editor');
        var isEditing = editor && editor.style.display === 'block';

        markersWrap.innerHTML = '';
        _data.locations.forEach(function (loc, i) {
            var marker = document.createElement('div');
            marker.className = 'lq-marker lq-marker-edit' + (isEditing ? ' lq-marker-editable' : '');
            marker.style.left = (loc.x * 100) + '%';
            marker.style.top = (loc.y * 100) + '%';
            marker.dataset.idx = i;
            marker.innerHTML = '<div class="lq-marker-pin"><i class="fas fa-map-pin"></i></div>'
                + '<div class="lq-marker-label">' + _esc(loc.name) + '</div>';
            markersWrap.appendChild(marker);
            setTimeout(function () { marker.classList.add('lq-marker-show'); }, i * 50);

            if (isEditing) {
                _bindDrag(marker, i);
            }
        });
    }

    // ── 拖拽（修复：阻止 touchmove 默认行为，防止页面上滑） ──
    function _bindDrag(marker, idx) {
        var radarArea = document.getElementById('lq-radar-area');
        if (!radarArea) return;

        // 关键：在雷达区域阻止 touchmove 的默认行为，防止页面滚动
        function _preventTouchScroll(e) {
            if (_dragState) {
                e.preventDefault();
                e.stopPropagation();
            }
        }

        function onPointerDown(e) {
            e.preventDefault();
            e.stopPropagation();
            _dragState = { idx: idx, marker: marker, radar: radarArea };
            marker.classList.add('lq-marker-dragging');
            // 确保雷达区域不会触发滚动
            radarArea.addEventListener('touchmove', _preventTouchScroll, { passive: false });
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        }

        function onPointerMove(e) {
            if (!_dragState) return;
            e.preventDefault();
            var rect = _dragState.radar.getBoundingClientRect();
            var x = (e.clientX - rect.left) / rect.width;
            var y = (e.clientY - rect.top) / rect.height;
            x = Math.max(0.05, Math.min(0.95, x));
            y = Math.max(0.05, Math.min(0.95, y));
            _dragState.marker.style.left = (x * 100) + '%';
            _dragState.marker.style.top = (y * 100) + '%';
            _data.locations[_dragState.idx].x = x;
            _data.locations[_dragState.idx].y = y;
        }

        function onPointerUp() {
            if (_dragState && _dragState.marker) {
                _dragState.marker.classList.remove('lq-marker-dragging');
            }
            radarArea.removeEventListener('touchmove', _preventTouchScroll);
            _dragState = null;
            _save();
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
        }

        marker.addEventListener('pointerdown', onPointerDown);
    }

    function _addLocation() {
        var name = '位置' + (_data.locations.length + 1);
        _data.locations.push({
            id: _uid(),
            name: name,
            x: 0.3 + Math.random() * 0.4,
            y: 0.3 + Math.random() * 0.4
        });
        _save();
        _renderLocationList();
        _renderEditableMarkers();
    }

    // ── 渲染 ──────────────────────────────────────────
    function _render() {
        var body = document.getElementById('lq-body');
        if (!body) return;

        var html = '';

        // 板块切换 Tab
        html += '<div class="lq-tabs">'
            + '<button class="lq-tab lq-tab-active" data-module="beside" id="lq-tab-beside">'
            + '<i class="fas fa-user-friends"></i> 我身旁</button>'
            + '<button class="lq-tab" data-module="dream" id="lq-tab-dream">'
            + '<i class="fas fa-globe-asia"></i> 梦角世界</button>'
            + '</div>';

        // 雷达
        var uAvatar = _getUserAvatar();
        var centerHtml = uAvatar
            ? '<div class="lq-radar-center lq-radar-center-avatar"><img src="' + _esc(uAvatar) + '" alt="我"></div>'
            : '<div class="lq-radar-center"><i class="fas fa-user"></i></div>';
        html += '<div class="lq-radar-area" id="lq-radar-area">'
            + '<div class="lq-radar-grid"></div>'
            + '<div class="lq-radar-rings">'
            + '<div class="lq-ring lq-ring-1"></div>'
            + '<div class="lq-ring lq-ring-2"></div>'
            + '<div class="lq-ring lq-ring-3"></div>'
            + '</div>'
            + centerHtml
            + '<div class="lq-radar-sweep" id="lq-radar-sweep" style="display:none;"></div>'
            + '<div class="lq-markers" id="lq-markers"></div>'
            + '</div>';

        // 查询结果
        html += '<div class="lq-result" id="lq-result"></div>';

        // 控制按钮
        html += '<div class="lq-controls">'
            + '<button class="lq-btn-main" id="lq-query-btn"><i class="fas fa-search-location"></i> 查询位置</button>'
            + '<button class="lq-btn-ghost" id="lq-edit-locations-btn" style="display:none;"><i class="fas fa-edit"></i> 编辑位置</button>'
            + '</div>';

        // 梦角世界位置编辑器（仅在梦角世界板块显示）
        html += '<div class="lq-editor-section" id="lq-editor-section" style="display:none;">'
            + '<div class="lq-editor" id="lq-editor" style="display:none;">'
            + '<div class="lq-editor-title">梦角世界 · 位置编辑</div>'
            + '<div class="lq-editor-hint">在雷达上拖动标点可移动位置</div>'
            + '<div class="lq-location-list" id="lq-location-list"></div>'
            + '<button class="lq-btn-add" id="lq-add-loc-btn"><i class="fas fa-plus"></i> 添加位置</button>'
            + '</div>'
            + '</div>';

        body.innerHTML = html;

        // 绑定事件
        var queryBtn = document.getElementById('lq-query-btn');
        if (queryBtn) queryBtn.addEventListener('click', _doQuery);
        var editBtn = document.getElementById('lq-edit-locations-btn');
        if (editBtn) editBtn.addEventListener('click', _toggleEditor);
        var addBtn = document.getElementById('lq-add-loc-btn');
        if (addBtn) addBtn.addEventListener('click', _addLocation);

        // Tab 切换
        var tabs = document.querySelectorAll('.lq-tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                _switchModule(tab.dataset.module);
            });
        });

        // 初始化：显示梦角世界的已有标点
        if (_currentModule === 'dream') {
            _switchModule('dream');
        }
    }

    // ── 打开弹窗 ──────────────────────────────────────
    window._locationOpen = async function () {
        if (!_loaded) await _load();
        var more = document.getElementById('more-panel');
        if (more) more.style.display = 'none';
        var moreBtn = document.getElementById('more-btn');
        if (moreBtn) moreBtn.classList.remove('active');
        _render();
        var modal = document.getElementById('location-query-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
    };

    // 绑定更多面板入口
    (function _bindEntry() {
        function bind() {
            var entry = document.getElementById('more-location-btn');
            if (entry) entry.addEventListener('click', function () { window._locationOpen(); });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
    })();

})();
