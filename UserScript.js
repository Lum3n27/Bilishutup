// ==UserScript==
// @name         Bilibili 免登入 1080P & 1080P 60
// @namespace    http://tampermonkey.net/
// @version      4.6
// @description  免登入解鎖 B站 1080P 畫質限制，自動移除所有登入彈窗，解鎖留言區查看限制，並提供多條網頁內嵌解析線路
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

    // ========== 新增：自動播放相關配置 ==========
    const AUTO_PLAY_ENABLED = true;  // 是否啟用自動播放功能
    const AUTO_PLAY_DELAY = 500;     // 自動播放延遲時間(毫秒)，用於等待DOM準備就緒

    // 1. 注入全局變量，直接在網頁 JS 運行前偽裝登入狀態，欺騙 B 站前端組件
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

    // 2. 網絡請求劫持：針對 /x/web-interface/nav 回傳已登入的虛擬用戶信息，解鎖留言區和展開限制
    function interceptLoginStatus() {
        const mockNavResponse = {
            code: 0,
            message: "0",
            ttl: 1,
            data: {
                isLogin: true,
                email_verified: 1,
                face: "https://static.hdslb.com/images/akari.jpg",
                level_info: {
                    current_level: 4,
                    current_min: 0,
                    current_exp: 0,
                    next_exp: 0
                },
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

        // 劫持 XMLHttpRequest
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

                // 異步觸發事件，確保網頁上的監聽器能正常接收到偽裝數據
                setTimeout(() => {
                    if (typeof this.onreadystatechange === 'function') {
                        this.onreadystatechange();
                    }
                    if (typeof this.onload === 'function') {
                        this.onload();
                    }
                }, 0);
                return;
            }
            return rawSend.apply(this, arguments);
        };

        // 劫持 fetch API
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

    // 啟動 API 劫持
    interceptLoginStatus();

    // 3. 全方位 CSS 注入：隱藏所有登入提示、並恢復留言區自由滾動、點擊和選取
    const css = `
        /* 隱藏登入與限制彈窗 */
        .bili-mini-mask,
        .bili-mini-login-wrapper,
        .bili-dialog-m,
        .login-tip,
        .v-popover-content.login-tip,
        .bili-guide,
        .login-panel,
        div[class*="login-tips"],
        div[class*="login-guide"],
        .unlogin-popover,
        .conments-login-mask,
        .comment-send-privilege,
        .reply-box-send .unlogin-box {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }

        /* 恢復留言區與頁面被鎖死、無法滾動的問題 */
        body, html {
            overflow: auto !important;
            position: relative !important;
        }

        /* 解鎖被模糊或無法點擊的留言區、確保可以選取內容 */
        .reply-box, .comment-container, .bb-comment, .comment-list, .reply-list {
            filter: none !important;
            pointer-events: auto !important;
            user-select: text !important;
        }

        /* 懸浮控制面板樣式 */
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
            transition: all 0.3s ease;
            width: 250px;
        }

        #bili-bypass-panel.minimized {
            width: 44px;
            height: 44px;
            padding: 0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            background: #00aeec;
            border: 2px solid #ffffff;
        }

        #bili-bypass-panel h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            font-weight: 600;
            color: #00aeec;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #bili-bypass-panel .close-btn {
            cursor: pointer;
            font-size: 14px;
            color: #aaa;
        }

        #bili-bypass-panel .close-btn:hover {
            color: #fff;
        }

        .bypass-select {
            width: 100%;
            padding: 6px;
            background: #333;
            color: #fff;
            border: 1px solid #00aeec;
            border-radius: 6px;
            font-size: 12px;
            margin-bottom: 10px;
        }

        .bypass-btn {
            display: block;
            width: 100%;
            padding: 10px;
            background: #00aeec;
            border: none;
            border-radius: 6px;
            color: white;
            font-size: 13px;
            font-weight: bold;
            cursor: pointer;
            text-align: center;
            margin-top: 8px;
            transition: all 0.2s;
        }

        .bypass-btn:hover {
            background: #008cc0;
            transform: translateY(-1px);
        }

        .bypass-btn.secondary {
            background: #444;
            border: 1px solid #555;
        }
        .bypass-btn.secondary:hover {
            background: #555;
        }

        /* 絕對定位的內嵌播放器容器，確保 16:9 且完美覆蓋 */
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

        /* 新增：自動播放成功提示 */
        .auto-play-toast {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 174, 236, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 100000;
            font-size: 14px;
            animation: fadeInOut 3s forwards;
        }

        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            15% { opacity: 1; transform: translateX(-50%) translateY(0); }
            85% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
    `;
    GM_addStyle(css);

    // 4. 實時監聽器：阻斷登入彈窗，並自動恢復被鎖定的留言區
    function startObserver() {
        const observer = new MutationObserver(() => {
            // 移除可能阻擋畫面的各種遮罩與彈窗
            const loginDialogs = document.querySelectorAll('.bili-mini-mask, .bili-mini-login-wrapper, .bili-dialog-m, [class*="login-tips"]');
            if (loginDialogs.length > 0) {
                loginDialogs.forEach(dialog => dialog.remove());
            }

            // 確保被限制的留言區可以點擊和看見
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

    // 5. 核心：在不破壞 DOM 結構的前提下，完美疊加 1080P 播放器，保證網頁 React 元件不崩潰、留言區照常顯示
    function replacePlayer(engineUrl) {
        const currentUrl = window.location.href;
        const targetIframeSrc = `${engineUrl}${encodeURIComponent(currentUrl)}`;

        const playerSelectors = [
            '.bpx-player-video-area',           // 新版 HTML5 播放器核心區
            '#bilibili-player',                 // 舊版或備用
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

            // 先移除之前可能已經加過的舊 iframe
            const oldOverlay = playerContainer.querySelector('.bili-bypass-iframe-overlay');
            if (oldOverlay) oldOverlay.remove();

            // 建立無縫覆蓋的播放容器
            const overlayDiv = document.createElement('div');
            overlayDiv.className = 'bili-bypass-iframe-overlay';

            const iframe = document.createElement('iframe');
            iframe.src = targetIframeSrc;
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.allowFullscreen = true;
            iframe.setAttribute('allow', 'fullscreen');

            overlayDiv.appendChild(iframe);
            playerContainer.appendChild(overlayDiv);

            console.log('[Bilibili Helper] Successfully overlayed player with 1080P engine.');

            // 靜音並暫停 B 站原生的背景視訊
            silenceNativePlayer();
        } else {
            console.error('[Bilibili Helper] Player container not found.');
        }
    }

    // 6. 輔助：靜音與暫停 B 站的原生影片播放，避免背景音效干擾 1080P 的聲音
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

    // ========== 新增：自動播放功能 ==========

    /**
     * 檢查當前頁面是否為影片頁面
     */
    function isVideoPage() {
        const path = window.location.pathname;
        return path.includes('/video/') || path.includes('/bangumi/play/');
    }

    /**
     * 顯示自動播放提示
     */
    function showAutoPlayToast(message) {
        // 移除舊的 toast
        const existingToast = document.querySelector('.auto-play-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'auto-play-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // 3秒後自動移除
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    /**
     * 獲取預設線路
     */
    function getDefaultEngineUrl() {
        // 使用面板中選擇的第一個選項作為預設
        return 'https://jx.xmflv.com/?url=';
    }

    /**
     * 執行自動播放
     */
    function autoTriggerPlayer() {
        if (!AUTO_PLAY_ENABLED || !isVideoPage()) {
            return;
        }

        console.log('[Bilibili Helper] Auto-play triggered for:', window.location.href);

        // 延遲執行以確保DOM完全載入
        setTimeout(() => {
            const engineUrl = getDefaultEngineUrl();

            // 等待播放器容器出現
            const checkInterval = setInterval(() => {
                if (document.querySelector('.bpx-player-video-area') ||
                    document.querySelector('#bilibili-player') ||
                    document.querySelector('.bili-bypass-iframe-overlay')) {

                    clearInterval(checkInterval);
                    replacePlayer(engineUrl);
                    showAutoPlayToast('已自動啟用 1080P 內嵌播放');
                }
            }, 100);

            // 最長等待 5 秒
            setTimeout(() => {
                clearInterval(checkInterval);
            }, 5000);
        }, AUTO_PLAY_DELAY);
    }

    /**
     * URL 變化監控 - 處理 SPA 路由導航
     */
    function setupURLMonitor() {
        let lastHref = window.location.href;

        // 使用 MutationObserver 監控 URL 變化
        const observer = new MutationObserver(() => {
            const currentHref = window.location.href;
            if (currentHref !== lastHref) {
                lastHref = currentHref;
                console.log('[Bilibili Helper] URL changed to:', currentHref);
                autoTriggerPlayer();
            }
        });

        observer.observe(document, { subtree: true, childList: true, attributes: true });

        // 同時監聽 popstate 和 hashchange 事件
        window.addEventListener('popstate', autoTriggerPlayer);
        window.addEventListener('hashchange', autoTriggerPlayer);
    }

    // 7. UI 控制面板
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'bili-bypass-panel';
        panel.innerHTML = `
            <div id="panel-maximized">
                <h3>Bilibili 免登入工具 <span class="close-btn" id="panel-minimize-btn">-</span></h3>
                <div style="font-size: 11px; color: #ccc; margin-bottom: 8px;">
                    請選擇解析線路：
                </div>
                <select id="bypass-line-select" class="bypass-select">
                    <option value="https://jx.xmflv.com/?url=">蝦米解析一線</option>
                    <option value="https://jx.xmflv.cc/?url=">蝦米解析二線</option>
                    <option value="https://okjx.cc/?url=">OK解析線路</option>
                    <option value="https://jx.aidouer.net/?url=">愛豆解析線路</option>
                </select>
                <button class="bypass-btn" id="btn-embed-play">網頁內嵌播放 (1080P/60幀)</button>
                <button class="bypass-btn secondary" id="btn-new-tab-play">新分頁獨立播放</button>
            </div>
            <div id="panel-minimized" style="display: none; font-size: 12px; font-weight: bold; text-align: center; width: 100%; line-height: 44px; color: #ffffff;">助手</div>
        `;
        document.body.appendChild(panel);

        const maxView = panel.querySelector('#panel-maximized');
        const minView = panel.querySelector('#panel-minimized');
        const minBtn = panel.querySelector('#panel-minimize-btn');
        const lineSelect = panel.querySelector('#bypass-line-select');

        // 最小化與還原
        minBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.add('minimized');
            maxView.style.display = 'none';
            minView.style.display = 'flex';
        });

        panel.addEventListener('click', () => {
            if (panel.classList.contains('minimized')) {
                panel.classList.remove('minimized');
                maxView.style.display = 'block';
                minView.style.display = 'none';
            }
        });

        // 點擊事件 1：疊加播放器（無損嵌入）
        panel.querySelector('#btn-embed-play').addEventListener('click', () => {
            const selectedEngine = lineSelect.value;
            replacePlayer(selectedEngine);
            showAutoPlayToast('手動觸發 1080P 內嵌播放');
        });

        // 點擊事件 2：新分頁開啟
        panel.querySelector('#btn-new-tab-play').addEventListener('click', () => {
            const selectedEngine = lineSelect.value;
            const currentUrl = window.location.href;
            window.open(`${selectedEngine}${encodeURIComponent(currentUrl)}`, '_blank');
        });
    }

    // 8. 網頁加載完畢後初始化
    window.addEventListener('DOMContentLoaded', () => {
        createControlPanel();
        startObserver();
        setupURLMonitor();  // 新增：設置 URL 監控
        autoTriggerPlayer(); // 新增：初次進入時檢查是否需要自動播放
    });

})();
