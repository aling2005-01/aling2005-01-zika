/**
 * survey.js — 问卷模块
 * 入口：高级功能 → 问卷
 * 三个子模块：
 *   1. 对方问我：题库模式 + 每 x~y 小时自动从题库随机抽取一条发放（x/y 自定义）
 *   2. 我问对方：自行编辑问题 + 选项（至少 2 个，可增删）+ 单选/多选 + 必须指定回答人
 *   3. 问题回顾：全部问答历史记录
 * 昵称：settings.partnerName（对方）/ settings.myName（我），与主界面同步。
 * 全程以聊天消息形式发出；存储 localforage，key = <session前缀>_surveyData
 */
(function () {
    'use strict';

    // ── 状态 ──────────────────────────────────────────
    var _data = {
        askMe: {
            questions: [],      // [ { id, text, createdAt } ]
            intervalX: 2,       // x 小时
            intervalY: 6,       // y 小时
            auto: true,         // 自动发放开关
            nextAt: 0,          // 下次发放时间戳
            pending: null,      // 旧版单条待答（兼容）
            pendingQueue: []    // 待答队列 [ { qid, text, sentAt } ] 按发送顺序，不可跳过
        },
        askYou: [],             // 我问对方的问卷
        history: []             // 回顾记录
    };
    var _loaded = false;
    var _storageKey = null;
    var _view = 'askMe';        // askMe | askYou | history
    var _tickTimer = null;

    // 我问对方 - 编辑器状态
    var _showEditor = false;
    var _edText = '';
    var _edOptions = ['', ''];
    var _edMulti = false;
    var _edRespondent = '';     // ''=未选 | 'partner' | 'me'
    var _mePick = {};           // respondent=me 时玩家的选择 { surveyId: [idx,...] }

    // ── 存储 ──────────────────────────────────────────
    async function _getKey() {
        if (_storageKey) return _storageKey;
        try {
            var allKeys = await localforage.keys();
            var found = allKeys.find(function (k) { return k.indexOf('_surveyData') !== -1; });
            if (found) { _storageKey = found; return found; }
            var msgKey = allKeys.find(function (k) { return k.indexOf('_messages') !== -1; });
            var prefix = msgKey ? msgKey.replace('_messages', '') : 'CHAT_APP_V3_';
            _storageKey = prefix + '_surveyData';
        } catch (e) {
            _storageKey = 'CHAT_APP_V3__surveyData';
        }
        return _storageKey;
    }

    async function _load() {
        try {
            var key = await _getKey();
            var saved = await localforage.getItem(key);
            if (saved) {
                if (saved.askMe) _data.askMe = Object.assign(_data.askMe, saved.askMe);
                // 迁移旧版单条 pending 到队列
                if (!Array.isArray(_data.askMe.pendingQueue)) _data.askMe.pendingQueue = [];
                if (_data.askMe.pending && !_data.askMe.pendingQueue.length) {
                    _data.askMe.pendingQueue.push(_data.askMe.pending);
                    _data.askMe.pending = null;
                }
                if (Array.isArray(saved.askYou)) _data.askYou = saved.askYou;
                if (Array.isArray(saved.history)) _data.history = saved.history;
            }
        } catch (e) { console.warn('[survey] load failed:', e); }
        _loaded = true;
    }

    async function _save() {
        try {
            var key = await _getKey();
            await localforage.setItem(key, _data);
        } catch (e) { console.warn('[survey] save failed:', e); }
    }

    // ── 工具 ──────────────────────────────────────────
    function _esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _uid(p) { return (p || 'sv_') + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
    function _pname() { return (typeof settings !== 'undefined' && settings && settings.partnerName) || '梦角'; }
    function _mname() { return (typeof settings !== 'undefined' && settings && settings.myName) || '我'; }
    function _fmtTime(ts) {
        var d = new Date(ts);
        function p(n) { return n < 10 ? '0' + n : '' + n; }
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    // ── 消息发送（走聊天流） ──────────────────────────
    function _sysMsg(text) {
        if (typeof addMessage !== 'function') return;
        addMessage({
            id: Date.now() + Math.floor(Math.random() * 1000),
            sender: null, text: text, timestamp: new Date(),
            type: 'system', status: 'sent', favorited: false, note: null
        });
    }
    function _partnerSay(text, delayMs) {
        setTimeout(function () {
            if (typeof addMessage !== 'function') return;
            addMessage({
                id: Date.now() + Math.floor(Math.random() * 1000),
                sender: _pname(), text: text, timestamp: new Date(),
                status: 'received', favorited: false, note: null,
                replyTo: null, type: 'normal'
            });
            if (typeof playSound === 'function') playSound('message');
        }, delayMs || 0);
    }
    function _userSay(text) {
        if (typeof addMessage !== 'function') return;
        addMessage({
            id: Date.now() + Math.floor(Math.random() * 1000),
            sender: 'user', text: text, timestamp: new Date(),
            status: 'sent', favorited: false, note: null,
            replyTo: null, type: 'normal'
        });
        if (typeof playSound === 'function') playSound('send');
    }

    function _letters(opts) {
        return opts.map(function (o, i) {
            return String.fromCharCode(65 + i) + '. ' + o;
        });
    }

    // ── 子模块1：对方问我 ──────────────────────────────
    function _nextIntervalMs() {
        var x = parseFloat(_data.askMe.intervalX);
        var y = parseFloat(_data.askMe.intervalY);
        if (isNaN(x) || x < 0.1) x = 0.1;
        if (isNaN(y) || y < 0.1) y = 0.1;
        if (x > y) { var t = x; x = y; y = t; }
        var h = x + Math.random() * (y - x);
        return h * 3600 * 1000;
    }

    // 归档一条待答为「未作答」（用于跳过按钮 / 兼容）
    function _archivePendingUnanswered() {
        var queue = _data.askMe.pendingQueue;
        if (!Array.isArray(queue) || !queue.length) return;
        var p = queue.shift();
        _data.history.unshift({
            id: _uid('h_'), type: 'askMe',
            question: p.text, answer: [], answerBy: 'none',
            timestamp: p.sentAt
        });
    }

    // 发放一条：对方从题库随机抽题问玩家（多条待答按发送顺序排队，不覆盖）
    function _fireAskMe(manual) {
        var qs = _data.askMe.questions;
        if (!qs.length) return false;
        if (!Array.isArray(_data.askMe.pendingQueue)) _data.askMe.pendingQueue = [];
        var q = qs[Math.floor(Math.random() * qs.length)];
        _data.askMe.pendingQueue.push({ qid: q.id, text: q.text, sentAt: Date.now() });
        _data.askMe.nextAt = Date.now() + _nextIntervalMs();
        _save();

        var seq = _data.askMe.pendingQueue.length;
        _sysMsg('📋 问卷时间到 —— ' + (manual ? '手动发放' : '定时发放') + '（第 ' + seq + ' 题待答）：由 <b>' + _esc(_pname()) + '</b> 向 <b>' + _esc(_mname()) + '</b> 提问');
        _partnerSay('📋 ' + _mname() + '，来答个小问卷：「' + q.text + '」（认真回答哦，' + (seq > 1 ? '请按顺序先答前面的题' : '') + '）\n\n🖱️ 点我打开问卷答题', 1200);
        return true;
    }

    // 玩家提交答案（对方问我）—— 只回答队列第一题（不可跳过）
    function _submitAskMe() {
        var queue = _data.askMe.pendingQueue;
        if (!Array.isArray(queue) || !queue.length) return;
        var p = queue[0];
        var input = document.getElementById('sv-askme-answer');
        var val = input ? input.value.trim() : '';
        if (!val) {
            if (typeof showNotification === 'function') showNotification('先写下你的回答吧', 'info');
            return;
        }
        _userSay(val);
        _data.history.unshift({
            id: _uid('h_'), type: 'askMe',
            question: p.text, answer: [val], answerBy: 'me',
            timestamp: Date.now()
        });
        queue.shift();
        _save();
        if (typeof showNotification === 'function') showNotification('✓ 回答已发送并记入回顾' + (queue.length ? '，还有 ' + queue.length + ' 题待答' : ''), 'success');
        _render();
    }

    // 定时检查（每 30 秒）
    function _tick() {
        if (!_loaded || !_data.askMe.auto) return;
        if (!_data.askMe.questions.length) return;
        var now = Date.now();
        if (!_data.askMe.nextAt) {
            _data.askMe.nextAt = now + _nextIntervalMs();
            _save();
            return;
        }
        if (now >= _data.askMe.nextAt) _fireAskMe(false);
    }

    // 题库管理
    function _addAskMeQ() {
        var input = document.getElementById('sv-askme-newq');
        var val = input ? input.value.trim() : '';
        if (!val) {
            if (typeof showNotification === 'function') showNotification('问题内容不能为空', 'error');
            return;
        }
        _data.askMe.questions.unshift({ id: _uid('aq_'), text: val, createdAt: Date.now() });
        _save();
        input.value = '';
        if (typeof showNotification === 'function') showNotification('✓ 已加入题库', 'success');
        _render();
    }
    function _editAskMeQ(id) {
        var q = _data.askMe.questions.find(function (x) { return x.id === id; });
        if (!q) return;
        var nv = (typeof prompt === 'function') ? prompt('修改问题内容：', q.text) : null;
        if (nv === null) return;
        nv = nv.trim();
        if (!nv) {
            if (typeof showNotification === 'function') showNotification('问题内容不能为空', 'error');
            return;
        }
        q.text = nv;
        _save();
        if (typeof showNotification === 'function') showNotification('✓ 已修改', 'success');
        _render();
    }
    function _delAskMeQ(id) {
        _data.askMe.questions = _data.askMe.questions.filter(function (x) { return x.id !== id; });
        _save();
        _render();
    }
    function _saveInterval() {
        var xi = document.getElementById('sv-int-x');
        var yi = document.getElementById('sv-int-y');
        var x = parseFloat(xi ? xi.value : '');
        var y = parseFloat(yi ? yi.value : '');
        if (isNaN(x) || isNaN(y) || x < 0.1 || y < 0.1) {
            if (typeof showNotification === 'function') showNotification('x / y 需为不小于 0.1 的小时数', 'error');
            return;
        }
        if (x > y) { var t = x; x = y; y = t; xi.value = x; yi.value = y; }
        _data.askMe.intervalX = x;
        _data.askMe.intervalY = y;
        _data.askMe.nextAt = Date.now() + _nextIntervalMs();
        _save();
        if (typeof showNotification === 'function') showNotification('✓ 间隔已设为每 ' + x + '~' + y + ' 小时一题', 'success');
        _render();
    }
    function _toggleAuto() {
        _data.askMe.auto = !_data.askMe.auto;
        if (_data.askMe.auto) _data.askMe.nextAt = Date.now() + _nextIntervalMs();
        _save();
        _render();
    }

    // ── 子模块2：我问对方 ──────────────────────────────
    function _openEditor() {
        _showEditor = true;
        _edText = ''; _edOptions = ['', '']; _edMulti = false; _edRespondent = '';
        _render();
        setTimeout(function () {
            var t = document.getElementById('sv-q-text');
            if (t) t.focus();
        }, 100);
    }
    function _edSync() {
        var t = document.getElementById('sv-q-text');
        if (t) _edText = t.value;
        var opts = document.querySelectorAll('.sv-opt-input');
        var arr = [];
        opts.forEach(function (o) { arr.push(o.value); });
        _edOptions = arr;
    }
    function _edAddOpt() {
        _edSync();
        _edOptions.push('');
        _render();
        setTimeout(function () {
            var list = document.querySelectorAll('.sv-opt-input');
            if (list.length) { list[list.length - 1].focus(); }
        }, 60);
    }
    function _edRemoveOpt(idx) {
        _edSync();
        if (_edOptions.length <= 2) {
            if (typeof showNotification === 'function') showNotification('至少保留 2 个选项', 'info');
            return;
        }
        _edOptions.splice(idx, 1);
        _render();
    }
    function _edSetMulti(v) { _edSync(); _edMulti = !!v; _render(); }
    function _edSetRespondent(v) { _edSync(); _edRespondent = v; _render(); }

    function _edSubmit() {
        _edSync();
        var text = (_edText || '').trim();
        var opts = _edOptions.map(function (s) { return String(s || '').trim(); }).filter(Boolean);
        if (!text) {
            if (typeof showNotification === 'function') showNotification('问题内容不能为空', 'error');
            return;
        }
        if (opts.length < 2) {
            if (typeof showNotification === 'function') showNotification('至少需要 2 个有效选项', 'error');
            return;
        }
        if (_edRespondent !== 'partner' && _edRespondent !== 'me') {
            if (typeof showNotification === 'function') showNotification('必须选择回答问题的人', 'error');
            return;
        }
        var sv = {
            id: _uid('sy_'), text: text, options: opts,
            multi: _edMulti, respondent: _edRespondent,
            createdAt: Date.now(), status: 'pending',
            answer: [], answeredAt: null
        };
        _data.askYou.unshift(sv);
        _showEditor = false;
        _save();

        // 发放到聊天流
        var optLine = _letters(opts).join('　');
        if (_edRespondent === 'partner') {
            _sysMsg('📋 问卷发放 —— <b>' + _esc(_mname()) + '</b> 向 <b>' + _esc(_pname()) + '</b> 提问（' + (_edMulti ? '多选' : '单选') + '）');
            _userSay('📋 问卷：「' + text + '」\n' + optLine);
            // 对方延迟随机作答
            setTimeout(function () { _autoPartnerAnswer(sv.id); }, 2500 + Math.floor(Math.random() * 2000));
        } else {
            _sysMsg('📋 问卷发放 —— <b>' + _esc(_pname()) + '</b> 向 <b>' + _esc(_mname()) + '</b> 提问（' + (_edMulti ? '多选' : '单选') + '）');
            _partnerSay('📋 ' + _mname() + '，这份问卷给你：「' + text + '」\n' + optLine + '\n\n🖱️ 点我打开问卷答题', 800);
        }
        if (typeof showNotification === 'function') showNotification('✓ 问卷已发放', 'success');
        _render();
    }

    // 对方自动作答（我问对方、回答人=对方）
    function _autoPartnerAnswer(surveyId) {
        var sv = _data.askYou.find(function (x) { return x.id === surveyId; });
        if (!sv || sv.status !== 'pending') return;
        var n = sv.multi ? (Math.random() < 0.5 ? 1 : 2) : 1;
        if (n > sv.options.length) n = sv.options.length;
        var copy = sv.options.map(function (_, i) { return i; });
        var pickedIdx = [];
        for (var i = 0; i < n && copy.length; i++) {
            pickedIdx.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
        }
        pickedIdx.sort(function (a, b) { return a - b; });
        var picked = pickedIdx.map(function (i) { return String.fromCharCode(65 + i) + '「' + sv.options[i] + '」'; });
        sv.status = 'answered';
        sv.answer = pickedIdx.map(function (i) { return sv.options[i]; });
        sv.answeredAt = Date.now();

        _partnerSay('我选：' + picked.join(sv.multi ? '、' : ''), 0);
        _data.history.unshift({
            id: _uid('h_'), type: 'askYou',
            question: sv.text, answer: sv.answer.slice(), answerBy: 'partner',
            timestamp: Date.now()
        });
        _save();
        _render();
    }

    // 玩家点选选项（回答人=我）
    function _mePickToggle(surveyId, idx) {
        var sv = _data.askYou.find(function (x) { return x.id === surveyId; });
        if (!sv || sv.status !== 'pending' || sv.respondent !== 'me') return;
        var arr = _mePick[surveyId] || (_mePick[surveyId] = []);
        var pos = arr.indexOf(idx);
        if (sv.multi) {
            if (pos >= 0) arr.splice(pos, 1);
            else arr.push(idx);
        } else {
            arr.length = 0;
            arr.push(idx);
        }
        // 更新选项按钮高亮
        var card = document.querySelector('[data-svcard="' + surveyId + '"]');
        if (card) {
            card.querySelectorAll('.sv-opt-btn').forEach(function (b, i) {
                b.classList.toggle('picked', arr.indexOf(i) >= 0);
            });
        }
    }

    // 玩家提交答案（回答人=我）
    function _submitMeAnswer(surveyId) {
        var sv = _data.askYou.find(function (x) { return x.id === surveyId; });
        if (!sv || sv.status !== 'pending') return;
        var arr = _mePick[surveyId] || [];
        if (!arr.length) {
            if (typeof showNotification === 'function') showNotification('先选择你的答案', 'info');
            return;
        }
        arr = arr.slice().sort(function (a, b) { return a - b; });
        var picked = arr.map(function (i) { return String.fromCharCode(65 + i) + '「' + sv.options[i] + '」'; });
        sv.status = 'answered';
        sv.answer = arr.map(function (i) { return sv.options[i]; });
        sv.answeredAt = Date.now();

        _userSay('我选：' + picked.join(sv.multi ? '、' : ''));
        _data.history.unshift({
            id: _uid('h_'), type: 'askYou',
            question: sv.text, answer: sv.answer.slice(), answerBy: 'me',
            timestamp: Date.now()
        });
        delete _mePick[surveyId];
        _save();
        if (typeof showNotification === 'function') showNotification('✓ 回答已发送并记入回顾', 'success');
        _render();
    }

    function _delSurvey(id) {
        _data.askYou = _data.askYou.filter(function (x) { return x.id !== id; });
        delete _mePick[id];
        _save();
        _render();
    }

    // 在回顾中编辑/补答答案
    function _editHistoryAnswer(id) {
        var h = _data.history.find(function (x) { return x.id === id; });
        if (!h) return;
        // 用自定义编辑弹窗（输入框）
        var prev = (h.answer && h.answer.length) ? h.answer.join('、') : '';
        var val = (typeof prompt === 'function') ? prompt(
            (h.answerBy === 'none' ? '重新回答这道题：' : '编辑这道题的答案：') + h.question,
            prev
        ) : null;
        if (val === null) return;   // 取消
        val = val.trim();
        if (!val) {
            if (typeof showNotification === 'function') showNotification('答案不能为空', 'error');
            return;
        }
        // 未作答 → 补答；已作答 → 编辑答案
        var wasUnanswered = h.answerBy === 'none';
        _userSay('【' + (wasUnanswered ? '补答' : '修改答案') + '】' + h.question + ' —— ' + val);
        h.answer = [val];
        h.answerBy = 'me';
        h.timestamp = Date.now();
        _save();
        if (typeof showNotification === 'function') showNotification('✓ ' + (wasUnanswered ? '已补答' : '答案已更新'), 'success');
        _render();
    }

    // ── 子模块3：问题回顾 ──────────────────────────────
    function _delHistory(id) {
        _data.history = _data.history.filter(function (x) { return x.id !== id; });
        _save();
        _render();
    }
    function _clearHistory() {
        if (typeof confirm === 'function' && !confirm('清空全部回顾记录？')) return;
        _data.history = [];
        _save();
        _render();
    }

    // ── 渲染 ──────────────────────────────────────────
    function _render() {
        var body = document.getElementById('survey-body');
        if (!body) return;
        var html = '';

        // tabs
        html += '<div class="sv-tabs">'
            + '<button class="sv-tab ' + (_view === 'askMe' ? 'active' : '') + '" data-svtab="askMe">梦角问我</button>'
            + '<button class="sv-tab ' + (_view === 'askYou' ? 'active' : '') + '" data-svtab="askYou">我问梦角</button>'
            + '<button class="sv-tab ' + (_view === 'history' ? 'active' : '') + '" data-svtab="history">问题回顾</button>'
            + '</div>';

        if (_view === 'askMe') html += _rAskMe();
        else if (_view === 'askYou') html += _rAskYou();
        else html += _rHistory();

        body.innerHTML = html;

        // tab 绑定
        body.querySelectorAll('.sv-tab').forEach(function (b) {
            b.onclick = function () { _view = b.getAttribute('data-svtab'); _render(); };
        });

        // 各视图事件
        if (_view === 'askMe') _bindAskMe(body);
        else if (_view === 'askYou') _bindAskYou(body);
        else _bindHistory(body);
    }

    // —— 对方问我 ——
    function _rAskMe() {
        var a = _data.askMe;
        var html = '';

        // 定时设置卡
        html += '<div class="sv-card">'
            + '<div class="sv-card-title"><i class="fas fa-clock"></i> 定时发放</div>'
            + '<div class="sv-int-row">'
            + '<label class="sv-switch"><input type="checkbox" id="sv-auto"' + (a.auto ? ' checked' : '') + '><span class="sv-slider"></span></label>'
            + '<span class="sv-int-label">每</span>'
            + '<input type="number" class="sv-int-input" id="sv-int-x" min="0.1" step="0.5" value="' + _esc(a.intervalX) + '">'
            + '<span class="sv-int-label">~</span>'
            + '<input type="number" class="sv-int-input" id="sv-int-y" min="0.1" step="0.5" value="' + _esc(a.intervalY) + '">'
            + '<span class="sv-int-label">小时</span>'
            + '<button class="sv-mini-btn" id="sv-int-save">保存</button>'
            + '</div>'
            + '<div class="sv-int-tip">到点后 ' + _esc(_pname()) + ' 会从题库随机抽一题发到聊天里';

        if (a.auto && a.nextAt) {
            var left = a.nextAt - Date.now();
            if (left > 0) {
                var h = Math.floor(left / 3600000), m = Math.floor((left % 3600000) / 60000);
                html += '（下次约 ' + (h ? h + ' 小时 ' : '') + m + ' 分钟后）';
            } else html += '（即将发放）';
        } else if (!a.auto) html += '（当前已暂停）';
        html += '</div>'
            + '<button class="sv-ghost-btn" id="sv-fire-now"' + (a.questions.length ? '' : ' disabled') + '><i class="fas fa-paper-plane"></i> 立即发放一题</button>'
            + '</div>';

        // 当前待答（队列，按顺序，不可跳过）
        var queue = a.pendingQueue;
        if (!Array.isArray(queue)) a.pendingQueue = queue = [];
        if (queue.length) {
            html += '<div class="sv-list-head"><span class="sv-count-tag">待回答 ' + queue.length + ' 题</span></div>';
            queue.forEach(function (p, qi) {
                html += '<div class="sv-card sv-pending-card">'
                    + '<div class="sv-card-title"><i class="fas fa-hourglass-half"></i> ' + _esc(_pname()) + ' 正在等你回答' + (queue.length > 1 ? ' · 第 ' + (qi + 1) + '/' + queue.length + ' 题' : '') + '</div>'
                    + '<div class="sv-question">「' + _esc(p.text) + '」</div>'
                    + (qi === 0
                        ? '<textarea id="sv-askme-answer" class="sv-answer-input" rows="2" placeholder="写下你的回答，发送到聊天…"></textarea>'
                          + '<div class="sv-btn-row">'
                          + '<button class="sv-main-btn" id="sv-askme-submit"><i class="fas fa-paper-plane"></i> 发送回答</button>'
                          + '<button class="sv-ghost-btn" id="sv-askme-skip">跳过（记为未作答）</button>'
                          + '</div>'
                        : '<div class="sv-queue-wait">先回答上面的问题，再答这一题</div>')
                    + '</div>';
            });
        }

        // 题库
        html += '<div class="sv-list-head"><span class="sv-count-tag">题库 ' + a.questions.length + ' 题</span></div>';
        if (!a.questions.length) {
            html += '<div class="sv-empty"><div class="sv-empty-icon">📋</div><div>题库还是空的</div><div class="sv-empty-sub">添加问题后，' + _esc(_pname()) + ' 会按间隔定时来问你</div></div>';
        } else {
            a.questions.forEach(function (q) {
                html += '<div class="sv-q-row">'
                    + '<div class="sv-q-text">' + _esc(q.text) + '</div>'
                    + '<div class="sv-q-actions">'
                    + '<button class="sv-act-btn" data-editq="' + q.id + '" title="修改"><i class="fas fa-pen"></i></button>'
                    + '<button class="sv-act-btn sv-act-del" data-delq="' + q.id + '" title="删除"><i class="fas fa-trash-can"></i></button>'
                    + '</div></div>';
            });
        }
        html += '<div class="sv-add-row">'
            + '<input type="text" id="sv-askme-newq" class="sv-inline-input" placeholder="输入问题，加入题库…">'
            + '<button class="sv-mini-btn sv-mini-main" id="sv-askme-add">添加</button>'
            + '</div>';
        return html;
    }
    function _bindAskMe(body) {
        var t = body.querySelector('#sv-auto');
        if (t) t.onchange = _toggleAuto;
        var s = body.querySelector('#sv-int-save');
        if (s) s.onclick = _saveInterval;
        var f = body.querySelector('#sv-fire-now');
        if (f) f.onclick = function () { _fireAskMe(true); _render(); };
        var sub = body.querySelector('#sv-askme-submit');
        if (sub) sub.onclick = _submitAskMe;
        var skip = body.querySelector('#sv-askme-skip');
        if (skip) skip.onclick = function () { _archivePendingUnanswered(); _save(); _render(); };
        var add = body.querySelector('#sv-askme-add');
        if (add) add.onclick = _addAskMeQ;
        var newq = body.querySelector('#sv-askme-newq');
        if (newq) newq.onkeydown = function (e) { if (e.key === 'Enter') _addAskMeQ(); };
        body.querySelectorAll('[data-editq]').forEach(function (b) {
            b.onclick = function () { _editAskMeQ(b.getAttribute('data-editq')); };
        });
        body.querySelectorAll('[data-delq]').forEach(function (b) {
            b.onclick = function () { _delAskMeQ(b.getAttribute('data-delq')); };
        });
    }

    // —— 我问对方 ——
    function _rAskYou() {
        var html = '';

        // 编辑器
        if (_showEditor) {
            html += '<div class="sv-editor">'
                + '<div class="sv-editor-title">＋ 新建问卷</div>'
                + '<textarea id="sv-q-text" class="sv-q-input" rows="2" placeholder="问题内容，如：周末想一起做什么？">' + _esc(_edText) + '</textarea>'
                + '<div class="sv-editor-label">选项（至少 2 个）</div><div id="sv-editor-opts">';
            _edOptions.forEach(function (o, i) {
                html += '<div class="sv-opt-row">'
                    + '<input type="text" class="sv-opt-input" placeholder="选项 ' + String.fromCharCode(65 + i) + '" value="' + _esc(o) + '">'
                    + '<button class="sv-opt-del" data-delopt="' + i + '" title="移除"><i class="fas fa-times"></i></button>'
                    + '</div>';
            });
            html += '</div>'
                + '<button class="sv-add-opt-btn" id="sv-add-opt">＋ 添加一个选项</button>'
                + '<div class="sv-editor-label">作答方式</div>'
                + '<div class="sv-seg">'
                + '<button class="sv-seg-btn ' + (!_edMulti ? 'active' : '') + '" data-multi="0">单选</button>'
                + '<button class="sv-seg-btn ' + (_edMulti ? 'active' : '') + '" data-multi="1">多选</button>'
                + '</div>'
                + '<div class="sv-editor-label">回答问题的人（必选）</div>'
                + '<div class="sv-seg">'
                + '<button class="sv-seg-btn ' + (_edRespondent === 'partner' ? 'active' : '') + '" data-resp="partner">' + _esc(_pname()) + '（' + _esc(_pname()) + '）</button>'
                + '<button class="sv-seg-btn ' + (_edRespondent === 'me' ? 'active' : '') + '" data-resp="me">' + _esc(_mname()) + '（我）</button>'
                + '</div>'
                + '<div class="sv-btn-row">'
                + '<button class="sv-ghost-btn" id="sv-cancel-ed">取消</button>'
                + '<button class="sv-main-btn" id="sv-submit-ed"><i class="fas fa-paper-plane"></i> 发放问卷</button>'
                + '</div>'
                + '</div>';
        } else {
            html += '<button class="sv-new-btn" id="sv-new"><i class="fas fa-plus"></i> 新建问卷</button>';
        }

        // 问卷列表
        var pending = _data.askYou.filter(function (s) { return s.status === 'pending'; });
        var answered = _data.askYou.filter(function (s) { return s.status === 'answered'; });

        if (pending.length) {
            html += '<div class="sv-list-head"><span class="sv-count-tag">待回答 ' + pending.length + ' 份</span></div>';
            pending.forEach(function (sv) {
                var who = sv.respondent === 'partner' ? _pname() : _mname();
                html += '<div class="sv-card sv-pending-card" data-svcard="' + sv.id + '">'
                    + '<div class="sv-card-title"><i class="fas fa-hourglass-half"></i> 等 ' + _esc(who) + ' 回答 · ' + (sv.multi ? '多选' : '单选')
                    + (sv.respondent === 'partner' ? '<span class="sv-wait-tip">' + _esc(_pname()) + ' 正在想…</span>' : '')
                    + '</div>'
                    + '<div class="sv-question">「' + _esc(sv.text) + '」</div><div class="sv-opt-list">';
                sv.options.forEach(function (o, i) {
                    var picked = (_mePick[sv.id] || []).indexOf(i) >= 0;
                    html += '<button class="sv-opt-btn' + (picked ? ' picked' : '') + '"' + (sv.respondent === 'me' ? ' data-pick="' + sv.id + '|' + i + '"' : ' disabled') + '>'
                        + String.fromCharCode(65 + i) + '. ' + _esc(o) + '</button>';
                });
                html += '</div>';
                if (sv.respondent === 'me') {
                    html += '<div class="sv-btn-row"><button class="sv-main-btn" data-submitme="' + sv.id + '"><i class="fas fa-paper-plane"></i> 发送我的选择</button></div>';
                }
                html += '<div class="sv-q-actions-row"><button class="sv-act-btn sv-act-del" data-delsv="' + sv.id + '" title="删除"><i class="fas fa-trash-can"></i></button></div>'
                    + '</div>';
            });
        }

        if (answered.length) {
            html += '<div class="sv-list-head"><span class="sv-count-tag">已回答 ' + answered.length + ' 份</span></div>';
            answered.forEach(function (sv) {
                var who = sv.respondent === 'partner' ? _pname() : _mname();
                html += '<div class="sv-card sv-done-card">'
                    + '<div class="sv-card-title"><i class="fas fa-check-circle"></i> ' + _esc(who) + ' 已回答 · ' + _fmtTime(sv.answeredAt) + '</div>'
                    + '<div class="sv-question">「' + _esc(sv.text) + '」</div>'
                    + '<div class="sv-ans-line">答：' + sv.answer.map(_esc).join('、') + '</div>'
                    + '<div class="sv-q-actions-row"><button class="sv-act-btn sv-act-del" data-delsv="' + sv.id + '" title="删除"><i class="fas fa-trash-can"></i></button></div>'
                    + '</div>';
            });
        }

        if (!pending.length && !answered.length && !_showEditor) {
            html += '<div class="sv-empty"><div class="sv-empty-icon">📝</div><div>还没有问卷</div><div class="sv-empty-sub">点上方「新建问卷」向 ' + _esc(_pname()) + ' 或自己发起提问</div></div>';
        }
        return html;
    }
    function _bindAskYou(body) {
        var n = body.querySelector('#sv-new');
        if (n) n.onclick = _openEditor;
        var addOpt = body.querySelector('#sv-add-opt');
        if (addOpt) addOpt.onclick = _edAddOpt;
        body.querySelectorAll('[data-delopt]').forEach(function (b) {
            b.onclick = function () { _edRemoveOpt(parseInt(b.getAttribute('data-delopt'), 10)); };
        });
        body.querySelectorAll('[data-multi]').forEach(function (b) {
            b.onclick = function () { _edSetMulti(b.getAttribute('data-multi') === '1'); };
        });
        body.querySelectorAll('[data-resp]').forEach(function (b) {
            b.onclick = function () { _edSetRespondent(b.getAttribute('data-resp')); };
        });
        var cancel = body.querySelector('#sv-cancel-ed');
        if (cancel) cancel.onclick = function () { _showEditor = false; _render(); };
        var submit = body.querySelector('#sv-submit-ed');
        if (submit) submit.onclick = _edSubmit;
        body.querySelectorAll('[data-pick]').forEach(function (b) {
            b.onclick = function () {
                var p = b.getAttribute('data-pick').split('|');
                _mePickToggle(p[0], parseInt(p[1], 10));
            };
        });
        body.querySelectorAll('[data-submitme]').forEach(function (b) {
            b.onclick = function () { _submitMeAnswer(b.getAttribute('data-submitme')); };
        });
        body.querySelectorAll('[data-delsv]').forEach(function (b) {
            b.onclick = function () { _delSurvey(b.getAttribute('data-delsv')); };
        });
    }

    // —— 问题回顾 ——
    function _rHistory() {
        var html = '<div class="sv-list-head">'
            + '<span class="sv-count-tag">共 ' + _data.history.length + ' 条</span>'
            + (_data.history.length ? '<button class="sv-mini-btn sv-mini-danger" id="sv-clear-his">清空回顾</button>' : '')
            + '</div>';
        if (!_data.history.length) {
            html += '<div class="sv-empty"><div class="sv-empty-icon">🗂️</div><div>还没有记录</div><div class="sv-empty-sub">答过的问卷会自动归档在这里</div></div>';
        } else {
            _data.history.forEach(function (h) {
                var who = h.answerBy === 'partner' ? _pname() : (h.answerBy === 'me' ? _mname() : null);
                var typeTag = h.type === 'askMe'
                    ? '<span class="sv-type-tag sv-type-askme">梦角问我</span>'
                    : '<span class="sv-type-tag sv-type-askyou">我问梦角</span>';
                var ans = h.answerBy === 'none'
                    ? '<span class="sv-no-ans">未作答</span>'
                    : '<b>' + _esc(who) + '</b>：' + h.answer.map(_esc).join('、');
                // 回顾交互：未作答→补答；已作答→编辑答案
                var editBtn = h.answerBy === 'none'
                    ? '<button class="sv-mini-btn sv-mini-main" data-editans="' + h.id + '"><i class="fas fa-pen"></i> 补答</button>'
                    : '<button class="sv-mini-btn" data-editans="' + h.id + '"><i class="fas fa-pen"></i> 编辑答案</button>';
                html += '<div class="sv-his-card">'
                    + '<div class="sv-his-top">' + typeTag + '<span class="sv-his-time">' + _fmtTime(h.timestamp) + '</span>'
                    + '<button class="sv-act-btn sv-act-del" data-delhis="' + h.id + '" title="删除"><i class="fas fa-trash-can"></i></button></div>'
                    + '<div class="sv-question">「' + _esc(h.question) + '」</div>'
                    + '<div class="sv-ans-line">' + ans + '</div>'
                    + '<div class="sv-his-actions">' + editBtn + '</div>'
                    + '</div>';
            });
        }
        return html;
    }
    function _bindHistory(body) {
        var c = body.querySelector('#sv-clear-his');
        if (c) c.onclick = _clearHistory;
        body.querySelectorAll('[data-delhis]').forEach(function (b) {
            b.onclick = function () { _delHistory(b.getAttribute('data-delhis')); };
        });
        body.querySelectorAll('[data-editans]').forEach(function (b) {
            b.onclick = function () { _editHistoryAnswer(b.getAttribute('data-editans')); };
        });
    }

    // ── 入口 ──────────────────────────────────────────
    window._surveyOpen = async function () {
        if (!_loaded) await _load();
        var adv = document.getElementById('advanced-modal');
        if (adv && typeof hideModal === 'function') hideModal(adv);
        _render();
        var modal = document.getElementById('survey-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
    };

    // 打开问卷弹窗并定位到指定待答问卷（供聊天消息点击调用）
    window._surveyOpenQuestion = async function (surveyId) {
        if (!_loaded) await _load();
        // '__askme__' → 梦角问我（待答输入框）；null → 我问梦角第一个待答卡
        _view = (surveyId && surveyId !== '__askme__') ? 'askYou' : 'askMe';
        _render();
        var modal = document.getElementById('survey-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
        setTimeout(function () {
            var card;
            if (surveyId && surveyId !== '__askme__') {
                card = document.querySelector('[data-svcard="' + surveyId + '"]');
            } else if (surveyId === '__askme__') {
                card = document.getElementById('sv-askme-answer');
                if (card) card = card.closest('.sv-card');
            } else {
                card = document.querySelector('[data-svcard], #sv-askme-answer');
            }
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('sv-flash');
                setTimeout(function () { card.classList.remove('sv-flash'); }, 1800);
                if (surveyId === '__askme__') {
                    var input = document.getElementById('sv-askme-answer');
                    if (input) setTimeout(function () { input.focus(); }, 350);
                }
            }
        }, 250);
    };

    // 聊天消息点击：识别问卷打开提示，打开对应问卷答题界面
    (function _bindChatSurveyClick() {
        function bind() {
            var chat = document.getElementById('chat-container') || document.querySelector('.chat-container');
            if (!chat) return;
            chat.addEventListener('click', function (e) {
                // 情况1：显式 data-survey-open 按钮
                var el = e.target.closest('[data-survey-open]');
                if (el) {
                    var id = el.getAttribute('data-survey-open');
                    if (id && typeof window._surveyOpenQuestion === 'function') window._surveyOpenQuestion(id);
                    return;
                }
                // 情况2：点击包含"点我打开问卷答题"的问卷消息气泡
                var wrap = e.target.closest('.message-wrapper');
                if (wrap) {
                    var txt = wrap.innerText || '';
                    if (txt.indexOf('点我打开问卷答题') !== -1) {
                        // 区分类型：含"来答个小问卷"=梦角问我；否则=我问梦角(回答人=我)
                        if (txt.indexOf('来答个小问卷') !== -1) {
                            if (typeof window._surveyOpenQuestion === 'function') window._surveyOpenQuestion('__askme__');
                        } else {
                            if (typeof window._surveyOpenQuestion === 'function') window._surveyOpenQuestion(null);
                        }
                        return;
                    }
                }
            });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
    })();

    (function _bindEntry() {
        function bind() {
            var entry = document.getElementById('survey-function');
            if (entry) entry.addEventListener('click', function () { window._surveyOpen(); });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
    })();

    // 启动定时器 + 初始检查
    (function _boot() {
        function start() {
            _load().then(function () {
                _tick();
                if (_tickTimer) clearInterval(_tickTimer);
                _tickTimer = setInterval(_tick, 30000);
            });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    })();

    // 调试/测试接口
    window._surveyDebug = function () { return _data; };
})();
