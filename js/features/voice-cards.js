/**
 * voice-cards.js — 语音字卡模块
 * 入口：高级功能 → 自定义回复 → 回复库管理 → 语音字卡 tab
 * 功能：批量导入本机 mp3、文字描述编辑、试听、批量删除；
 *       梦角回复时 10% 概率以"语音字卡"形式输出（core.js sendMessage 集成）。
 * 存储：localforage（IndexedDB），key = <session前缀>_voiceCards
 * 消息只存 voiceCardId 引用，不复制音频数据，避免聊天记录膨胀。
 */
(function () {
    'use strict';

    // ── 常量 ──────────────────────────────────────────
    var DEFAULT_PROBABILITY = 0.40;     // 语音字卡默认触发概率（40%）
    var PROB_KEY = 'voiceCardProbability';
    var MAX_FILE_MB  = 15;              // 单文件大小上限（MB）
    var ACCEPT_RE    = /\.(mp3|m4a|wav|ogg|flac|aac|opus|weba)$/i;

    // 读取/写入概率（localStorage 持久化，0~100 的整数百分数）
    function _getProbability() {
        try {
            var raw = localStorage.getItem(PROB_KEY);
            if (raw !== null) {
                var v = parseFloat(raw);
                if (!isNaN(v)) {
                    return Math.max(0, Math.min(1, v / 100));
                }
            }
        } catch (e) {}
        return DEFAULT_PROBABILITY;
    }
    function _setProbabilityPercent(pct) {
        pct = Math.max(0, Math.min(100, Math.round(pct)));
        try { localStorage.setItem(PROB_KEY, String(pct)); } catch (e) {}
        return pct;
    }

    // ── 状态 ──────────────────────────────────────────
    // 卡片结构：{ id, name, desc, duration, size, audio(dataURL), createdAt }
    var _cards    = [];
    var _loaded   = false;
    var _loading  = false;
    var _storageKey = null;

    var _batchMode   = false;           // 批量管理模式
    var _selected    = new Set();       // 批量选中的 id
    var _searchQuery = '';

    var _audioPreview = null;           // 试听播放器
    var _previewingId = null;

    // ── 存储 ──────────────────────────────────────────
    async function _getKey() {
        if (_storageKey) return _storageKey;
        try {
            var allKeys = await localforage.keys();
            var found = allKeys.find(function (k) { return k.indexOf('_voiceCards') !== -1; });
            if (found) { _storageKey = found; return found; }
            var msgKey = allKeys.find(function (k) { return k.indexOf('_messages') !== -1; });
            var prefix = msgKey ? msgKey.replace('_messages', '') : 'CHAT_APP_V3_';
            _storageKey = prefix + '_voiceCards';
        } catch (e) {
            _storageKey = 'CHAT_APP_V3__voiceCards';
        }
        return _storageKey;
    }

    async function _load() {
        if (_loading) return;
        _loading = true;
        try {
            var key = await _getKey();
            var saved = await localforage.getItem(key);
            if (Array.isArray(saved)) _cards = saved;
        } catch (e) { console.warn('[voice-cards] load failed:', e); }
        _loaded = true;
        _loading = false;
    }

    async function _save() {
        try {
            var key = await _getKey();
            await localforage.setItem(key, _cards);
        } catch (e) {
            console.warn('[voice-cards] save failed:', e);
            if (typeof showNotification === 'function') showNotification('语音字卡保存失败，存储空间可能已满', 'error');
        }
    }

    // ── 工具 ──────────────────────────────────────────
    function _fmtSize(bytes) {
        if (!bytes) return '';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }
    function _fmtDur(sec) {
        sec = Math.max(0, Math.round(sec || 0));
        return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    }
    function _readAsDataURL(file) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload  = function () { resolve(r.result); };
            r.onerror = function () { reject(new Error('read failed')); };
            r.readAsDataURL(file);
        });
    }
    // 读取音频时长（加载元数据后自动丢弃音频资源）
    function _readDuration(dataUrl) {
        return new Promise(function (resolve) {
            try {
                var a = new Audio();
                a.preload = 'metadata';
                var done = false;
                var finish = function (v) { if (!done) { done = true; a.src = ''; resolve(v); } };
                a.onloadedmetadata = function () { finish(isFinite(a.duration) ? a.duration : 0); };
                a.onerror = function () { finish(0); };
                setTimeout(function () { finish(0); }, 4000);  // 兜底超时
                a.src = dataUrl;
            } catch (e) { resolve(0); }
        });
    }
    function _esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── 导入 ──────────────────────────────────────────
    async function _importFiles(fileList) {
        var files = Array.prototype.slice.call(fileList).filter(function (f) {
            return (f.type && f.type.indexOf('audio/') === 0) || ACCEPT_RE.test(f.name);
        });
        if (!files.length) {
            if (typeof showNotification === 'function') showNotification('没有识别到音频文件（支持 mp3/m4a/wav/ogg/flac 等）', 'warning');
            return;
        }
        if (typeof showNotification === 'function') showNotification('正在导入 ' + files.length + ' 个语音字卡…', 'info');

        var ok = 0, fail = 0;
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (f.size > MAX_FILE_MB * 1024 * 1024) {
                console.warn('[voice-cards] 跳过超大文件:', f.name);
                fail++;
                continue;
            }
            try {
                var dataUrl = await _readAsDataURL(f);
                var duration = await _readDuration(dataUrl);
                _cards.unshift({
                    id: 'vc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                    name: f.name.replace(/\.[^.]+$/, ''),
                    desc: '',
                    duration: duration,
                    size: f.size,
                    audio: dataUrl,
                    createdAt: Date.now()
                });
                ok++;
            } catch (e) {
                console.warn('[voice-cards] 导入失败:', f.name, e);
                fail++;
            }
        }
        await _save();
        _renderInto(document.getElementById('custom-replies-list'));
        if (typeof showNotification === 'function') {
            showNotification('导入完成：成功 ' + ok + ' 条' + (fail ? '，失败 ' + fail + ' 条' : ''), fail ? 'warning' : 'success');
        }
    }

    function _openFilePicker() {
        var input = document.getElementById('vc-file-input');
        if (input) { input.value = ''; input.click(); }
    }

    // ── 试听 ──────────────────────────────────────────
    function _preview(id, btn) {
        var card = _cards.find(function (c) { return c.id === id; });
        if (!card || !card.audio) return;

        if (_previewingId === id && _audioPreview) {
            _audioPreview.pause();
            _audioPreview = null;
            _previewingId = null;
            _updatePreviewBtns();
            return;
        }
        if (_audioPreview) { _audioPreview.pause(); _audioPreview = null; }
        _previewingId = id;
        _updatePreviewBtns();
        var a = new Audio(card.audio);
        _audioPreview = a;
        a.onended = a.onerror = function () {
            if (_previewingId === id) { _previewingId = null; _updatePreviewBtns(); }
            if (_audioPreview === a) _audioPreview = null;
        };
        a.play().catch(function () {
            _previewingId = null;
            _updatePreviewBtns();
            _audioPreview = null;
        });
    }
    function _updatePreviewBtns() {
        var list = document.getElementById('custom-replies-list');
        if (!list) return;
        list.querySelectorAll('.vc-play-btn').forEach(function (b) {
            var on = b.dataset.id === _previewingId;
            b.classList.toggle('vc-playing', on);
            b.innerHTML = on ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-play"></i>';
        });
    }

    // ── 描述编辑 ──────────────────────────────────────
    async function _editDesc(id) {
        var card = _cards.find(function (c) { return c.id === id; });
        if (!card) return;
        var val = prompt('为这条语音写点文字描述吧（梦角发这条语音字卡时会一并显示）：', card.desc || '');
        if (val === null) return;  // 取消
        card.desc = val.trim();
        await _save();
        _renderInto(document.getElementById('custom-replies-list'));
    }

    // ── 删除 ──────────────────────────────────────────
    async function _deleteCard(id) {
        var card = _cards.find(function (c) { return c.id === id; });
        if (!card) return;
        if (!confirm('删除语音字卡「' + card.name + '」？\n（聊天记录里已发送过的语音不受影响，但重播将降级为普通语音）')) return;
        _cards = _cards.filter(function (c) { return c.id !== id; });
        _selected.delete(id);
        await _save();
        _renderInto(document.getElementById('custom-replies-list'));
    }

    async function _deleteSelected() {
        if (!_selected.size) return;
        if (!confirm('确定删除选中的 ' + _selected.size + ' 条语音字卡？')) return;
        _cards = _cards.filter(function (c) { return !_selected.has(c.id); });
        _selected.clear();
        _batchMode = false;
        await _save();
        _renderInto(document.getElementById('custom-replies-list'));
        if (typeof showNotification === 'function') showNotification('已删除', 'success');
    }

    // ── 渲染（自治渲染整个 tab） ───────────────────────
    function _renderInto(list) {
        if (!list) return;
        if (!_loaded) { _load().then(function () { _renderInto(list); }); return; }

        list.className = 'content-list-area vc-list-root';
        list.innerHTML = '';

        // 隐藏文件选择器（只创建一次）
        if (!document.getElementById('vc-file-input')) {
            var inp = document.createElement('input');
            inp.type = 'file';
            inp.id = 'vc-file-input';
            inp.accept = 'audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac';
            inp.multiple = true;
            inp.style.display = 'none';
            inp.addEventListener('change', function (e) {
                _importFiles(e.target.files);
                e.target.value = '';
            });
            document.body.appendChild(inp);
        }

        var q = _searchQuery.toLowerCase().trim();
        var filtered = q ? _cards.filter(function (c) {
            return (c.name || '').toLowerCase().indexOf(q) !== -1 ||
                   (c.desc  || '').toLowerCase().indexOf(q) !== -1;
        }) : _cards;

        var html = '';

        // ── 专属工具栏 ──
        html += '<div class="vc-toolbar">'
            + '<div class="vc-toolbar-left">'
            + '<button class="vc-import-btn" id="vc-import-btn"><i class="fas fa-file-arrow-up"></i> 批量导入 mp3</button>'
            + '<button class="vc-batch-btn' + (_batchMode ? ' vc-batch-on' : '') + '" id="vc-batch-toggle">'
            +   '<i class="fas fa-check-double"></i> ' + (_batchMode ? '退出批量' : '批量管理')
            + '</button>'
            + '</div>'
            + '<div class="vc-toolbar-right">'
            + '<span class="vc-count">' + _cards.length + ' 条</span>'
            + '<span class="vc-prob-hint" title="梦角每次回复时，有对应概率随机发出一条语音字卡">🎯 触发概率</span>'
            + '<span class="vc-prob-control">'
            +   '<input type="range" min="0" max="100" step="5" value="' + Math.round(_getProbability() * 100) + '" id="vc-prob-slider" class="vc-prob-slider" title="调整语音字卡触发概率">'
            +   '<span class="vc-prob-val" id="vc-prob-val">' + Math.round(_getProbability() * 100) + '%</span>'
            + '</span>'
            + '</div>'
            + '</div>';

        // ── 批量操作条 ──
        if (_batchMode) {
            html += '<div class="vc-batch-bar">'
                + '<button class="vc-batch-pill" id="vc-select-all">' + (_selected.size === filtered.length ? '取消全选' : '全选') + '</button>'
                + '<span class="vc-batch-info">' + (_selected.size > 0 ? '已选 <b>' + _selected.size + '</b> 条' : '点击卡片以选择') + '</span>'
                + '<button class="vc-batch-pill vc-batch-danger' + (_selected.size ? '' : ' vc-disabled') + '" id="vc-delete-selected"><i class="fas fa-trash-can"></i> 删除选中</button>'
                + '</div>';
        }

        // ── 列表 ──
        if (!filtered.length) {
            html += '<div class="vc-empty">'
                + '<div class="vc-empty-icon">🎵</div>'
                + (q ? '没有找到匹配 "' + _esc(q) + '" 的语音字卡' : '<div>还没有语音字卡</div><div class="vc-empty-sub">点击上方「批量导入 mp3」，从本机选择音频文件<br>导入后可逐条添加文字描述，梦角将有概率发送它们</div>')
                + '</div>';
        } else {
            html += '<div class="vc-list">';
            filtered.forEach(function (c) {
                var sel = _batchMode && _selected.has(c.id);
                var playing = _previewingId === c.id;
                html += '<div class="vc-item' + (sel ? ' vc-selected' : '') + '" data-id="' + c.id + '">'
                    + '<div class="vc-check">✓</div>'
                    + '<button class="vc-play-btn' + (playing ? ' vc-playing' : '') + '" data-id="' + c.id + '" title="试听">'
                    +   (playing ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-play"></i>')
                    + '</button>'
                    + '<div class="vc-info">'
                    +   '<div class="vc-name">' + _esc(c.name) + '</div>'
                    +   '<div class="vc-meta">'
                    +     '<span><i class="fas fa-clock"></i> ' + _fmtDur(c.duration) + '</span>'
                    +     '<span><i class="fas fa-weight-hanging"></i> ' + _fmtSize(c.size) + '</span>'
                    +     (c.desc ? '<span class="vc-has-desc" title="' + _esc(c.desc) + '"><i class="fas fa-quote-left"></i> ' + _esc(c.desc.length > 14 ? c.desc.slice(0, 14) + '…' : c.desc) + '</span>' : '')
                    +   '</div>'
                    + '</div>'
                    + '<button class="vc-desc-btn" data-id="' + c.id + '" title="' + (c.desc ? '编辑描述' : '添加文字描述') + '"><i class="fas fa-pen' + (c.desc ? '' : '-to-square') + '"></i>' + (c.desc ? '' : '<span>描述</span>') + '</button>'
                    + '<button class="vc-del-btn" data-id="' + c.id + '" title="删除"><i class="fas fa-trash-can"></i></button>'
                    + '</div>';
            });
            html += '</div>';
        }

        list.innerHTML = html;

        // ── 绑定事件 ──
        var importBtn = list.querySelector('#vc-import-btn');
        if (importBtn) importBtn.onclick = _openFilePicker;

        var batchToggle = list.querySelector('#vc-batch-toggle');
        if (batchToggle) batchToggle.onclick = function () {
            _batchMode = !_batchMode;
            if (!_batchMode) _selected.clear();
            _renderInto(list);
        };

        var selectAll = list.querySelector('#vc-select-all');
        if (selectAll) selectAll.onclick = function () {
            if (_selected.size === filtered.length) _selected.clear();
            else filtered.forEach(function (c) { _selected.add(c.id); });
            _renderInto(list);
        };

        var delSel = list.querySelector('#vc-delete-selected');
        if (delSel) delSel.onclick = _deleteSelected;

        // ── 概率滑块 ──
        var probSlider = list.querySelector('#vc-prob-slider');
        var probVal = list.querySelector('#vc-prob-val');
        if (probSlider && probVal) {
            probSlider.oninput = function () {
                var pct = parseInt(probSlider.value, 10) || 0;
                probVal.textContent = pct + '%';
            };
            probSlider.onchange = function () {
                var pct = parseInt(probSlider.value, 10) || 0;
                _setProbabilityPercent(pct);
                probVal.textContent = pct + '%';
                if (typeof showNotification === 'function') {
                    showNotification('语音字卡触发概率已设为 ' + pct + '%', 'success');
                }
            };
        }

        list.querySelectorAll('.vc-play-btn').forEach(function (b) {
            b.onclick = function (e) { e.stopPropagation(); _preview(b.dataset.id, b); };
        });
        list.querySelectorAll('.vc-desc-btn').forEach(function (b) {
            b.onclick = function (e) { e.stopPropagation(); _editDesc(b.dataset.id); };
        });
        list.querySelectorAll('.vc-del-btn').forEach(function (b) {
            b.onclick = function (e) { e.stopPropagation(); _deleteCard(b.dataset.id); };
        });
        list.querySelectorAll('.vc-item').forEach(function (item) {
            item.onclick = function () {
                if (!_batchMode) return;
                var id = item.dataset.id;
                if (_selected.has(id)) _selected.delete(id); else _selected.add(id);
                _renderInto(list);
            };
        });
    }

    // ── 公开 API ──────────────────────────────────────
    window.VoiceCards = {
        count: function () { return _cards.length; },

        // 随机抽一条（供 sendMessage 的 10% 概率输出使用）
        pickRandom: function () {
            if (!_cards.length) return null;
            return _cards[Math.floor(Math.random() * _cards.length)];
        },

        getById: function (id) {
            return _cards.find(function (c) { return c.id === id; }) || null;
        },

        // 语音字卡触发概率（0~1），动态读取用户自定义值
        get probability() {
            return _getProbability();
        },
        set probability(p) {
            _setProbabilityPercent(p * 100);
        },

        renderInto: _renderInto,
        openFilePicker: _openFilePicker,
        setSearch: function (q) { _searchQuery = q || ''; },

        // 预加载（页面启动后异步调用一次即可）
        preload: _load,

        // 导出/导入（JSON，不含音频数据，仅元信息，供备份扩展用）
        exportMeta: function () {
            return _cards.map(function (c) { return { id: c.id, name: c.name, desc: c.desc, duration: c.duration, size: c.size, createdAt: c.createdAt }; });
        }
    };

    // 页面加载后预载数据
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { _load(); });
    } else {
        _load();
    }

})();
