/**
 * truth.js — 真心话模块
 * 入口：高级功能 → 真心话
 * 玩法：投硬币决定谁回答 → 随机抽题 →
 *   轮对方：对方从该题选项中随机选一个回答 → 之后从字卡库随机发 1~2 条
 *   轮玩家：玩家自行编辑答案 → 对方从字卡库随机发 1~2 条
 * 问题库支持自主编辑：添加 / 修改 / 删除问题与选项（每个问题必须至少 1 个选项）
 * 全程以聊天消息形式发送（参照陪伴"一起功能"的消息机制），昵称取主界面设置的梦角昵称。
 * 存储：localforage，key = <session前缀>_truthData
 */
(function () {
    'use strict';

    // ── 状态 ──────────────────────────────────────────
    // _data.questions: [ { id, text, options: [string, ...] } ]
    // _data.settings: { thinkingTexts:[], background:'' }
    var _data      = {
        questions: [],
        settings: {
            thinkingTexts: ['对方正在思考中…', '让我想想…', '这个问题有点难…', '嗯…要认真回答呢'],
            background: '',
            bgOpacity: 1
        }
    };
    var _loaded    = false;
    var _storageKey = null;

    var _view      = 'manage';       // manage | game
    var _editingId = null;           // 正在编辑的问题 id（null=新增）
    var _showEditor = false;

    // 游戏运行时
    var _gameQuestion = null;        // 本轮问题
    var _gameTurn     = null;        // 'partner' | 'user'
    var _pickTimer    = null;
    var _busy         = false;       // 对方回合动画进行中

    // 扑克牌抽题
    var _gameStage   = 'idle';       // idle | splash | coin | shuffle | deal | reveal | playing | done
    var _dealCards   = [];           // 洗牌后的扑克牌（含题目索引）
    var _thinkingPick = '';          // 本局抽到的思考文字
    var _showCards   = [];           // 本局抽到的字卡回复（直接显示在真心话界面）
    var _coinStarted = false;        // 掷硬币阶段是否已触发定时器
    var _shuffleStarted = false;     // 洗牌阶段是否已触发定时器

    // ── 存储 ──────────────────────────────────────────
    async function _getKey() {
        if (_storageKey) return _storageKey;
        try {
            var allKeys = await localforage.keys();
            var found = allKeys.find(function (k) { return k.indexOf('_truthData') !== -1; });
            if (found) { _storageKey = found; return found; }
            var msgKey = allKeys.find(function (k) { return k.indexOf('_messages') !== -1; });
            var prefix = msgKey ? msgKey.replace('_messages', '') : 'CHAT_APP_V3_';
            _storageKey = prefix + '_truthData';
        } catch (e) {
            _storageKey = 'CHAT_APP_V3__truthData';
        }
        return _storageKey;
    }

    async function _load() {
        try {
            var key = await _getKey();
            var saved = await localforage.getItem(key);
            if (saved && Array.isArray(saved.questions)) {
                _data = saved;
                if (!_data.settings) _data.settings = { thinkingTexts: ['对方正在思考中…', '让我想想…', '这个问题有点难…', '嗯…要认真回答呢'], background: '', bgOpacity: 1 };
                if (_data.settings.bgOpacity === undefined) _data.settings.bgOpacity = 1;
                if (!Array.isArray(_data.settings.thinkingTexts) || !_data.settings.thinkingTexts.length) {
                    _data.settings.thinkingTexts = ['对方正在思考中…'];
                }
            }
        } catch (e) { console.warn('[truth] load failed:', e); }
        _loaded = true;
    }

    async function _save() {
        try {
            var key = await _getKey();
            await localforage.setItem(key, _data);
        } catch (e) { console.warn('[truth] save failed:', e); }
    }

    // ── 工具 ──────────────────────────────────────────
    function _esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function _uid() { return 'tq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
    function _pname() {
        return (typeof settings !== 'undefined' && settings && settings.partnerName) || '对方';
    }

    // ── 消息发送（全部走聊天流） ──────────────────────
    function _sysMsg(text) {
        if (typeof addMessage !== 'function') return;
        addMessage({
            id: Date.now() + Math.floor(Math.random() * 1000),
            sender: null,
            text: text,
            timestamp: new Date(),
            type: 'system',
            status: 'sent',
            favorited: false,
            note: null
        });
    }

    function _partnerSay(text, delayMs) {
        setTimeout(function () {
            if (typeof addMessage !== 'function') return;
            addMessage({
                id: Date.now() + Math.floor(Math.random() * 1000),
                sender: _pname(),
                text: text,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                replyTo: null,
                type: 'normal'
            });
            if (typeof playSound === 'function') playSound('message');
        }, delayMs || 0);
    }

    function _userSay(text) {
        if (typeof addMessage !== 'function') return;
        addMessage({
            id: Date.now() + Math.floor(Math.random() * 1000),
            sender: 'user',
            text: text,
            timestamp: new Date(),
            status: 'sent',
            favorited: false,
            note: null,
            replyTo: null,
            type: 'normal'
        });
        if (typeof playSound === 'function') playSound('send');
    }

    // 字卡库可用池（过滤屏蔽项，逻辑与 simulateReply 保持一致）
    function _cardPool() {
        var pool = ((typeof customReplies !== 'undefined') ? customReplies : (window._customReplies || [])).slice();
        try {
            var raw = localStorage.getItem('disabledReplyItems');
            if (raw) {
                var dis = new Set(JSON.parse(raw));
                pool = pool.filter(function (r) { return !dis.has(r); });
            }
        } catch (e) {}
        (window.customReplyGroups || []).forEach(function (g) {
            if (g.disabled && Array.isArray(g.items)) {
                var s = new Set(g.items);
                pool = pool.filter(function (r) { return !s.has(r); });
            }
        });
        return pool.map(String).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    // 增量添加字卡到 DOM（不触发全量重渲染）
    function _appendCardToDOM(text) {
        var body = document.getElementById('truth-body');
        if (!body) { _render(); return; }
        var container = body.querySelector('.truth-cards-inline');
        if (!container) {
            // 容器不存在，需要全量渲染创建
            _render();
            return;
        }
        var msg = document.createElement('div');
        msg.className = 'truth-card-msg';
        msg.textContent = text;
        container.appendChild(msg);
    }

    // 从字卡库随机发 1~3 条（delayMs 之后逐条浮现，每条间隔1.5秒，渐入）
    // showInUI=true 时直接显示在真心话界面内（不返聊天窗口）
    function _sendRandomCards(baseDelay, showInUI) {
        var pool = _cardPool();
        if (!pool.length) return;
        var n = 1 + Math.floor(Math.random() * 3); // 1~3 条
        if (n > pool.length) n = pool.length;
        var picked = [];
        var copy = pool.slice();
        for (var i = 0; i < n && copy.length; i++) {
            picked.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
        }
        if (showInUI) {
            // 逐条添加到 DOM（增量更新，避免全量重渲染导致动画重播）
            picked.forEach(function (text, idx) {
                setTimeout(function () {
                    _showCards.push(text);
                    _appendCardToDOM(text);
                }, (baseDelay || 3000) + idx * 1500);
            });
            return picked.length;
        }
        picked.forEach(function (text, idx) {
            _partnerSay(text, (baseDelay || 3000) + idx * 1500);
        });
        return picked.length;
    }

    // ── 游戏流程（扑克牌抽题） ──────────────────────────
    // 阶段：deal(展示洗牌后的扑克牌背面) → 点击抽取 → drawn(翻开显示题目) → 掷硬币 → playing → done

    function _shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function _startGame() {
        var usable = _data.questions.filter(function (q) { return q.text && q.options && q.options.length; });
        if (!usable.length) {
            if (typeof showNotification === 'function') showNotification('请先添加真心话问题（每个问题至少配一个选项）', 'info', 3500);
            return;
        }
        _gameQuestion = null;
        _lastPick = -1;
        _showCards = [];
        _coinStarted = false;
        _shuffleStarted = false;
        _dealCards = _shuffle(usable);
        _gameTurn = null;
        _gameStage = 'coin';
        _stage = 'coin';
        _view = 'game';
        _sysMsg('🃏 真心话开始！');
        _render();
    }

    // 掷硬币决定谁回答（在洗牌抽题之前）
    function _flipCoin() {
        _gameTurn = Math.random() < 0.5 ? 'partner' : 'user';
        var whoText = _gameTurn === 'partner' ? _pname() + '来回答' : '你来回答';
        _sysMsg('🪙 ' + whoText);
        // 随机抽取一条思考文字（对方回合用）
        var tts = _data.settings && _data.settings.thinkingTexts && _data.settings.thinkingTexts.length
            ? _data.settings.thinkingTexts : ['对方正在思考中…'];
        _thinkingPick = tts[Math.floor(Math.random() * tts.length)];
    }

    // 洗牌动画结束，展示背面供点击抽取
    function _showDealCards() {
        _setGameStage('deal');
        // 对方回答时，自动随机抽取一张牌
        if (_gameTurn === 'partner' && _dealCards.length) {
            var idx = Math.floor(Math.random() * _dealCards.length);
            _drawCard(idx);
        } else {
            _render();
        }
    }

    // 点击抽取某张牌 → 翻开题目
    function _drawCard(index) {
        if (_gameStage !== 'deal') return;
        if (!_dealCards[index]) return;
        _gameQuestion = _dealCards[index];
        _setGameStage('reveal');
        _render();
        // 短暂展示牌面题目后进入正式作答
        setTimeout(function () {
            _setGameStage('playing');
            _render();
            if (_gameTurn === 'partner') _partnerTurn();
            else _userTurn();
        }, 1400);
    }

    // 对方回合：屏蔽选项选择界面 → 显示思考文字（仅文字无动画） → 延迟后仅显示选中答案（渐入放大） → 字卡3秒后逐条渐入
    function _partnerTurn() {
        var q = _gameQuestion;
        if (!q) return;
        // 玩家（提问方）把问题发出去
        _userSay(q.text);
        // 随机选取答案
        var finalIdx = Math.floor(Math.random() * q.options.length);
        var thinkingDelay = 2500 + Math.floor(Math.random() * 1500);
        _lastPick = -1;   // 思考中，不显示任何选中
        setTimeout(function () {
            _lastPick = finalIdx;
            _setGameStage('done');
            // 字卡在答案发出后3秒逐条渐入浮现
            _sendRandomCards(3000, true);
            _render();
        }, thinkingDelay);
        _render();  // 立即显示思考文字（仅文字，无动画）
    }

    // 玩家回合：对方发问 → 玩家编辑答案提交 → 对方字卡显示在界面内
    function _userTurn() {
        var q = _gameQuestion;
        if (!q) return;
        _partnerSay('真心话时间：' + q.text, 0);
        _render();
        // 焦点答案框
        setTimeout(function () {
            var input = document.getElementById('truth-answer-input');
            if (input) input.focus();
        }, 200);
    }

    function _submitAnswer() {
        if (_gameTurn !== 'user' || _gameStage !== 'playing') return;
        var input = document.getElementById('truth-answer-input');
        var val = input ? input.value.trim() : '';
        if (!val) {
            if (typeof showNotification === 'function') showNotification('先写下你的答案吧', 'info');
            return;
        }
        _userSay(val);
        _setGameStage('done');
        _sendRandomCards(3000, true);
        _render();
    }

    // 游戏子阶段：idle | deal | drawn | coin | playing | done
    var _stage = 'idle';
    var _lastPick = -1;
    function _setGameStage(s) { _stage = s; _gameStage = s; }

    function _highlightOption(idx, isFinal) {
        if (isFinal) _lastPick = idx;
        var wrap = document.getElementById('truth-options-game');
        if (!wrap) return;
        wrap.querySelectorAll('.truth-opt-btn').forEach(function (b, i) {
            b.classList.toggle('truth-opt-hl', i === idx && !isFinal);
            if (isFinal && i === idx) b.classList.add('truth-opt-final');
        });
    }

    // ── 编辑操作 ──────────────────────────────────────
    function _saveEditor() {
        var textEl = document.getElementById('truth-q-text');
        var text = textEl ? textEl.value.trim() : '';
        if (!text) {
            if (typeof showNotification === 'function') showNotification('问题内容不能为空', 'error');
            return;
        }
        var opts = [];
        document.querySelectorAll('.truth-opt-input').forEach(function (inp) {
            var v = inp.value.trim();
            if (v) opts.push(v);
        });
        if (!opts.length) {
            if (typeof showNotification === 'function') showNotification('每个问题至少需要一个选项', 'error');
            return;
        }
        if (_editingId) {
            var q = _data.questions.find(function (x) { return x.id === _editingId; });
            if (q) { q.text = text; q.options = opts; }
        } else {
            _data.questions.unshift({ id: _uid(), text: text, options: opts });
        }
        _save();
        _showEditor = false;
        _editingId = null;
        if (typeof showNotification === 'function') showNotification('✓ 已保存', 'success');
        _render();
    }

    function _editQuestion(id) {
        var q = _data.questions.find(function (x) { return x.id === id; });
        if (!q) return;
        _editingId = id;
        _showEditor = true;
        _view = 'manage';
        _render();
    }

    function _deleteQuestion(id) {
        var q = _data.questions.find(function (x) { return x.id === id; });
        if (!q) return;
        if (!confirm('删除问题「' + q.text + '」及其全部选项？')) return;
        _data.questions = _data.questions.filter(function (x) { return x.id !== id; });
        _save();
        _render();
    }

    // ── 渲染 ──────────────────────────────────────────
    function _render() {
        var body = document.getElementById('truth-body');
        if (!body) return;
        if (_view === 'game') _renderGame(body);
        else _renderManage(body);
    }

    function _renderManage(body) {
        var html = '';

        // ── 编辑器（添加/修改问题） ──
        if (_showEditor) {
            var q = _editingId ? _data.questions.find(function (x) { return x.id === _editingId; }) : null;
            html += '<div class="truth-editor">'
                + '<div class="truth-editor-title">' + (_editingId ? '✎ 修改问题' : '＋ 新增问题') + '</div>'
                + '<textarea id="truth-q-text" class="truth-q-input" rows="2" placeholder="问题内容，如：最喜欢对方哪一点？">' + _esc(q ? q.text : '') + '</textarea>'
                + '<div class="truth-editor-label">选项（对方回答时将随机选取一个；至少 1 个）</div>'
                + '<div id="truth-editor-opts">';
            var opts = q ? q.options : ['', '', ''];
            opts.forEach(function (o) {
                html += _optInputRow(o);
            });
            html += '</div>'
                + '<button class="truth-add-opt-btn" onclick="window._truthAddOpt()">＋ 添加一个选项</button>'
                + '<div class="truth-editor-btns">'
                + '<button class="truth-btn-ghost" onclick="window._truthCancelEditor()">取消</button>'
                + '<button class="truth-btn-main" onclick="window._truthSaveEditor()">保存问题</button>'
                + '</div>'
                + '</div>';
        }

        // ── 题库列表 ──
        html += '<div class="truth-list-head">'
            + '<span class="truth-count-tag">题库 ' + _data.questions.length + ' 题</span>'
            + '<div style="display:flex;gap:6px;">'
            + '<button class="truth-btn-ghost truth-btn-sm" onclick="window._truthOpenSettings()"><i class="fas fa-cog"></i> 设置</button>'
            + '<button class="truth-btn-main" id="truth-start-btn"><i class="fas fa-coins"></i> 开始一局</button>'
            + '</div>'
            + '</div>';

        if (!_data.questions.length) {
            html += '<div class="truth-empty">'
                + '<div class="truth-empty-icon">🪙</div>'
                + '<div>题库还是空的</div>'
                + '<div class="truth-empty-sub">点上方「新增问题」创建你的真心话题库<br>每个问题配上若干选项，就可以开始玩了</div>'
                + '</div>';
        } else {
            _data.questions.forEach(function (item) {
                var chips = (item.options || []).map(function (o) {
                    return '<span class="truth-opt-chip">' + _esc(o) + '</span>';
                }).join('');
                html += '<div class="truth-q-card">'
                    + '<div class="truth-q-text-row">' + _esc(item.text) + '</div>'
                    + '<div class="truth-q-opts">' + chips + '</div>'
                    + '<div class="truth-q-actions">'
                    + '<button class="truth-act-btn" onclick="window._truthEdit(\'' + item.id + '\')" title="修改"><i class="fas fa-pen"></i></button>'
                    + '<button class="truth-act-btn truth-act-del" onclick="window._truthDelete(\'' + item.id + '\')" title="删除"><i class="fas fa-trash-can"></i></button>'
                    + '</div>'
                    + '</div>';
            });
        }

        // 新增按钮（编辑器未打开时显示）
        if (!_showEditor) {
            html += '<button class="truth-new-q-btn" onclick="window._truthNewQ()"><i class="fas fa-plus"></i> 新增问题</button>';
        }

        body.innerHTML = html;

        var startBtn = body.querySelector('#truth-start-btn');
        if (startBtn) startBtn.onclick = _startGame;

        // 编辑器打开时聚焦问题框
        if (_showEditor) {
            setTimeout(function () {
                var t = document.getElementById('truth-q-text');
                if (t && !_editingId) t.focus();
            }, 100);
        }
    }

    function _optInputRow(val) {
        return '<div class="truth-opt-row">'
            + '<input type="text" class="truth-opt-input" placeholder="选项内容" value="' + _esc(val) + '">'
            + '<button class="truth-opt-del" onclick="window._truthRemoveOpt(this)" title="移除"><i class="fas fa-times"></i></button>'
            + '</div>';
    }

    function _renderGame(body) {
        var pname = _pname();
        var bg = (_data.settings && _data.settings.background) || '';
        var bgOpacity = (_data.settings && _data.settings.bgOpacity !== undefined) ? _data.settings.bgOpacity : 1;

        var html = '<div class="truth-game' + (bg ? ' truth-has-bg' : '') + '">';
        // 背景图透明度叠加层
        if (bg) {
            html += '<div class="truth-bg-overlay" style="position:absolute;inset:0;background-image:url(\'' + bg + '\');background-size:cover;background-position:center;opacity:' + bgOpacity + ';z-index:0;border-radius:inherit;pointer-events:none;"></div>';
            html += '<div style="position:relative;z-index:1;">';
        }

        // 掷硬币阶段：3D 翻转动画，与抉择投掷硬币一致
        if (_stage === 'coin') {
            var pnameCoin = _pname();
            html += '<div class="truth-coin-area">'
                + '<div class="coin-container" style="margin-bottom:20px;filter:drop-shadow(0 20px 30px rgba(0,0,0,0.15));">'
                + '<div class="coin" id="truth-coin-3d">'
                + '<div class="coin-face coin-front">'
                + '<div class="coin-text-main">我</div>'
                + '<div class="coin-text-sub">ME</div>'
                + '</div>'
                + '<div class="coin-face coin-back">'
                + '<div class="coin-text-main">' + _esc(pnameCoin.length > 4 ? pnameCoin.slice(0, 4) : pnameCoin) + '</div>'
                + '<div class="coin-text-sub">PARTNER</div>'
                + '</div>'
                + '</div>'
                + '</div>'
                + '<div class="coin-result-container" style="min-height:40px;">'
                + '<div class="coin-result-text" id="truth-coin-result">' + (_gameTurn ? (_gameTurn === 'user' ? '你来回答' : _esc(pnameCoin) + '来回答') : '掷硬币决定谁回答…') + '</div>'
                + '</div>'
                + '</div>';
            html += '<div class="truth-game-footer"><button class="truth-btn-ghost" onclick="window._truthBackManage()">返回题库</button></div>';
            if (bg) html += '</div>';
            html += '</div>';
            body.innerHTML = html;
            if (!_coinStarted) {
                _coinStarted = true;
                // 延迟开始翻转动画（与抉择硬币一致）
                setTimeout(function () {
                    _flipCoin();
                    // 启动 3D 翻转动画
                    var coinEl = document.getElementById('truth-coin-3d');
                    var resultEl = document.getElementById('truth-coin-result');
                    if (coinEl) {
                        var isHeads = _gameTurn === 'user'; // 正面=我=玩家回答
                        coinEl.classList.remove('flipping-heads', 'flipping-tails');
                        void coinEl.offsetWidth; // 强制重排
                        coinEl.classList.add(isHeads ? 'flipping-heads' : 'flipping-tails');
                        // 3秒后显示结果（与抉择硬币动画时长一致）
                        setTimeout(function () {
                            coinEl.classList.remove('flipping-heads', 'flipping-tails');
                            coinEl.style.transform = isHeads ? 'rotateY(0deg)' : 'rotateY(180deg)';
                            if (resultEl) {
                                resultEl.textContent = isHeads ? '你来回答' : _esc(pnameCoin) + '来回答';
                            }
                            if (typeof playSound === 'function') playSound('favorite');
                        }, 3050);
                    }
                    // 动画结束后进入洗牌阶段
                    setTimeout(function () {
                        _gameStage = 'shuffle'; _stage = 'shuffle';
                        _render();
                    }, 3700);
                }, 600);
            }
            return;
        }

        // 洗牌动画：掷硬币之后，扑克牌洗牌特效，结束后展示背面
        if (_stage === 'shuffle') {
            html += '<div class="truth-shuffle-area">'
                + '<div class="truth-shuffle-title">' + _esc(_gameTurn === 'user' ? '你来回答' : _pname() + '来回答') + ' · 正在洗牌…</div>'
                + '<div class="truth-shuffle-cards">';
            for (var si = 0; si < 6; si++) {
                html += '<div class="truth-shuffle-card" style="animation-delay:' + (si * 0.09) + 's">'
                    + '<div class="truth-card-inner"><div class="truth-card-back-face">♠♥♦♣<br>?</div></div>'
                    + '</div>';
            }
            html += '</div>'
                + '<div class="truth-shuffle-sub">洗牌中…</div>'
                + '</div>';
            html += '<div class="truth-game-footer"><button class="truth-btn-ghost" onclick="window._truthBackManage()">返回题库</button></div>';
            if (bg) html += '</div>';
            html += '</div>';
            body.innerHTML = html;
            if (!_shuffleStarted) {
                _shuffleStarted = true;
                setTimeout(function () { _showDealCards(); }, 1700);
            }
            return;
        }

        // 发牌阶段：展示洗好的扑克牌背面，点击抽取
        if (_stage === 'deal') {
            var whoDeal = _gameTurn === 'partner' ? _pname() : '你';
            html += '<div class="truth-deal-head">' + _esc(whoDeal) + ' 来抽一张真心话牌 🃏</div>';
            html += '<div class="truth-card-row">';
            var shown = _dealCards.slice(0, Math.min(6, _dealCards.length));
            shown.forEach(function (card, i) {
                var realIdx = _dealCards.indexOf(card);
                html += '<div class="truth-card truth-card-back truth-deal-card" onclick="window._truthDrawCard(' + realIdx + ')">'
                    + '<div class="truth-card-inner"><div class="truth-card-back-face">♠♥♦♣<br>?</div></div>'
                    + '</div>';
            });
            html += '</div>';
            html += '<div class="truth-deal-tip">点击任意一张扑克牌，抽取本局问题</div>';
            html += '<div class="truth-game-footer"><button class="truth-btn-ghost" onclick="window._truthBackManage()">返回题库</button></div>';
            if (bg) html += '</div>';
            html += '</div>';
            body.innerHTML = html;
            return;
        }

        // 已抽取：翻开牌面显示题目
        if (_stage === 'reveal') {
            html += '<div class="truth-card-reveal">'
                + '<div class="truth-card truth-card-front">'
                + '<div class="truth-card-front-top">真心话</div>'
                + '<div class="truth-card-front-q">' + _esc(_gameQuestion.text) + '</div>'
                + '<div class="truth-card-front-bottom">♠ ♥ ♦ ♣</div>'
                + '</div>'
                + '<div class="truth-reveal-sub">' + _esc(_gameTurn === 'partner' ? _pname() + ' 正在准备回答…' : '轮到你了，请回答…') + '</div>'
                + '</div>';
            html += '<div class="truth-game-footer"><button class="truth-btn-ghost" onclick="window._truthBackManage()">返回题库</button></div>';
            if (bg) html += '</div>';
            html += '</div>';
            body.innerHTML = html;
            return;
        }

        // 正式游戏（playing / done）
        var q = _gameQuestion;
        html += '<div class="truth-game-q">「' + _esc(q.text) + '」</div>';
        if (_gameTurn === 'partner') {
            // 对方回合
            if (_stage === 'done') {
                // 仅显示选中答案，不显示未选选项，渐入放大动画
                html += '<div class="truth-game-sub">' + _esc(pname) + ' 的回答</div>';
                var pickedAnswer = (_lastPick >= 0 && q.options[_lastPick]) ? q.options[_lastPick] : q.options[0];
                html += '<div class="truth-opt-final-show">'
                    + '<button class="truth-opt-btn truth-opt-final">' + _esc(pickedAnswer) + '</button>'
                    + '</div>';
                // 字卡回复容器（始终存在，便于增量添加）
                html += '<div class="truth-cards-inline">';
                _showCards.forEach(function (c) {
                    html += '<div class="truth-card-msg">' + _esc(c) + '</div>';
                });
                html += '</div>';
            } else {
                // 仅显示思考文字，完全隐藏动画
                html += '<div class="truth-thinking">'
                    + '<div class="truth-thinking-text">' + _esc(_thinkingPick) + '</div>'
                    + '</div>';
            }
        } else if (_gameTurn === 'user') {
            // 玩家回合
            if (_stage === 'done') {
                html += '<div class="truth-game-sub">答案已发出，' + _esc(pname) + ' 正在翻字卡回应你… ✦</div>';
                // 字卡回复容器（始终存在，便于增量添加）
                html += '<div class="truth-cards-inline">';
                _showCards.forEach(function (c) {
                    html += '<div class="truth-card-msg">' + _esc(c) + '</div>';
                });
                html += '</div>';
            } else {
                html += '<textarea id="truth-answer-input" class="truth-answer-input" rows="3" placeholder="写下你的答案…"></textarea>'
                    + '<button class="truth-btn-main" style="width:100%;margin-top:8px;" onclick="window._truthSubmitAnswer()"><i class="fas fa-paper-plane"></i> 提交答案</button>';
            }
        }

        html += '<div class="truth-game-footer">';
        if (_stage === 'done') {
            html += '<button class="truth-btn-main" onclick="window._truthStartGame()"><i class="fas fa-coins"></i> 再来一局</button>';
        }
        html += '<button class="truth-btn-ghost" onclick="window._truthBackManage()">返回题库</button>'
            + '</div>';

        if (bg) html += '</div>'; // 关闭背景内容包裹层
        html += '</div>';

        body.innerHTML = html;
        // 玩家回合聚焦
        if (_gameTurn === 'user' && _stage === 'playing') {
            setTimeout(function () {
                var input = document.getElementById('truth-answer-input');
                if (input) input.focus();
            }, 200);
        }
    }

    // ── 公开 API（供 onclick 调用） ────────────────────
    window._truthStartGame    = function () { _gameStage = 'coin'; _stage = 'coin'; _gameTurn = null; _lastPick = -1; _startGame(); };
    window._truthDrawCard     = _drawCard;
    window._truthBackManage   = function () {
        clearInterval(_pickTimer); _pickTimer = null; _busy = false;
        _coinStarted = false; _shuffleStarted = false; _showCards = [];
        _view = 'manage'; _gameTurn = null; _gameStage = 'coin'; _stage = 'coin'; _render();
    };
    window._truthNewQ         = function () { _editingId = null; _showEditor = true; _render(); };
    window._truthEdit         = _editQuestion;
    window._truthDelete       = _deleteQuestion;
    window._truthSaveEditor   = _saveEditor;
    window._truthCancelEditor = function () { _showEditor = false; _editingId = null; _render(); };
    window._truthAddOpt       = function () {
        var wrap = document.getElementById('truth-editor-opts');
        if (wrap) wrap.insertAdjacentHTML('beforeend', _optInputRow(''));
    };
    window._truthRemoveOpt = function (btn) {
        var row = btn.closest('.truth-opt-row');
        if (row) row.remove();
    };
    window._truthSubmitAnswer = _submitAnswer;

    // ── 真心话设置：换背景 + 思考文字编辑 + 透明度调节 ──────────
    window._truthOpenSettings = function () {
        _render();
        // 渲染思考文字列表
        var list = document.getElementById('truth-thinking-list');
        if (list) {
            var tts = (_data.settings && _data.settings.thinkingTexts) || ['对方正在思考中…'];
            list.innerHTML = tts.map(function (t, i) {
                return '<div class="ts-thinking-row">'
                    + '<input type="text" class="ts-thinking-input" value="' + _esc(t) + '" maxlength="40">'
                    + '<button class="ts-thinking-del" onclick="window._truthDelThinking(' + i + ')" title="删除"><i class="fas fa-times"></i></button>'
                    + '</div>';
            }).join('');
        }
        // 显示/隐藏透明度滑块
        var opacitySection = document.getElementById('ts-bg-opacity-section');
        var opacitySlider = document.getElementById('ts-bg-opacity-slider');
        var opacityVal = document.getElementById('ts-bg-opacity-val');
        var hasBg = !!(_data.settings && _data.settings.background);
        if (opacitySection) opacitySection.style.display = hasBg ? 'block' : 'none';
        if (opacitySlider) {
            var op = (_data.settings && _data.settings.bgOpacity !== undefined) ? _data.settings.bgOpacity : 1;
            opacitySlider.value = Math.round(op * 100);
        }
        if (opacityVal) opacityVal.textContent = Math.round(((_data.settings && _data.settings.bgOpacity !== undefined) ? _data.settings.bgOpacity : 1) * 100) + '%';
        var setModal = document.getElementById('truth-settings-modal');
        if (setModal && typeof showModal === 'function') showModal(setModal);
    };
    window._truthSetBackground = function (url) {
        _data.settings.background = url || '';
        _save();
        _render();
    };
    window._truthUploadBackground = function (input) {
        var file = input && input.files && input.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) { if (typeof showNotification === 'function') showNotification('请选择图片文件', 'error'); return; }
        var reader = new FileReader();
        reader.onload = function () {
            _data.settings.background = reader.result;
            _save();
            _render();
            // 显示透明度滑块
            var opacitySection = document.getElementById('ts-bg-opacity-section');
            if (opacitySection) opacitySection.style.display = 'block';
            if (typeof showNotification === 'function') showNotification('✓ 背景已更换，可在下方调节透明度', 'success');
        };
        reader.readAsDataURL(file);
    };
    window._truthClearBackground = function () {
        _data.settings.background = '';
        _data.settings.bgOpacity = 1;
        _save();
        _render();
        var opacitySection = document.getElementById('ts-bg-opacity-section');
        if (opacitySection) opacitySection.style.display = 'none';
    };
    // 背景透明度预览
    window._truthBgOpacityPreview = function (val) {
        var valEl = document.getElementById('ts-bg-opacity-val');
        if (valEl) valEl.textContent = val + '%';
    };
    // 背景透明度保存
    window._truthBgOpacitySave = function (val) {
        _data.settings.bgOpacity = Number(val) / 100;
        _save();
        _render();
    };
    // 思考文字管理
    window._truthAddThinking = function () {
        var tts = _data.settings && _data.settings.thinkingTexts || (_data.settings.thinkingTexts = []);
        tts.push('对方正在思考中…');
        _save();
        _render();
    };
    window._truthDelThinking = function (idx) {
        var tts = _data.settings && _data.settings.thinkingTexts;
        if (!tts || !tts.length) return;
        tts.splice(idx, 1);
        if (!tts.length) tts.push('对方正在思考中…');
        _save();
        _render();
    };
    window._truthSaveThinkingTexts = function () {
        var list = document.getElementById('truth-thinking-list');
        if (!list) return;
        var arr = [];
        list.querySelectorAll('input').forEach(function (inp) {
            var v = inp.value.trim();
            if (v) arr.push(v);
        });
        if (!arr.length) arr = ['对方正在思考中…'];
        _data.settings.thinkingTexts = arr;
        _save();
        if (typeof showNotification === 'function') showNotification('✓ 思考文字已保存', 'success');
        _render();
    };

    // 调试/测试接口
    window._truthDebug = function () {
        return {
            stage: _stage, gameStage: _gameStage,
            dealCards: _dealCards.length, gameQuestion: _gameQuestion,
            gameTurn: _gameTurn, coinStarted: _coinStarted, shuffleStarted: _shuffleStarted,
            showCards: _showCards.slice()
        };
    };

    // 打开弹窗（高级功能入口）
    window._truthOpen = async function () {
        if (!_loaded) await _load();
        var adv = document.getElementById('advanced-modal');
        if (adv && typeof hideModal === 'function') hideModal(adv);
        _view = 'manage'; _showEditor = false;
        _render();
        var modal = document.getElementById('truth-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
    };

    // 高级功能入口绑定
    (function _bindEntry() {
        function bind() {
            var entry = document.getElementById('truth-function');
            if (entry) entry.addEventListener('click', function () { window._truthOpen(); });
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
        else bind();
    })();

})();
