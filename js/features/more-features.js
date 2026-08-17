/**
 * more-features.js — 主页"更多"面板 + 掷骰子 + 快速回复(对方发卡) + 对方来信时间
 *
 * 1. _partnerSayCard(text)：梦角从字卡库抽一张字卡，带"正在输入"后以对方身份发出。
 * 2. _openDiceRoll()：掷骰子（1-6点），转动动画结束后随机抽取，可选择发送到聊天。
 * 3. "对方来信时间"：在聊天设置-节奏中配置 x~y 小时，到点后梦角随机来信一条。
 */
(function () {
    'use strict';

    var _diceTimer = null;
    var _diceValue = null;
    var _diceOverlay = null;

    // ── 1. 快速回复：梦角从字卡库随机抽一张字卡发来 ──────────────────────
    function _showTyping() {
        try {
            if (typeof settings === 'undefined' || !settings || settings.typingIndicatorEnabled === false) return;
            var tiWrapper = document.getElementById('typing-indicator-wrapper');
            var tiLabel = document.getElementById('typing-indicator-label');
            var tiAvatar = document.getElementById('typing-indicator-avatar');
            if (tiLabel) tiLabel.textContent = (settings.partnerName || '对方') + ' 正在输入';
            if (tiWrapper) tiWrapper.style.display = 'block';
            if (tiAvatar) {
                var pa = document.getElementById('partner-avatar');
                if (pa) {
                    var img = pa.querySelector('img');
                    tiAvatar.innerHTML = img ? '<img src="' + img.src + '">' : '<i class="fas fa-user"></i>';
                }
            }
            // 尝试定位
            try { if (typeof window._repositionTypingIndicator === 'function') window._repositionTypingIndicator(); } catch (e) {}
            var inputArea = document.querySelector('.input-area-wrapper');
            if (inputArea) {
                var h = inputArea.offsetHeight;
                tiWrapper.style.bottom = h + 'px';
            }
        } catch (e) { console.warn('[more-features] showTyping', e); }
    }

    function _hideTyping() {
        try {
            if (window._typingIndicatorAutoHideTimer) {
                clearTimeout(window._typingIndicatorAutoHideTimer);
                window._typingIndicatorAutoHideTimer = null;
            }
            var tiW = document.getElementById('typing-indicator-wrapper');
            if (!tiW) return;
            var tiInner = tiW.querySelector('.typing-indicator');
            if (tiInner) {
                tiInner.classList.add('hiding');
                setTimeout(function () { tiW.style.display = 'none'; if (tiInner) tiInner.classList.remove('hiding'); }, 240);
            } else {
                tiW.style.display = 'none';
            }
        } catch (e) { console.warn('[more-features] hideTyping', e); }
    }

    window._partnerSayCard = function (text) {
        try {
            var finalText = String(text || '').trim();
            if (!finalText) {
                if (typeof simulateReply === 'function') simulateReply();
                return;
            }
            // 有 20% 概率混入一个自定义表情
            var customEmojis = (typeof window._customEmojis !== 'undefined' && window._customEmojis)
                ? window._customEmojis : ((typeof customEmojis !== 'undefined') ? customEmojis : []);
            if (Array.isArray(customEmojis) && customEmojis.length > 0 && Math.random() < 0.2) {
                var emoji = customEmojis[Math.floor(Math.random() * customEmojis.length)];
                finalText = Math.random() < 0.5 ? emoji + ' ' + finalText : finalText + ' ' + emoji;
            }
            var sender = (typeof settings !== 'undefined' && settings && settings.partnerName) || '对方';
            _showTyping();
            var delay = 1200 + Math.random() * 2000;
            setTimeout(function () {
                _hideTyping();
                if (typeof addMessage === 'function') {
                    addMessage({
                        id: Date.now(),
                        sender: sender,
                        text: finalText,
                        timestamp: new Date(),
                        status: 'received',
                        favorited: false,
                        note: null,
                        replyTo: null,
                        type: 'normal'
                    });
                }
                try { if (typeof playSound === 'function') playSound('message'); } catch (e) {}
                if (typeof window._sendPartnerNotification === 'function') {
                    try { window._sendPartnerNotification(sender, finalText); } catch (e) {}
                }
                try {
                    var chatC = document.getElementById('chat-container');
                    if (chatC) chatC.scrollTop = chatC.scrollHeight;
                } catch (e) {}
            }, delay);
        } catch (e) { console.warn('[quick-reply/partner] failed', e); }
    };

    // ── 2. 掷骰子 ─────────────────────────────────────────────────────────
    var _diceBound = false;   // 遮罩点击事件是否已绑定
    var _DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅']; // 骰子面 1~6

    function _openDiceRoll() {
        try {
            var overlay = document.getElementById('dice-overlay');
            if (!overlay) { console.warn('[dice] overlay not found'); return; }
            _diceOverlay = overlay;
            _diceValue = null;
            // 修复：必须同时设置 display 和 opacity，否则 coin-toss-overlay 类的 opacity:0 导致遮罩不可见
            overlay.style.display = 'flex';
            overlay.style.opacity = '1';
            overlay.classList.add('visible');

            var die = document.getElementById('dice-die');
            var face = document.getElementById('dice-result-face');
            var resultText = document.getElementById('dice-result-text');
            var actionArea = document.getElementById('dice-action-area');
            if (die) { die.classList.add('rolling'); }
            if (face) { face.textContent = '?'; face.style.fontSize = '64px'; }
            if (resultText) resultText.textContent = '掷骰中…';
            if (actionArea) actionArea.style.display = 'none';
            if (_diceTimer) { clearTimeout(_diceTimer); _diceTimer = null; }

            // 转动动画 ~1.6s，结束后随机 1~6
            _diceTimer = setTimeout(function () {
                try {
                    _diceValue = 1 + Math.floor(Math.random() * 6);
                    if (die) die.classList.remove('rolling');
                    // 使用骰子字符显示
                    if (face) { face.textContent = _DICE_FACES[_diceValue - 1]; face.style.fontSize = '80px'; }
                    if (resultText) resultText.textContent = '点数：' + _diceValue;
                    if (actionArea) actionArea.style.display = 'flex';
                } catch (e) { console.warn('[dice] reveal failed', e); }
            }, 1600);
        } catch (e) { console.warn('[dice] open failed', e); }
    }

    window._openDiceRoll = _openDiceRoll;

    function _closeDice() {
        try {
            var overlay = document.getElementById('dice-overlay');
            if (overlay) {
                overlay.style.display = 'none';
                overlay.style.opacity = '0';
                overlay.classList.remove('visible');
            }
            if (_diceTimer) { clearTimeout(_diceTimer); _diceTimer = null; }
            _diceValue = null;
            var die = document.getElementById('dice-die');
            if (die) die.classList.remove('rolling');
        } catch (e) { console.warn('[dice] close failed', e); }
    }

    function _bindDiceEvents() {
        var cancel = document.getElementById('cancel-dice-result');
        var retry = document.getElementById('retry-dice');
        var send = document.getElementById('send-dice-result');
        if (cancel && !cancel._diceBound) { cancel._diceBound = true; cancel.addEventListener('click', _closeDice); }
        if (retry && !retry._diceBound) { retry._diceBound = true; retry.addEventListener('click', function () { _openDiceRoll(); }); }
        if (send && !send._diceBound) {
            send._diceBound = true;
            send.addEventListener('click', function () {
                try {
                    if (_diceValue === null) return;
                    var diceChar = _DICE_FACES[_diceValue - 1] || '🎲';
                    var text = diceChar + ' 我掷出了 ' + _diceValue + ' 点';
                    if (typeof addMessage === 'function') {
                        addMessage({
                            id: Date.now(),
                            sender: 'user',   // 掷骰子由"我"发出
                            text: text,
                            timestamp: new Date(),
                            status: 'sent',
                            favorited: false,
                            note: null,
                            replyTo: null,
                            type: 'normal'
                        });
                        try { if (typeof playSound === 'function') playSound('send'); } catch (e) {}
                    }
                    // 触发梦角回复
                    try {
                        if (typeof window._triggerDelayedReply === 'function') {
                            window._triggerDelayedReply(true);
                        } else if (typeof simulateReply === 'function') {
                            simulateReply();
                        }
                    } catch (e) {}
                    _closeDice();
                } catch (e) { console.warn('[dice] send failed', e); }
            });
        }
        // 点击遮罩关闭：每次打开时也确保绑定一次（防模块变量初始为 null）
        var ov = document.getElementById('dice-overlay');
        if (ov && !ov._diceCloseBound) {
            ov._diceCloseBound = true;
            ov.addEventListener('click', function (e) {
                if (e.target === ov) _closeDice();
            });
        }
    }

    // ── 3. 对方来信时间 ─────────────────────────────────────────────────
    var _incomingTimer = null;

    function _partnerSendIncoming() {
        try {
            if (typeof window._triggerDelayedReply === 'function') {
                window._triggerDelayedReply(true);
            } else if (typeof simulateReply === 'function') {
                simulateReply();
            }
        } catch (e) {}
    }

    function _scheduleIncoming() {
        if (_incomingTimer) { clearTimeout(_incomingTimer); _incomingTimer = null; }
        if (typeof settings === 'undefined' || !settings || !settings.incomingMsgEnabled) return;
        var minH = Math.max(1, parseInt(settings.incomingMsgMinH, 10) || 2);
        var maxH = Math.max(minH, parseInt(settings.incomingMsgMaxH, 10) || 6);
        var hours = minH + Math.random() * (maxH - minH);
        var ms = hours * 3600 * 1000;
        _incomingTimer = setTimeout(function () {
            _partnerSendIncoming();
            // 再来一轮
            _scheduleIncoming();
        }, ms);
    }

    window._manageIncomingTimer = _scheduleIncoming;

    function _bindIncomingSettings() {
        var toggle = document.getElementById('incoming-msg-toggle');
        var control = document.getElementById('incoming-msg-control');
        var minSlider = document.getElementById('incoming-msg-min-slider');
        var maxSlider = document.getElementById('incoming-msg-max-slider');
        var minValue = document.getElementById('incoming-msg-min-value');
        var maxValue = document.getElementById('incoming-msg-max-value');
        if (!toggle || !control) return;

        function updateUI() {
            var on = !!(typeof settings !== 'undefined' && settings && settings.incomingMsgEnabled);
            toggle.classList.toggle('active', on);
            control.style.display = on ? 'block' : 'none';
            var minH = (typeof settings !== 'undefined' && settings && settings.incomingMsgMinH) || 2;
            var maxH = (typeof settings !== 'undefined' && settings && settings.incomingMsgMaxH) || 6;
            if (minSlider) minSlider.value = minH;
            if (maxSlider) maxSlider.value = maxH;
            if (minValue) minValue.textContent = minH + '小时';
            if (maxValue) maxValue.textContent = maxH + '小时';
        }

        updateUI();

        toggle.addEventListener('click', function () {
            if (typeof settings !== 'undefined' && settings) {
                settings.incomingMsgEnabled = !settings.incomingMsgEnabled;
            }
            updateUI();
            _scheduleIncoming();
            if (typeof throttledSaveData === 'function') throttledSaveData();
            if (typeof showNotification === 'function') {
                var on = !!(settings && settings.incomingMsgEnabled);
                showNotification('对方来信时间已' + (on ? '开启' : '关闭'), 'success');
            }
        });

        if (minSlider) {
            minSlider.addEventListener('input', function (e) {
                var v = parseInt(e.target.value, 10) || 2;
                if (settings) settings.incomingMsgMinH = v;
                if (minValue) minValue.textContent = v + '小时';
                // 保证 max >= min
                if (maxSlider && maxSlider.value < v) {
                    maxSlider.value = v;
                    if (settings) settings.incomingMsgMaxH = v;
                    if (maxValue) maxValue.textContent = v + '小时';
                }
            });
            minSlider.addEventListener('change', function () {
                if (typeof throttledSaveData === 'function') throttledSaveData();
                _scheduleIncoming();
            });
        }
        if (maxSlider) {
            maxSlider.addEventListener('input', function (e) {
                var v = parseInt(e.target.value, 10) || 6;
                if (settings) settings.incomingMsgMaxH = v;
                if (maxValue) maxValue.textContent = v + '小时';
                // 保证 min <= max
                if (minSlider && minSlider.value > v) {
                    minSlider.value = v;
                    if (settings) settings.incomingMsgMinH = v;
                    if (minValue) minValue.textContent = v + '小时';
                }
            });
            maxSlider.addEventListener('change', function () {
                if (typeof throttledSaveData === 'function') throttledSaveData();
                _scheduleIncoming();
            });
        }
    }

    // ── 初始化 ─────────────────────────────────────────────────────────
    function _init() {
        _bindDiceEvents();
        _bindIncomingSettings();
        _scheduleIncoming();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
    else _init();
})();
