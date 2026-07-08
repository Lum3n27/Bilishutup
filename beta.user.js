// ==UserScript==
// @name         Bilibili 免登入 1080P & 1080P 60
// @namespace    http://tampermonkey.net/
// @version      4.9
// @description  免登入解鎖 B 站 1080P 畫質限制，自動移除所有登入彈窗，解鎖留言區查看限制，並提供多條網頁內嵌解析線路
// @author       Hh
// @match        *://*.bilibili.com/video/*
// @match        *://*.bilibili.com/list/*
// @match        *://*.bilibili.com/bangumi/play/*
// @match        *://*.bilibili.com/blackboard/html5mobileplayer.html*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ========== 配置 ==========
    const AUTO_PLAY_ENABLED = true;
    const AUTO_PLAY_DELAY = 500;
    const MINIMIZED_SIZE = 44;  // 縮小後的按鈕尺寸 (px)

    // ========== 拖曳狀態 ==========
    let isDragging = false;
    let startPos = { x: 0, y: 0 };
    let initialPos = { x: 0, y: 0 };
    let dragStartTime = 0;

    // 1. 注入全局變量
    try {
        Object.defineProperty(window, 'isLogin', { get: () => true, configurable: true });
        const fakeUser = {
            isLogin: true,
            mid: 99999999,
            uname: "Dummy027",
            face: "https://static.hdslb.com/images/akari.jpg",
            level_info: { current_level: 4 }
        };
        Object.defineProperty(window, 'BiliUser', { get: () => fakeUser, configurable: true });
        Object.defineProperty(window, '__BILI_USER_INFO__', { get: () => fakeUser, configurable: true });
    } catch (e) {
        console.error("Failed to inject global bypass variables:", e);
    }

    // 2. 網絡請求劫持
    function interceptLoginStatus() {
        const mockNavResponse = {
            code: 0,
            message: "0",
            ttl: 1,
            data: {
                isLogin: true,
                email_verified: 1,
                face: "https://static.hdslb.com/images/akari.jpg",
                level_info: { current_level: 4, current_min: 0, current_exp: 0, next_exp: 0 },
                mid: 99999999,
                mobile_verified: 1,
                money: 100,
                moral: 70,
                official: { role: 0, title: "", desc: "", type: -1 },
                officialVerify: { type: -1, desc: "" },
                pendant: { pid: 0, name: "", image: "", expire: 0, image_enhance: "", image_enhance_frame: "" },
                scores: 0,
                uname: "Dummy027",
                vipDueDate: 0,
                vipStatus: 1,
                vipType: 2
            }
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            this._url = url;
            return rawOpen.apply(this, arguments);
        };

        const rawSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function() {
            if (this._url && this._url.includes('web-interface/nav')) {
                Object.defineProperty(this, 'status', { writable: true, value: 200 });
                Object.defineProperty(this, 'readyState', { writable: true, value: 4 });
                Object.defineProperty(this, 'responseText', { writable: true, value: JSON.stringify(mockNavResponse) });
                Object.defineProperty(this, 'response', { writable: true, value: JSON.stringify(mockNavResponse) });
                setTimeout(() => {
                    if (typeof this.onreadystatechange === 'function') this.onreadystatechange();
                    if (typeof this.onload === 'function') this.onload();
                }, 0);
                return;
            }
            return rawSend.apply(this, arguments);
        };

        const rawFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            if (url.includes('web-interface/nav')) {
                return new Response(JSON.stringify(mockNavResponse), {
                    status: 200,
                    statusText: 'OK',
                    headers: new Headers({ 'Content-Type': 'application/json' })
                });
            }
            return rawFetch.apply(this, args);
        };
    }

    interceptLoginStatus();

    // 3. CSS 注入（優化拖曳和縮小時的狀態）
    const css = `
        /* 隱藏登入與限制彈窗 */
        .bili-mini-mask, .bili-mini-login-wrapper, .bili-dialog-m, .login-tip,
        .v-popover-content.login-tip, .bili-guide, .login-panel,
        div[class*="login-tips"], div[class*="login-guide"],
        .unlogin-popover, .conments-login-mask, .comment-send-privilege,
        .reply-box-send .unlogin-box {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }

        body, html {
            overflow: auto !important;
            position: relative !important;
        }

        .reply-box, .comment-container, .bb-comment, .comment-list, .reply-list {
            filter: none !important;
            pointer-events: auto !important;
            user-select: text !important;
        }

        /* 控制面板主體 */
        #bili-bypass-panel {
            position: fixed;
            bottom: 80px;
            right: 20px;
            z-index: 9999999;
            background: rgba(26, 26, 26, 0.95);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(0, 174, 236, 0.3);
            border-radius: 12px;
            padding: 14px;
            color: #ffffff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            width: 250px;
            will-change: transform;
        }

        #bili-bypass-panel.dragging {
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
            cursor: grabbing;
            opacity: 0.95;
            transition: none;
        }

        #bili-bypass-panel h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            font-weight: 600;
            color: #00aeec;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: grab;
            user-select: none;
            -webkit-user-select: none;
        }

        #bili-bypass-panel h3:active {
            cursor: grabbing;
        }

        #bili-bypass-panel .close-btn {
            cursor: pointer;
            font-size: 18px;
            color: #aaa;
            line-height: 1;
            padding: 0 4px;
            transition: color 0.2s;
        }

        #bili-bypass-panel .close-btn:hover {
            color: #fff;
        }

        .bypass-select {
            width: 100%;
            padding: 8px;
            background: #333;
            color: #fff;
            border: 1px solid #00aeec;
            border-radius: 6px;
            font-size: 12px;
            margin-bottom: 10px;
            outline: none;
        }

        .bypass-select:focus {
            border-color: #00d4ff;
            box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
        }

        .bypass-btn {
            display: block;
            width: 100%;
            padding: 10px;
            background: linear-gradient(135deg, #00aeec 0%, #0095cc 100%);
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            text-align: center;
            margin-top: 8px;
            transition: all 0.2s ease;
        }

        .bypass-btn:hover {
            background: linear-gradient(135deg, #00c4fc 0%, #00a8e8 100%);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 174, 236, 0.4);
        }

        .bypass-btn:active {
            transform: translateY(0);
        }

        .bypass-btn.secondary {
            background: linear-gradient(135deg, #4a4a4a 0%, #333 100%);
            border: 1px solid #555;
        }

        .bypass-btn.secondary:hover {
            background: linear-gradient(135deg, #5a5a5a 0%, #444 100%);
            box-shadow: 0 4px 12px rgba(100, 100, 100, 0.4);
        }

        .bili-bypass-iframe-overlay {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            z-index: 99999 !important;
            background: #000000 !important;
            border-radius: 6px !important;
            overflow: hidden !important;
        }

        /* ========== 優化後的縮小球形按鈕 ========== */
        #bili-bypass-panel.minimized {
            width: ${MINIMIZED_SIZE}px !important;
            height: ${MINIMIZED_SIZE}px !important;
            padding: 0 !important;
            border-radius: 50% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: grab !important;
            background: linear-gradient(135deg, #00aeec 0%, #0095cc 100%) !important;
            border: 2px solid #ffffff !important;
            box-shadow: 0 6px 25px rgba(0, 174, 236, 0.5) !important;
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
            will-change: transform;
        }

        #bili-bypass-panel.minimized:hover {
            transform: scale(1.15);
            box-shadow: 0 10px 35px rgba(0, 174, 236, 0.7) !important;
        }

        #bili-bypass-panel.minimized.dragging {
            cursor: grabbing !important;
            transform: scale(1.05) !important;
            transition: none !important;
        }

        #bili-bypass-panel.minimized #panel-minimized {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
            height: 100% !important;
            font-size: 22px !important;
            font-weight: bold !important;
            color: #ffffff !important;
            line-height: 1 !important;
            user-select: none !important;
            pointer-events: none !important;
        }

        #bili-bypass-panel.minimized #panel-maximized {
            display: none !important;
        }

        #bili-bypass-panel:not(.minimized) #panel-maximized {
            display: block !important;
        }

        #bili-bypass-panel:not(.minimized) #panel-minimized {
            display: none !important;
        }

        .auto-play-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 174, 236, 0.9);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            z-index: 100000;
            font-size: 14px;
            animation: fadeInOut 3s forwards;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            15% { opacity: 1; transform: translateX(-50%) translateY(0); }
            85% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
    `;
    GM_addStyle(css);

    // 4. 實時監聽器
    function startObserver() {
        const observer = new MutationObserver(() => {
            const loginDialogs = document.querySelectorAll('.bili-mini-mask, .bili-mini-login-wrapper, .bili-dialog-m, [class*="login-tips"]');
            if (loginDialogs.length > 0) {
                loginDialogs.forEach(dialog => dialog.remove());
            }
            const commentSections = document.querySelectorAll('.reply-box, .comment-container, .bb-comment, .comment-list');
            commentSections.forEach(section => {
                if (section.style.pointerEvents === 'none' || section.style.filter.includes('blur')) {
                    section.style.setProperty('pointer-events', 'auto', 'important');
                    section.style.setProperty('filter', 'none', 'important');
                }
            });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    // 5. 核心：播放器替換
    function replacePlayer(engineUrl) {
        const currentUrl = window.location.href;
        const targetIframeSrc = `${engineUrl}${encodeURIComponent(currentUrl)}`;

        const playerSelectors = [
            '.bpx-player-video-area',
            '#bilibili-player',
            '#player_module',
            '.bilibili-player-video-wrap',
            '#player-container'
        ];

        let playerContainer = null;
        for (const selector of playerSelectors) {
            playerContainer = document.querySelector(selector);
            if (playerContainer && playerContainer.offsetHeight > 100) break;
        }

        if (playerContainer) {
            if (window.getComputedStyle(playerContainer).position === 'static') {
                playerContainer.style.position = 'relative';
            }

            const oldOverlay = playerContainer.querySelector('.bili-bypass-iframe-overlay');
            if (oldOverlay) oldOverlay.remove();

            const overlayDiv = document.createElement('div');
            overlayDiv.className = 'bili-bypass-iframe-overlay';

            const iframe = document.createElement('iframe');
            iframe.src = targetIframeSrc;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.allowFullscreen = true;
            iframe.setAttribute('allow', 'fullscreen');
            iframe.setAttribute('crossorigin', 'anonymous');

            overlayDiv.appendChild(iframe);
            playerContainer.appendChild(overlayDiv);

            console.log('[Bilibili Helper] Player overlayed successfully.');
            silenceNativePlayer();
        } else {
            console.error('[Bilibili Helper] Player container not found.');
        }
    }

    // 6. 靜音原生播放器
    function silenceNativePlayer() {
        setInterval(() => {
            const nativeVideos = document.querySelectorAll('video, bwp-video');
            nativeVideos.forEach(vid => {
                if (!vid.paused || !vid.muted) {
                    vid.pause();
                    vid.muted = true;
                    vid.volume = 0;
                }
            });
        }, 1000);
    }

    // ========== 優化後的拖曳功能 ==========
    function setupPanelDraggable() {
        const panel = document.getElementById('bili-bypass-panel');
        if (!panel) return;

        const onPointerDown = (e) => {
            // 排除按鈕和選單區域
            if (e.target.closest('.bypass-btn') || e.target.closest('select')) return;

            isDragging = true;
            dragStartTime = Date.now();
            panel.classList.add('dragging');

            startPos.x = e.clientX || e.touches?.[0]?.clientX || 0;
            startPos.y = e.clientY || e.touches?.[0]?.clientY || 0;

            const rect = panel.getBoundingClientRect();
            initialPos.x = rect.left;
            initialPos.y = rect.top;

            // 使用 transform 提升性能
            panel.style.transition = 'none';
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;

            const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
            const clientY = e.clientY || e.touches?.[0]?.clientY || 0;

            const deltaX = clientX - startPos.x;
            const deltaY = clientY - startPos.y;

            // 使用 requestAnimationFrame 優化性能
            requestAnimationFrame(() => {
                panel.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            });
        };

        const onPointerUp = () => {
            if (!isDragging) return;

            const duration = Date.now() - dragStartTime;
            isDragging = false;
            panel.classList.remove('dragging');

            // 如果拖曳時間很短，視為點擊而非拖曳
            if (duration < 200) {
                panel.style.transform = 'translate(0, 0)';

                // 如果是縮小狀態，點擊後還原
                if (panel.classList.contains('minimized')) {
                    panel.classList.remove('minimized');
                }
                return;
            }

            // 應用最終位置
            const rect = panel.getBoundingClientRect();
            const newX = initialPos.x + (rect.left - initialPos.x);
            const newY = initialPos.y + (rect.top - initialPos.y);

            panel.style.transition = 'transform 0.2s ease';
            panel.style.transform = `translate(${newX - (panel.offsetLeft || 0)}px, ${newY - (panel.offsetTop || 0)}px)`;

            // 保存最終位置到 CSS
            setTimeout(() => {
                panel.style.transform = '';
                panel.style.left = `${rect.left}px`;
                panel.style.top = `${rect.top}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }, 200);
        };

        // 綁定事件（同時支援滑鼠和觸控）
        panel.addEventListener('mousedown', onPointerDown);
        panel.addEventListener('touchstart', onPointerDown, { passive: false });

        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('touchmove', onPointerMove, { passive: false });

        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchend', onPointerUp);
    }

    // ========== 自動播放功能 ==========
    function isVideoPage() {
        const path = window.location.pathname;
        return path.includes('/video/') || path.includes('/bangumi/play/');
    }

    function showAutoPlayToast(message) {
        const existingToast = document.querySelector('.auto-play-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'auto-play-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    }

    function getDefaultEngineUrl() {
        return 'https://jx.xmflv.com/?url=';
    }

    function autoTriggerPlayer() {
        if (!AUTO_PLAY_ENABLED || !isVideoPage()) return;

        console.log('[Bilibili Helper] Auto-play triggered:', window.location.href);

        setTimeout(() => {
            const engineUrl = getDefaultEngineUrl();
            const checkInterval = setInterval(() => {
                if (document.querySelector('.bpx-player-video-area') ||
                    document.querySelector('#bilibili-player') ||
                    document.querySelector('.bili-bypass-iframe-overlay')) {

                    clearInterval(checkInterval);
                    replacePlayer(engineUrl);
                    showAutoPlayToast('已自動啟用 1080P 內嵌播放');
                }
            }, 100);

            setTimeout(() => clearInterval(checkInterval), 5000);
        }, AUTO_PLAY_DELAY);
    }

    function setupURLMonitor() {
        let lastHref = window.location.href;
        const observer = new MutationObserver(() => {
            const currentHref = window.location.href;
            if (currentHref !== lastHref) {
                lastHref = currentHref;
                console.log('[Bilibili Helper] URL changed:', currentHref);
                autoTriggerPlayer();
            }
        });

        observer.observe(document, { subtree: true, childList: true, attributes: true });
        window.addEventListener('popstate', autoTriggerPlayer);
        window.addEventListener('hashchange', autoTriggerPlayer);
    }

    // 7. UI 控制面板
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'bili-bypass-panel';
        panel.innerHTML = `
            <div id="panel-maximized">
                <h3>Bilibili 免登入工具 <span class="close-btn" id="panel-minimize-btn">✕</span></h3>
                <div style="font-size: 11px; color: #ccc; margin-bottom: 8px;">
                    請選擇解析線路：
                </div>
                <select id="bypass-line-select" class="bypass-select">
                    <option value="https://jx.xmflv.com/?url=">蝦米解析一線</option>
                    <option value="https://jx.xmflv.cc/?url=">蝦米解析二線</option>
                    <option value="https://okjx.cc/?url=">OK 解析線路</option>
                    <option value="https://jx.aidouer.net/?url=">愛豆解析線路</option>
                </select>
                <button class="bypass-btn" id="btn-embed-play">網頁內嵌播放 (1080P/60 幀)</button>
                <button class="bypass-btn secondary" id="btn-new-tab-play">新分頁獨立播放</button>
            </div>
            <div id="panel-minimized">☭</div>
        `;
        document.body.appendChild(panel);

        const maxView = panel.querySelector('#panel-maximized');
        const minView = panel.querySelector('#panel-minimized');
        const minBtn = panel.querySelector('#panel-minimize-btn');
        const lineSelect = panel.querySelector('#bypass-line-select');

        // 最小化按鈕
        minBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.add('minimized');
        });

        // 縮小球形按鈕點擊事件 - 直接還原面板
        minView.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.classList.contains('minimized')) {
                panel.classList.remove('minimized');
            }
        });

        // 防止拖曳誤觸發點擊
        panel.addEventListener('mousedown', () => {
            dragStartTime = Date.now();
        });

        panel.addEventListener('mouseup', (e) => {
            const duration = Date.now() - dragStartTime;
            // 只有短時間內松开且沒有拖曳動作才視為點擊
            if (duration < 200 && !isDragging) {
                // 如果不是在按鈕區域內
                if (!e.target.closest('.bypass-btn') && !e.target.closest('select')) {
                    // 在縮小狀態下點擊空白區域也可以還原
                    if (panel.classList.contains('minimized')) {
                        // 只在點擊的是 minView 時才還原
                        if (e.target === minView || minView.contains(e.target)) {
                            panel.classList.remove('minimized');
                        }
                    }
                }
            }
        });

        // 最大化面板的點擊區域處理
        panel.addEventListener('click', (e) => {
            if (panel.classList.contains('minimized') && !e.target.closest('.bypass-btn') && !e.target.closest('select')) {
                if (e.target === minView || e.target === panel) {
                    panel.classList.remove('minimized');
                }
            }
        });

        // 按鈕事件
        panel.querySelector('#btn-embed-play').addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedEngine = lineSelect.value;
            replacePlayer(selectedEngine);
            showAutoPlayToast('手動觸發 1080P 內嵌播放');
        });

        panel.querySelector('#btn-new-tab-play').addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedEngine = lineSelect.value;
            window.open(`${selectedEngine}${encodeURIComponent(window.location.href)}`, '_blank');
        });
    }

    // 8. 初始化
    window.addEventListener('DOMContentLoaded', () => {
        createControlPanel();
        startObserver();
        setupURLMonitor();
        autoTriggerPlayer();
        setupPanelDraggable();
    });

})();
