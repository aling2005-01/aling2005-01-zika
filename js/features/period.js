/**
 * period.js — 经期记录功能（完整版）
 * 数据持久化 + 日历渲染 + 统计预测 + 手动记录起止日期 + 出血量 + 痛经程度 + 梦角留言
 * 入口：高级功能 → 经期记录（#period-function → #period-modal）
 */
(function () {
    'use strict';

    // ── 常量 ──────────────────────────────────────────
    var DEFAULT_SYMPTOMS = ['痛经', '腰酸', '头痛', '疲惫', '胸胀', '恶心'];
    var FLOW_LABELS      = ['', '极少', '少', '正常', '多', '极多'];
    var PAIN_LABELS      = ['无痛', '轻微', '中度', '重度'];
    var WEEKDAYS         = ['日', '一', '二', '三', '四', '五', '六'];

    // ── 内存状态 ──────────────────────────────────────
    // _data 结构：
    // {
    //   periods: [ { id, startDate, endDate|null, flow:1-5|null, pain:0-3|null } ],
    //   dailyRecords: { 'YYYY-MM-DD': { flow:0-5, pain:0-3, symptoms:[] } },
    //   customSymptoms: [],
    //   partnerMsg: { periodId, lines:[] } | null,
    //   notifyAt: timestamp | null,
    //   notifyPeriodId: string | null
    // }
    var _data   = { periods: [], dailyRecords: {}, customSymptoms: [], partnerMsg: null, notifyAt: null, notifyPeriodId: null, partnerNotes: [] };
    var _loaded = false;
    var _viewYear, _viewMonth;   // 0-based month

    var _currentFlow     = 0;    // 今日记录 - 出血量
    var _currentPain     = null; // 今日记录 - 痛经程度（null=未选）
    var _currentSymptoms = [];   // 今日记录 - 症状

    var _dayDate     = null;     // 弹层当前编辑的日期
    var _dayFlow     = 0;
    var _dayPain     = null;
    var _daySymptoms = [];

    var _manualFlow = 0;         // 手动补录 - 整体出血量
    var _manualPain = null;      // 手动补录 - 整体痛经程度

    var _longPressTimer = null;
    var _storageKey     = null;
    var _initBound      = false;

    // ── Storage ───────────────────────────────────────
    async function _getKey() {
        if (_storageKey) return _storageKey;
        try {
            var allKeys = await localforage.keys();
            var found = allKeys.find(function (k) { return k.indexOf('_periodData') !== -1; });
            if (found) { _storageKey = found; return found; }
            var msgKey = allKeys.find(function (k) { return k.indexOf('_messages') !== -1; });
            var prefix = msgKey ? msgKey.replace('_messages', '') : 'CHAT_APP_V3_';
            _storageKey = prefix + '_periodData';
        } catch (e) {
            _storageKey = 'CHAT_APP_V3__periodData';
        }
        return _storageKey;
    }

    async function _load() {
        try {
            var key = await _getKey();
            var saved = await localforage.getItem(key);
            if (saved && saved.periods) {
                _data = saved;
                if (!_data.dailyRecords)   _data.dailyRecords   = {};
                if (!_data.customSymptoms) _data.customSymptoms = [];
                if (!_data.periods)        _data.periods        = [];
                if (!Array.isArray(_data.partnerNotes)) _data.partnerNotes = [];
            }
        } catch (e) { console.warn('[period] load failed:', e); }
        _loaded = true;
    }

    async function _save() {
        try {
            var key = await _getKey();
            await localforage.setItem(key, _data);
        } catch (e) { console.warn('[period] save failed:', e); }
    }

    // ── 日期工具 ──────────────────────────────────────
    function _pad(n) { return String(n).padStart(2, '0'); }
    function _toStr(d) { return d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate()); }
    function _today()  { return _toStr(new Date()); }
    function _parse(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
    function _diff(a, b) { return Math.round((_parse(b) - _parse(a)) / 86400000); }
    function _addD(s, n) { var d = _parse(s); d.setDate(d.getDate() + n); return _toStr(d); }
    function _fmtCN(s) { var d = _parse(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }

    // ── Period 查询 ───────────────────────────────────
    function _getPeriodOf(dateStr) {
        return _data.periods.find(function (p) {
            if (dateStr < p.startDate) return false;
            if (p.endDate)  return dateStr <= p.endDate;
            return dateStr <= _today();
        }) || null;
    }
    function _isInPeriod(dateStr) { return !!_getPeriodOf(dateStr); }
    function _getDayNum(dateStr) {
        var p = _getPeriodOf(dateStr);
        return p ? _diff(p.startDate, dateStr) + 1 : 0;
    }
    function _activePeriod() {
        return _data.periods.find(function (p) { return !p.endDate; }) || null;
    }
    function _sortedPeriods() {
        return _data.periods.slice().sort(function (a, b) { return a.startDate < b.startDate ? -1 : 1; });
    }

    // ── 统计 ──────────────────────────────────────────
    function _gapsInfo() {
        var sorted = _sortedPeriods();
        var gaps = [];
        for (var i = 1; i < sorted.length; i++) {
            gaps.push(_diff(sorted[i - 1].startDate, sorted[i].startDate));
        }
        return { sorted: sorted, gaps: gaps };
    }

    function _calcStats() {
        var info      = _gapsInfo();
        var completed = _data.periods.filter(function (p) { return p.endDate; });

        // 平均经期天数
        var avgDays = '--';
        if (completed.length > 0) {
            var total = completed.reduce(function (s, p) { return s + _diff(p.startDate, p.endDate) + 1; }, 0);
            avgDays = Math.round(total / completed.length) + '天';
        }

        // 平均周期长度
        var avgCycle = '--';
        if (info.gaps.length > 0) {
            avgCycle = Math.round(info.gaps.reduce(function (a, b) { return a + b; }, 0) / info.gaps.length) + '天';
        }

        // 预测下次
        var nextDate = '暂无预测';
        if (info.sorted.length >= 2) {
            var avgCycleNum = Math.round(info.gaps.reduce(function (a, b) { return a + b; }, 0) / info.gaps.length);
            var lastStart   = info.sorted[info.sorted.length - 1].startDate;
            var predStart   = _addD(lastStart, avgCycleNum);

            if (info.gaps.length >= 2 && (Math.max.apply(null, info.gaps) - Math.min.apply(null, info.gaps)) > 7) {
                var minD = _parse(_addD(lastStart, Math.min.apply(null, info.gaps)));
                var maxD = _parse(_addD(lastStart, Math.max.apply(null, info.gaps)));
                nextDate = (minD.getMonth() + 1) + '月' + minD.getDate() + '日 ~ ' +
                           (maxD.getMonth() + 1) + '月' + maxD.getDate() + '日';
            } else {
                nextDate = _fmtCN(predStart);
            }
        }

        return { avgDays: avgDays, avgCycle: avgCycle, nextDate: nextDate };
    }

    function _predictedDates() {
        var info = _gapsInfo();
        if (info.sorted.length < 2) return [];

        var avgCycleNum = Math.round(info.gaps.reduce(function (a, b) { return a + b; }, 0) / info.gaps.length);
        var completed   = info.sorted.filter(function (p) { return p.endDate; });
        var avgDur = completed.length > 0
            ? Math.round(completed.reduce(function (s, p) { return s + _diff(p.startDate, p.endDate) + 1; }, 0) / completed.length)
            : 5;

        var predStart = _addD(info.sorted[info.sorted.length - 1].startDate, avgCycleNum);
        var dates = [];
        for (var d = 0; d < avgDur; d++) dates.push(_addD(predStart, d));
        return dates;
    }

    // ── 经期操作 ──────────────────────────────────────
    function _startPeriod(dateStr, sendNotif) {
        if (_isInPeriod(dateStr)) return false;
        var active = _activePeriod();
        if (active) active.endDate = _addD(dateStr, -1);  // 自动结束上次
        _data.periods.push({ id: 'pd_' + Date.now(), startDate: dateStr, endDate: null, flow: null, pain: null });
        _save();
        if (sendNotif) _scheduleNotif();
        return true;
    }

    function _endPeriod(dateStr) {
        var active = _activePeriod();
        if (!active || dateStr < active.startDate) return false;
        active.endDate = dateStr;
        _save();
        return true;
    }

    function _deletePeriod(id) {
        _data.periods = _data.periods.filter(function (p) { return p.id !== id; });
        _save();
    }

    function _toggleHistory(dateStr) {
        var p = _getPeriodOf(dateStr);
        if (p) {
            if (p.startDate === dateStr) {
                _deletePeriod(p.id);
            } else {
                p.endDate = _addD(dateStr, -1);
                _save();
            }
        } else {
            _data.periods.push({ id: 'pd_' + Date.now(), startDate: dateStr, endDate: dateStr, flow: null, pain: null });
            _save();
        }
    }

    // 手动添加一段经期（含校验），返回 { ok, msg }
    function _addManualPeriod(start, end, flow, pain) {
        if (!start) return { ok: false, msg: '请先选择开始日期' };
        var today = _today();
        if (start > today) return { ok: false, msg: '开始日期不能晚于今天' };
        if (end) {
            if (end < start)     return { ok: false, msg: '结束日期不能早于开始日期' };
            if (end > today)     return { ok: false, msg: '结束日期不能晚于今天' };
        }
        var rangeEnd = end || today;
        // 与已有记录重叠检测
        var overlap = _data.periods.some(function (p) {
            var pe = p.endDate || today;
            return start <= pe && rangeEnd >= p.startDate;
        });
        if (overlap) return { ok: false, msg: '这段日期与已有的经期记录重叠了' };

        _data.periods.push({
            id: 'pd_' + Date.now(),
            startDate: start,
            endDate: end || null,
            flow: flow || null,
            pain: (pain === null || pain === undefined) ? null : pain
        });
        _save();
        return { ok: true, msg: '已保存' };
    }

    // ── 通知（梦角留言） ──────────────────────────────
    function _scheduleNotif() {
        var active = _activePeriod();
        if (!active) return;
        if (_data.notifyPeriodId === active.id) return;
        _data.notifyAt       = Date.now() + (20 + Math.floor(Math.random() * 11)) * 60000;
        _data.notifyPeriodId = active.id;
        _save();
    }

    function _checkNotif() {
        if (!_data.notifyAt || !_data.notifyPeriodId) return;
        if (Date.now() < _data.notifyAt) return;
        if (_data.partnerMsg && _data.partnerMsg.periodId === _data.notifyPeriodId) return;

        var replies = (window._customReplies) ||
                      (typeof customReplies !== 'undefined' ? customReplies : []) || [];
        if (!replies.length) return;

        var shuffled = replies.slice().sort(function () { return Math.random() - 0.5; });
        var lines    = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));

        _data.partnerMsg = { periodId: _data.notifyPeriodId, lines: lines };
        _data.notifyAt   = null;
        _save();

        _showPdNotif(lines);
        _renderLetterCard();
    }

    function _showPdNotif(lines) {
        var existing = document.getElementById('pd-notif-popup');
        if (existing) existing.remove();

        var pname = _partnerName();
        var popup = document.createElement('div');
        popup.id = 'pd-notif-popup';
        popup.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
            'background:var(--secondary-bg);border:1px solid var(--border-color);' +
            'border-radius:20px;padding:18px 20px;z-index:9000;max-width:320px;width:88%;' +
            'box-shadow:0 8px 32px rgba(0,0,0,0.18);display:flex;flex-direction:column;gap:12px;';
        popup.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:26px;">🌸</span>' +
                '<div>' +
                    '<div style="font-size:14px;font-weight:700;color:var(--text-primary);">' + pname + ' 有话想说</div>' +
                    '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;opacity:0.8;">去经期记录里看看</div>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button onclick="document.getElementById(\'pd-notif-popup\').remove();" ' +
                    'style="flex:1;padding:8px 0;border-radius:12px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-secondary);font-size:13px;cursor:pointer;font-family:inherit;">稍后</button>' +
                '<button onclick="window._pdOpenModal();document.getElementById(\'pd-notif-popup\').remove();" ' +
                    'style="flex:2;padding:8px 0;border-radius:12px;border:none;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">立即查看 ✦</button>' +
            '</div>';
        document.body.appendChild(popup);
        setTimeout(function () { if (popup.parentNode) popup.remove(); }, 8000);
    }

    // 打开经期记录弹窗（入口 / 通知跳转共用）
    window._pdOpenModal = async function () {
        var adv = document.getElementById('advanced-modal');
        if (adv && typeof hideModal === 'function') hideModal(adv);
        await window._pdInit();
        // 每次打开随机选一条小纸条
        _pickRandomNote();
        _renderLetterCard();
        var modal = document.getElementById('period-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
    };

    // 兼容旧通知跳转入口
    window._pdGoToPeriodTab = window._pdOpenModal;

    // ── UI 渲染 ───────────────────────────────────────
    function _updateStats() {
        var s   = _calcStats();
        var nEl = document.getElementById('pd-next-date');
        var aEl = document.getElementById('pd-avg-days');
        var cEl = document.getElementById('pd-avg-cycle');
        if (nEl) nEl.textContent = s.nextDate;
        if (aEl) aEl.textContent = s.avgDays;
        if (cEl) cEl.textContent = s.avgCycle;
    }

    function _updateToggleBtn() {
        var track = document.getElementById('pd-toggle-btn');
        var label = document.getElementById('pd-toggle-label');
        if (!track || !label) return;
        var inP = _isInPeriod(_today());
        track.classList.toggle('pd-toggle-on', inP);
        label.textContent = inP ? '经期中' : '标记经期';
    }

    function _setTrackActive(trackEl, val) {
        if (!trackEl) return;
        trackEl.querySelectorAll('button').forEach(function (btn) {
            btn.classList.toggle(trackEl.classList.contains('pd-pain-track') ? 'pd-pain-active' : 'pd-flow-active',
                                 Number(btn.dataset.val) === val);
        });
    }

    function _updateStatusCard() {
        var today  = _today();
        var dayTag = document.getElementById('pd-status-day-tag');
        var dateEl = document.getElementById('pd-status-date');
        var now    = new Date();
        if (dateEl) dateEl.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日';

        if (dayTag) {
            var dayNum = _getDayNum(today);
            if (dayNum > 0) {
                dayTag.textContent   = '经期第' + dayNum + '天';
                dayTag.style.display = '';
            } else {
                dayTag.style.display = 'none';
            }
        }

        // 载入今天已有的记录
        var rec = _data.dailyRecords[today];
        _currentFlow     = rec ? (rec.flow || 0) : 0;
        _currentPain     = rec ? (rec.pain === undefined ? null : rec.pain) : null;
        _currentSymptoms = rec ? (rec.symptoms ? rec.symptoms.slice() : []) : [];

        _setTrackActive(document.getElementById('pd-flow-track'), _currentFlow);
        if (_currentPain !== null) _setTrackActive(document.getElementById('pd-pain-track'), _currentPain);

        _updateSaveBtn(!!rec);
        _renderSymptomChips(document.getElementById('pd-symptoms-wrap'), _currentSymptoms, 'window._pdToggleSymptom');
    }

    function _updateSaveBtn(saved) {
        var btn  = document.getElementById('pd-save-btn');
        var hint = document.getElementById('pd-saved-hint');
        if (!btn) return;
        if (saved) {
            btn.textContent   = '已保存';
            btn.disabled      = true;
            btn.style.opacity = '0.5';
            if (hint) hint.textContent = '';
        } else {
            btn.textContent   = '保存记录';
            btn.disabled      = false;
            btn.style.opacity = '';
        }
    }

    // ── 日历 ──────────────────────────────────────────
    function _renderCalendar() {
        var label = document.getElementById('pd-month-label');
        if (label) label.textContent = _viewYear + '年' + (_viewMonth + 1) + '月';

        var grid = document.getElementById('pd-cal-grid');
        if (!grid) return;

        var firstDay    = new Date(_viewYear, _viewMonth, 1).getDay();
        var daysInMonth = new Date(_viewYear, _viewMonth + 1, 0).getDate();
        var today       = _today();
        var predicted   = _predictedDates();

        var html = '';
        var prevTotal = new Date(_viewYear, _viewMonth, 0).getDate();
        for (var i = firstDay - 1; i >= 0; i--) {
            var ds = _toStr(new Date(_viewYear, _viewMonth - 1, prevTotal - i));
            html += _cellHtml(prevTotal - i, ds, today, predicted, true);
        }
        for (var d = 1; d <= daysInMonth; d++) {
            var ds2 = _toStr(new Date(_viewYear, _viewMonth, d));
            html += _cellHtml(d, ds2, today, predicted, false);
        }
        var total = firstDay + daysInMonth;
        var nextDays = total % 7 === 0 ? 0 : 7 - (total % 7);
        for (var n = 1; n <= nextDays; n++) {
            var ds3 = _toStr(new Date(_viewYear, _viewMonth + 1, n));
            html += _cellHtml(n, ds3, today, predicted, true);
        }

        grid.innerHTML = html;
        _bindCalCells(grid);
    }

    function _cellHtml(day, dateStr, today, predicted, otherMonth) {
        var cls = 'pd-cal-cell';
        if (otherMonth) cls += ' pd-other-month';
        if (dateStr === today) cls += ' pd-today';
        if (_isInPeriod(dateStr)) cls += ' pd-period';
        else if (predicted.indexOf(dateStr) !== -1) cls += ' pd-predict';
        var dot = (!otherMonth && _data.dailyRecords[dateStr] && !_isInPeriod(dateStr) && predicted.indexOf(dateStr) === -1)
            ? '<span class="pd-cal-dot"></span>' : '';
        return '<div class="' + cls + '" data-date="' + dateStr + '">' + day + dot + '</div>';
    }

    function _refreshAll() {
        _renderCalendar();
        _updateStats();
        _updateToggleBtn();
        _updateStatusCard();
    }

    function _bindCalCells(grid) {
        grid.querySelectorAll('.pd-cal-cell').forEach(function (cell) {
            var dateStr = cell.dataset.date;
            if (!dateStr) return;
            var otherMonth = cell.classList.contains('pd-other-month');

            // 长按历史日期：标记/取消整段经期
            if (!otherMonth) {
                cell.addEventListener('touchstart', function () {
                    _longPressTimer = setTimeout(function () {
                        _longPressTimer = null;
                        cell._longPressed = true;
                        if (dateStr <= _today()) {
                            _toggleHistory(dateStr);
                            _refreshAll();
                        }
                    }, 600);
                }, { passive: true });
                cell.addEventListener('touchend', function () {
                    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
                });
                cell.addEventListener('touchmove', function () {
                    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
                });
                // 桌面端：鼠标长按
                cell.addEventListener('mousedown', function () {
                    _longPressTimer = setTimeout(function () {
                        _longPressTimer = null;
                        cell._longPressed = true;
                        if (dateStr <= _today()) {
                            _toggleHistory(dateStr);
                            _refreshAll();
                        }
                    }, 600);
                });
                cell.addEventListener('mouseup', function () {
                    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
                });
                cell.addEventListener('mouseleave', function () {
                    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
                });
            }

            // 单击
            cell.addEventListener('click', function () {
                if (cell._longPressed) { cell._longPressed = false; return; }
                if (otherMonth) return;
                var today = _today();
                if (dateStr === today) {
                    var card = document.getElementById('pd-status-card');
                    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    _openDaySheet(dateStr);
                }
            });
        });
    }

    // ── 单日记录弹层 ──────────────────────────────────
    function _openDaySheet(dateStr) {
        _dayDate     = dateStr;
        var d        = _parse(dateStr);
        var titleEl  = document.getElementById('pd-day-sheet-title');
        if (titleEl) titleEl.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WEEKDAYS[d.getDay()];

        var dayNum = _getDayNum(dateStr);
        var tagEl  = document.getElementById('pd-day-period-tag');
        var rowEl  = document.getElementById('pd-day-info-row');
        if (tagEl) { tagEl.textContent = '经期第' + dayNum + '天'; }
        if (rowEl) rowEl.style.display = dayNum > 0 ? '' : 'none';

        // 载入已有记录
        var rec = _data.dailyRecords[dateStr];
        _dayFlow     = rec ? (rec.flow || 0) : 0;
        _dayPain     = rec ? (rec.pain === undefined ? null : rec.pain) : null;
        _daySymptoms = rec ? (rec.symptoms ? rec.symptoms.slice() : []) : [];

        _setTrackActive(document.getElementById('pd-day-flow-track'), _dayFlow);
        if (_dayPain !== null) _setTrackActive(document.getElementById('pd-day-pain-track'), _dayPain);
        _renderSymptomChips(document.getElementById('pd-day-symptoms-wrap'), _daySymptoms, 'window._pdToggleDaySymptom');

        var emptyEl = document.getElementById('pd-day-empty');
        if (emptyEl) emptyEl.style.display = rec ? 'none' : '';

        var future = dateStr > _today();
        var tipEl  = document.getElementById('pd-day-tip');
        if (tipEl) tipEl.textContent = future
            ? '未来的日期只能看看预测哦，先选个过去的日子记录吧'
            : '提示：长按日历上的历史日期也可以快速标记/取消整段经期';
        _updateDayMarkBtn(dateStr, future);

        var sheet   = document.getElementById('pd-day-sheet');
        var overlay = document.getElementById('pd-sheet-overlay');
        if (sheet)   sheet.classList.add('pd-sheet-open');
        if (overlay) overlay.classList.add('pd-on');
    }

    function _updateDayMarkBtn(dateStr, future) {
        var btn = document.getElementById('pd-day-mark-btn');
        if (!btn) return;
        btn.disabled = false;
        btn.style.opacity = '';
        if (future) {
            btn.textContent = '📍 不能选择未来的日期';
            btn.disabled    = true;
            btn.style.opacity = '0.45';
            return;
        }
        var p = _getPeriodOf(dateStr);
        if (!p) {
            btn.textContent = '📍 从这天开始记录经期';
            btn.dataset.mode = 'start';
        } else if (!p.endDate) {
            btn.textContent = '🏁 在这天结束经期';
            btn.dataset.mode = 'end';
        } else {
            btn.textContent = '🗑 取消这段经期记录';
            btn.dataset.mode = 'delete';
        }
    }

    // ── 症状渲染 ──────────────────────────────────────
    function _renderSymptomChips(wrap, activeList, handlerName) {
        if (!wrap) return;
        var all = DEFAULT_SYMPTOMS.concat(_data.customSymptoms || []);
        var html = all.map(function (s) {
            var on = activeList.indexOf(s) !== -1;
            return '<button class="pd-symptom-chip' + (on ? ' pd-chip-on' : '') +
                   '" onclick="' + handlerName + '(this)">' + s + '</button>';
        }).join('');
        html += '<button class="pd-symptom-add" onclick="window._pdAddSymptom()">+ 自定义</button>';
        wrap.innerHTML = html;
    }

    // ── 梦角留言 ──────────────────────────────────────
    function _partnerName() {
        return (typeof settings !== 'undefined' && settings.partnerName) ||
               (window._settings && window._settings.partnerName) || '梦角';
    }

    var _randomNote = '';  // 每次打开页面时随机选中的一条小纸条

    function _pickRandomNote() {
        if (_data.partnerNotes && _data.partnerNotes.length) {
            _randomNote = _data.partnerNotes[Math.floor(Math.random() * _data.partnerNotes.length)];
        } else {
            _randomNote = '';
        }
    }

    function _renderLetterCard() {
        var pname  = _partnerName();
        var nameEl = document.getElementById('pd-letter-name');
        if (nameEl) nameEl.textContent = pname;

        // 头像
        var avEl  = document.getElementById('pd-partner-av');
        var imgEl = document.getElementById('partner-avatar');
        if (avEl && imgEl && imgEl.src && imgEl.src.indexOf('data:') === 0) {
            avEl.innerHTML = '<img src="' + imgEl.src + '">';
        }

        var emptyEl = document.getElementById('pd-letter-empty');
        var linesEl = document.getElementById('pd-letter-lines');

        // 优先显示用户自编辑的小纸条（随机出现）
        if (_randomNote) {
            if (emptyEl) emptyEl.style.display = 'none';
            if (linesEl) {
                linesEl.style.display = '';
                linesEl.innerHTML = '<div class="pd-letter-line">' + _escHtml(_randomNote) + '</div>';
            }
            return;
        }

        // 回退到自动生成的梦角留言
        var active = _activePeriod() || (_data.periods.length ? _data.periods[_data.periods.length - 1] : null);
        var hasMsg = _data.partnerMsg && active && _data.partnerMsg.periodId === active.id;

        if (hasMsg && _data.partnerMsg.lines && _data.partnerMsg.lines.length) {
            if (emptyEl) emptyEl.style.display = 'none';
            if (linesEl) {
                linesEl.style.display = '';
                linesEl.innerHTML = _data.partnerMsg.lines.map(function (l) {
                    return '<div class="pd-letter-line">' + l + '</div>';
                }).join('');
            }
        } else {
            if (emptyEl) emptyEl.style.display = '';
            if (linesEl) linesEl.style.display = 'none';
        }
    }

    function _escHtml(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ── 历史记录页 ────────────────────────────────────
    function _periodAgg(p) {
        var maxFlow = 0, maxPain = 0;
        var allSymptoms = {};
        Object.keys(_data.dailyRecords).forEach(function (dateStr) {
            var bp = _getPeriodOf(dateStr);
            if (!bp || bp.id !== p.id) return;
            var r = _data.dailyRecords[dateStr];
            if (r.flow > maxFlow) maxFlow = r.flow;
            if ((r.pain || 0) > maxPain) maxPain = r.pain || 0;
            (r.symptoms || []).forEach(function (s) { allSymptoms[s] = true; });
        });
        return { maxFlow: maxFlow, maxPain: maxPain, symptoms: Object.keys(allSymptoms) };
    }

    function _renderHistory() {
        var body = document.getElementById('pd-history-body');
        if (!body) return;

        var sorted = _sortedPeriods().reverse();
        if (!sorted.length) {
            body.innerHTML = '<div style="padding:48px 24px;text-align:center;color:var(--text-secondary);font-size:13px;opacity:0.6;">' +
                '<div style="font-size:34px;margin-bottom:10px;opacity:0.4;">🌸</div>暂无经期历史记录<br>' +
                '<span style="font-size:11px;">回到日历页标记或手动记录一次经期吧</span></div>';
            return;
        }

        var byMonth = {}, monthOrder = [];
        sorted.forEach(function (p) {
            var d  = _parse(p.startDate);
            var mk = d.getFullYear() + '-' + (d.getMonth() + 1);
            if (!byMonth[mk]) { byMonth[mk] = []; monthOrder.push(mk); }
            byMonth[mk].push(p);
        });

        var html = '';
        monthOrder.forEach(function (mk) {
            var pts = mk.split('-');
            html += '<div class="pd-hist-month">· ' + pts[0] + '年' + pts[1] + '月 ·</div>';
            byMonth[mk].forEach(function (p) {
                var sd   = _parse(p.startDate);
                var ed   = p.endDate ? _parse(p.endDate) : null;
                var days = ed ? _diff(p.startDate, p.endDate) + 1 : null;
                var range = ed
                    ? (sd.getMonth() + 1) + '月' + sd.getDate() + '日 - ' + (ed.getMonth() + 1) + '月' + ed.getDate() + '日（' + days + '天）'
                    : (sd.getMonth() + 1) + '月' + sd.getDate() + '日起（进行中）';

                var agg       = _periodAgg(p);
                var showFlow  = p.flow || agg.maxFlow;
                var showPain  = (p.pain !== null && p.pain !== undefined) ? p.pain : agg.maxPain;
                var chipsHtml = '';
                if (showFlow) chipsHtml += '<span class="pd-hist-chip">出血量：' + FLOW_LABELS[showFlow] + '</span>';
                if (showPain) chipsHtml += '<span class="pd-hist-chip">痛经：' + PAIN_LABELS[showPain] + '</span>';
                agg.symptoms.slice(0, 3).forEach(function (s) { chipsHtml += '<span class="pd-hist-chip">' + s + '</span>'; });
                if (agg.symptoms.length > 3) chipsHtml += '<span class="pd-hist-chip">+' + (agg.symptoms.length - 3) + '</span>';
                if (!chipsHtml) chipsHtml = '<span style="font-size:11px;color:var(--text-secondary);opacity:0.6;">暂无详细记录</span>';

                html += '<div class="pd-hist-entry">' +
                    '<div class="pd-hist-date-col">' +
                        '<div class="pd-hist-day">' + sd.getDate() + '</div>' +
                        '<div class="pd-hist-weekday">' + WEEKDAYS[sd.getDay()] + '</div>' +
                    '</div>' +
                    '<div class="pd-hist-content">' +
                        '<div class="pd-hist-range">' + range + '</div>' +
                        '<div class="pd-hist-meta">' + chipsHtml + '</div>' +
                    '</div>' +
                    '<div class="pd-hist-icon">🌸</div>' +
                    '<button class="pd-hist-del" title="删除这条记录" onclick="window._pdDeletePeriod(\'' + p.id + '\')"><i class="fas fa-trash-can"></i></button>' +
                '</div>';
            });
        });
        body.innerHTML = html;
    }

    // ── 公开 API：今日记录 ────────────────────────────
    window._pdToggleToday = function () {
        var today = _today();
        if (_isInPeriod(today)) {
            _endPeriod(today);
        } else {
            _startPeriod(today, true);
        }
        _refreshAll();
        _renderLetterCard();
    };

    window._pdSetFlow = function (val, btn) {
        _currentFlow = Number(val);
        _setTrackActive(document.getElementById('pd-flow-track'), _currentFlow);
        _updateSaveBtn(false);
    };

    window._pdSetPain = function (val, btn) {
        _currentPain = Number(val);
        _setTrackActive(document.getElementById('pd-pain-track'), _currentPain);
        _updateSaveBtn(false);
    };

    window._pdToggleSymptom = function (btn) {
        btn.classList.toggle('pd-chip-on');
        var s   = btn.textContent;
        var idx = _currentSymptoms.indexOf(s);
        if (idx === -1) _currentSymptoms.push(s); else _currentSymptoms.splice(idx, 1);
        _updateSaveBtn(false);
    };

    // ── 公开 API：手动记录一次经期 ────────────────────
    window._pdSetManualFlow = function (btn) {
        _manualFlow = Number(btn.dataset.val);
        _setTrackActive(document.getElementById('pd-manual-flow-track'), _manualFlow);
    };

    window._pdSetManualPain = function (btn) {
        _manualPain = Number(btn.dataset.val);
        _setTrackActive(document.getElementById('pd-manual-pain-track'), _manualPain);
    };

    window._pdManualSave = function () {
        var startEl = document.getElementById('pd-manual-start');
        var endEl   = document.getElementById('pd-manual-end');
        var hintEl  = document.getElementById('pd-manual-hint');
        var hint    = function (msg, ok) {
            if (!hintEl) return;
            hintEl.textContent = msg;
            hintEl.style.color = ok ? 'var(--accent-color)' : '#e5484d';
            if (msg) setTimeout(function () { hintEl.textContent = ''; }, 3500);
        };

        var res = _addManualPeriod(
            startEl ? startEl.value.trim() : '',
            endEl ? endEl.value.trim() : '',
            _manualFlow,
            _manualPain
        );
        if (!res.ok) { hint(res.msg, false); return; }

        // 清空表单
        if (startEl) startEl.value = '';
        if (endEl)   endEl.value = '';
        _manualFlow = 0; _manualPain = null;
        _setTrackActive(document.getElementById('pd-manual-flow-track'), 0);
        var mpTrack = document.getElementById('pd-manual-pain-track');
        if (mpTrack) mpTrack.querySelectorAll('button').forEach(function (b) { b.classList.remove('pd-pain-active'); });

        hint('已保存这条经期记录 ✓', true);
        _refreshAll();
        _renderLetterCard();
    };

    // ── 公开 API：单日记录弹层 ────────────────────────
    window._pdSetDayFlow = function (btn) {
        _dayFlow = Number(btn.dataset.val);
        _setTrackActive(document.getElementById('pd-day-flow-track'), _dayFlow);
    };

    window._pdSetDayPain = function (btn) {
        _dayPain = Number(btn.dataset.val);
        _setTrackActive(document.getElementById('pd-day-pain-track'), _dayPain);
    };

    window._pdToggleDaySymptom = function (btn) {
        btn.classList.toggle('pd-chip-on');
        var s   = btn.textContent;
        var idx = _daySymptoms.indexOf(s);
        if (idx === -1) _daySymptoms.push(s); else _daySymptoms.splice(idx, 1);
    };

    window._pdSaveDayRecord = function () {
        if (!_dayDate) return;
        if (_dayDate > _today()) return;
        _data.dailyRecords[_dayDate] = { flow: _dayFlow, pain: (_dayPain === null ? 0 : _dayPain), symptoms: _daySymptoms.slice() };
        _save();
        var emptyEl = document.getElementById('pd-day-empty');
        if (emptyEl) emptyEl.style.display = 'none';
        _renderCalendar();
        _updateStatusCard();
    };

    window._pdDayDeleteRecord = function () {
        if (!_dayDate) return;
        delete _data.dailyRecords[_dayDate];
        _save();
        _openDaySheet(_dayDate);  // 重渲染为空状态
        _renderCalendar();
        _updateStatusCard();
    };

    window._pdDayTogglePeriod = function () {
        if (!_dayDate) return;
        var btn  = document.getElementById('pd-day-mark-btn');
        var mode = btn ? btn.dataset.mode : '';
        var done = false;
        if (mode === 'start')      done = _startPeriod(_dayDate, true);
        else if (mode === 'end')   done = _endPeriod(_dayDate);
        else if (mode === 'delete') {
            var p = _getPeriodOf(_dayDate);
            if (p) { _deletePeriod(p.id); done = true; }
        }
        if (done) {
            _refreshAll();
            _renderLetterCard();
            _openDaySheet(_dayDate);  // 刷新弹层状态
        }
    };

    window._pdOpenDaySheet  = _openDaySheet;
    window._pdCloseDaySheet = function () {
        var sheet   = document.getElementById('pd-day-sheet');
        var overlay = document.getElementById('pd-sheet-overlay');
        if (sheet)   sheet.classList.remove('pd-sheet-open');
        if (overlay) overlay.classList.remove('pd-on');
    };

    // ── 公开 API：症状自定义 / 历史 / 删除 ────────────
    window._pdAddSymptom = function () {
        var val = prompt('输入自定义症状名称：');
        if (!val || !val.trim()) return;
        val = val.trim();
        if (!_data.customSymptoms) _data.customSymptoms = [];
        if (DEFAULT_SYMPTOMS.indexOf(val) === -1 && _data.customSymptoms.indexOf(val) === -1) {
            _data.customSymptoms.push(val);
            _save();
        }
        _renderSymptomChips(document.getElementById('pd-symptoms-wrap'), _currentSymptoms, 'window._pdToggleSymptom');
        if (_dayDate) _renderSymptomChips(document.getElementById('pd-day-symptoms-wrap'), _daySymptoms, 'window._pdToggleDaySymptom');
    };

    window._pdSaveRecord = function () {
        var today = _today();
        _data.dailyRecords[today] = {
            flow: _currentFlow,
            pain: (_currentPain === null ? 0 : _currentPain),
            symptoms: _currentSymptoms.slice()
        };
        _save();
        _updateSaveBtn(true);
        _renderCalendar();
    };

    window._pdOpenHistory = function () {
        _renderHistory();
        var page = document.getElementById('pd-history-page');
        if (page) page.classList.add('pd-history-open');
    };

    window._pdCloseHistory = function () {
        var page = document.getElementById('pd-history-page');
        if (page) page.classList.remove('pd-history-open');
    };

    window._pdDeletePeriod = function (id) {
        if (!confirm('确定删除这条经期记录吗？')) return;
        _deletePeriod(id);
        _refreshAll();
        _renderHistory();
        _renderLetterCard();
    };

    window._pdClearAll = function () {
        if (!confirm('确定要清空全部经期记录吗？此操作不可恢复（聊天记录不受影响）。')) return;
        _data.periods        = [];
        _data.dailyRecords   = {};
        _data.partnerMsg     = null;
        _data.notifyAt       = null;
        _data.notifyPeriodId = null;
        _data.partnerNotes   = [];
        _randomNote = '';
        _save();
        _refreshAll();
        _renderHistory();
        _renderLetterCard();
    };

    // ── 小纸条编辑 ────────────────────────────────────
    window._pdToggleNoteEditor = function () {
        var editor = document.getElementById('pd-note-editor');
        if (!editor) return;
        var isOpen = editor.style.display === 'block';
        if (isOpen) {
            editor.style.display = 'none';
        } else {
            editor.style.display = 'block';
            _renderNoteList();
        }
    };

    function _renderNoteList() {
        var list = document.getElementById('pd-note-list');
        if (!list) return;
        if (!_data.partnerNotes.length) {
            list.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);opacity:0.6;text-align:center;padding:8px;">还没有小纸条，点击下方添加</div>';
            return;
        }
        list.innerHTML = _data.partnerNotes.map(function (note, i) {
            return '<div style="display:flex;gap:6px;margin-bottom:6px;">'
                + '<input type="text" class="pd-note-input" value="' + _escHtml(note) + '" data-idx="' + i + '" placeholder="写点什么…" style="flex:1;padding:8px 10px;border:1px solid var(--border-color);border-radius:10px;font-size:13px;background:var(--primary-bg);color:var(--text-primary);font-family:inherit;">'
                + '<button onclick="window._pdDelNote(' + i + ')" style="flex-shrink:0;width:34px;border:1px solid var(--border-color);border-radius:10px;background:transparent;color:#e5484d;cursor:pointer;font-size:12px;"><i class="fas fa-times"></i></button>'
                + '</div>';
        }).join('');
        // 绑定输入事件
        list.querySelectorAll('.pd-note-input').forEach(function (inp) {
            inp.addEventListener('input', function (e) {
                var idx = parseInt(e.target.dataset.idx, 10);
                if (_data.partnerNotes[idx] !== undefined) {
                    _data.partnerNotes[idx] = e.target.value;
                }
            });
        });
    }

    window._pdAddNote = function () {
        if (!_data.partnerNotes) _data.partnerNotes = [];
        _data.partnerNotes.push('');
        _save();
        _renderNoteList();
        // 聚焦最新输入框
        setTimeout(function () {
            var inputs = document.querySelectorAll('.pd-note-input');
            if (inputs.length) inputs[inputs.length - 1].focus();
        }, 50);
    };

    window._pdDelNote = function (idx) {
        if (!_data.partnerNotes) return;
        _data.partnerNotes.splice(idx, 1);
        _save();
        _renderNoteList();
    };

    window._pdSaveNotes = function () {
        // 过滤空字符串
        if (_data.partnerNotes) {
            _data.partnerNotes = _data.partnerNotes.map(function (n) { return (n || '').trim(); }).filter(Boolean);
        }
        _save();
        // 关闭编辑器
        var editor = document.getElementById('pd-note-editor');
        if (editor) editor.style.display = 'none';
        // 随机选一条显示
        _pickRandomNote();
        _renderLetterCard();
        if (typeof showNotification === 'function') showNotification('✓ 小纸条已保存', 'success');
    };

    // ── 初始化 ────────────────────────────────────────
    window._pdInit = async function () {
        if (!_loaded) await _load();

        var now    = new Date();
        _viewYear  = now.getFullYear();
        _viewMonth = now.getMonth();

        _renderCalendar();
        _renderSymptomChips(document.getElementById('pd-symptoms-wrap'), _currentSymptoms, 'window._pdToggleSymptom');
        _updateStats();
        _updateToggleBtn();
        _updateStatusCard();
        _renderLetterCard();
        _checkNotif();

        // 月份切换
        var prev = document.getElementById('pd-prev-month');
        var next = document.getElementById('pd-next-month');
        if (prev) prev.onclick = function () {
            _viewMonth--;
            if (_viewMonth < 0) { _viewMonth = 11; _viewYear--; }
            _renderCalendar();
        };
        if (next) next.onclick = function () {
            _viewMonth++;
            if (_viewMonth > 11) { _viewMonth = 0; _viewYear++; }
            _renderCalendar();
        };

        // 标记经期开关
        var tw = document.getElementById('pd-toggle-wrap');
        if (tw) tw.onclick = function () { window._pdToggleToday(); };
    };

    // 高级功能入口绑定（脚本在 body 底部加载，元素已就绪）
    function _bindEntry() {
        if (_initBound) return;
        var entry = document.getElementById('period-function');
        if (!entry) return;
        _initBound = true;
        entry.addEventListener('click', function () {
            window._pdOpenModal();
        });
    }
    _bindEntry();

    // 每分钟检查一次通知
    setInterval(function () { if (_loaded) _checkNotif(); }, 60000);

})();
