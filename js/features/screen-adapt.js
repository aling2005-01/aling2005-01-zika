/**
 * screen-adapt.js — 屏幕适应设置
 * 在「聊天设置 → 界面适配」中调节底部/顶部安全区高度，
 * 避免与手机底部手势条 / 顶部刘海（状态栏）冲突。
 * 值保存于 localStorage，并动态应用到页面底部/顶部间距。
 */
(function () {
    'use strict';

    var KEY = 'screenSafeArea';
    var _bottom = 0;
    var _top = 0;

    function _load() {
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) {
                var o = JSON.parse(raw);
                _bottom = Math.max(0, parseInt(o.bottom, 10) || 0);
                _top = Math.max(0, parseInt(o.top, 10) || 0);
            }
        } catch (e) {}
    }

    function _save() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ bottom: _bottom, top: _top }));
        } catch (e) {}
    }

    // 应用安全区：给主界面与输入区加底部内边距；顶部给 header 加内边距
    function _apply() {
        // 底部：主输入区
        var inputArea = document.querySelector('.input-area');
        if (inputArea) {
            inputArea.style.paddingBottom = (_bottom > 0 ? _bottom : '') + 'px';
            inputArea.style.marginBottom = (_bottom > 0 ? _bottom : '') + 'px';
        }
        // 顶部：主头部栏
        var header = document.querySelector('.header, .chat-header, .app-header, [class*="header-bar"]');
        if (header) {
            header.style.paddingTop = (_top > 0 ? _top : '') + 'px';
        }
        // 安全区 CSS 变量，供其它地方引用
        document.documentElement.style.setProperty('--safe-bottom', (_bottom || 0) + 'px');
        document.documentElement.style.setProperty('--safe-top', (_top || 0) + 'px');
        // 悬浮音乐播放器位置微调（避开底部）
        var player = document.getElementById('player');
        if (player && _bottom > 0) {
            player.style.marginBottom = _bottom + 'px';
        }
    }

    function _bind() {
        var bottomRange = document.getElementById('safe-bottom-range');
        var topRange = document.getElementById('safe-top-range');
        var bottomVal = document.getElementById('safe-bottom-val');
        var topVal = document.getElementById('safe-top-val');
        var resetBtn = document.getElementById('safe-area-reset');
        if (!bottomRange || !topRange) return;

        bottomRange.value = _bottom;
        topRange.value = _top;
        if (bottomVal) bottomVal.textContent = _bottom;
        if (topVal) topVal.textContent = _top;

        bottomRange.addEventListener('input', function () {
            _bottom = parseInt(bottomRange.value, 10) || 0;
            if (bottomVal) bottomVal.textContent = _bottom;
            _apply();
            _save();
        });
        topRange.addEventListener('input', function () {
            _top = parseInt(topRange.value, 10) || 0;
            if (topVal) topVal.textContent = _top;
            _apply();
            _save();
        });
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                _bottom = 0; _top = 0;
                bottomRange.value = 0; topRange.value = 0;
                if (bottomVal) bottomVal.textContent = 0;
                if (topVal) topVal.textContent = 0;
                _apply();
                _save();
                if (typeof showNotification === 'function') showNotification('已恢复默认安全区', 'success');
            });
        }
    }

    function _init() {
        _load();
        _apply();
        _bind();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init);
    else _init();
})();
