// ==UserScript==
// @name         NovelFire & NovelPhoenix Premium TTS Audiobook Player (Edge)
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Frosted-glass audio player for Edge — Microsoft Neural voices, auto-advance, speed, voice selector, chapter limits, paragraph highlighting, and TAB AUDIO RECORDING to MP3/WebM. Supports novelfire.net and novelphoenix.com.
// @author       Badr
// @match        https://novelfire.net/book/*
// @match        https://novelphoenix.com/novel/*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ── Site detection ────────────────────────────────────────────────────────
    const SITE = (() => {
        const host = location.hostname;
        if (host.includes('novelfire.net'))    return 'novelfire';
        if (host.includes('novelphoenix.com')) return 'novelphoenix';
        return 'unknown';
    })();

    // ── Site-specific selectors ───────────────────────────────────────────────
    const SELECTORS = {
        novelfire: {
            bookTitle:     '.booktitle',
            chapterTitle:  '.chapter-title',
            content:       '#content',
            paragraphTags: ['p', 'h3'],
            prevChap: 'a.prevchap:not(.isDisabled)',
            nextChap: 'a.nextchap:not(.isDisabled)',
        },
        novelphoenix: {
            bookTitle:     '.booktitle',
            chapterTitle:  '.chapter-title',
            content:       '#content',
            paragraphTags: ['p', 'h3', 'h4'],
            prevChap: 'a.prevchap, a.chnav.prev',
            nextChap: 'a.nextchap, a.chnav.next',
        },
    };

    const SEL = SELECTORS[SITE] || SELECTORS.novelfire;

    function isValidNavLink(el) {
        if (!el) return false;
        if (el.classList.contains('isDisabled')) return false;
        const href = el.getAttribute('href');
        if (!href || href === 'javascript:;' || href === '#') return false;
        return true;
    }

    // ── Junk-text filters ─────────────────────────────────────────────────────
    const JUNK_PATTERNS = [
        'disable-blocker.jpg', 'Share to your friends',
        'Tip: You can use left, right', 'pᴀɴdᴀ nᴏveʟ',
        'pannda', 'NovelPhoenix does not store', 'Crafted with',
    ];
    function isJunk(text) {
        if (text.length <= 2)       return true;
        if (/^[\W\s]+$/.test(text)) return true;
        return JUNK_PATTERNS.some(p => text.includes(p));
    }

    // ── SVG icons ─────────────────────────────────────────────────────────────
    const PlayIcon     = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    const PauseIcon    = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    const PrevIcon     = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>';
    const NextIcon     = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z"/></svg>';
    const CollapseIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    // Record icon — filled circle (classic REC dot)
    const RecIcon      = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>';
    // Stop-recording icon — filled square
    const StopRecIcon  = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';

    // ── Styles ────────────────────────────────────────────────────────────────
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        #nf-tts-player-dock {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 340px;
            background: rgba(18, 22, 33, 0.88);
            backdrop-filter: blur(16px) saturate(180%);
            -webkit-backdrop-filter: blur(16px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            box-shadow: 0 12px 40px 0 rgba(0, 242, 254, 0.12), 0 4px 12px 0 rgba(0,0,0,.4);
            color: #f8f9fa;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 100000;
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        #nf-tts-player-dock.collapsed {
            width: 60px; height: 60px; border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 8px 32px 0 rgba(0,242,254,.25);
            overflow: hidden;
        }
        #nf-tts-toggle-btn {
            display: flex; align-items: center; justify-content: center;
            width: 100%; height: 60px;
            background: transparent; border: none; cursor: pointer; outline: none;
            color: #00f2fe; transition: transform 0.3s ease;
        }
        #nf-tts-player-dock.collapsed #nf-tts-toggle-btn { transform: rotate(180deg); }
        #nf-tts-content-panel {
            padding: 16px 20px 20px 20px;
            display: flex; flex-direction: column; gap: 14px;
        }
        #nf-tts-player-dock.collapsed #nf-tts-content-panel { display: none; }
        .nf-tts-title-row { display: flex; flex-direction: column; gap: 2px; }
        .nf-tts-site-badge {
            font-size: 9px; font-weight: 700; letter-spacing: .5px;
            text-transform: uppercase; padding: 2px 6px; border-radius: 6px;
            align-self: flex-start;
            background: rgba(0,242,254,.12); color: #00f2fe;
            border: 1px solid rgba(0,242,254,.25);
        }
        .nf-tts-book-name {
            font-size: 11px; color: #00f2fe;
            text-transform: uppercase; font-weight: 800; letter-spacing: 1px;
        }
        .nf-tts-chapter-name {
            font-size: 15px; font-weight: 700; color: #fff;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nf-tts-controls {
            display: flex; align-items: center; justify-content: center;
            gap: 12px; margin: 6px 0;
        }
        .nf-tts-btn {
            display: flex; align-items: center; justify-content: center;
            border: none; border-radius: 50%; cursor: pointer; outline: none;
            transition: all 0.2s ease;
        }
        .nf-tts-btn:active { transform: scale(.92); }
        .nf-tts-btn-secondary {
            width: 38px; height: 38px;
            background: rgba(255,255,255,.05); color: #a0aec0;
            border: 1px solid rgba(255,255,255,.05);
        }
        .nf-tts-btn-secondary:hover { color: #fff; background: rgba(255,255,255,.1); }
        .nf-tts-btn-main {
            width: 52px; height: 52px;
            background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
            color: #0d1117;
            box-shadow: 0 4px 15px rgba(0,242,254,.3);
        }
        .nf-tts-btn-main:hover {
            box-shadow: 0 6px 20px rgba(0,242,254,.45);
            transform: translateY(-1px);
        }

        /* ── Record button ── */
        #nf-tts-rec-btn {
            width: 38px; height: 38px;
            background: rgba(255, 80, 80, 0.12); color: #ff5555;
            border: 1px solid rgba(255, 80, 80, 0.25);
        }
        #nf-tts-rec-btn:hover { background: rgba(255,80,80,.22); color: #ff3333; }
        #nf-tts-rec-btn.recording {
            background: rgba(255, 60, 60, 0.22);
            color: #ff3333;
            border-color: #ff3333;
            animation: nf-rec-pulse 1.4s ease-in-out infinite;
        }

        @keyframes nf-rec-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255,50,50,.5); }
            50%       { box-shadow: 0 0 0 6px rgba(255,50,50,0); }
        }

        /* Recording status bar */
        #nf-tts-rec-bar {
            display: none;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(255,50,50,.1);
            border: 1px solid rgba(255,50,50,.2);
            border-radius: 10px;
            font-size: 11px;
        }
        #nf-tts-rec-bar.active { display: flex; }
        .nf-rec-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: #ff3333;
            animation: nf-rec-pulse 1.4s ease-in-out infinite;
            flex-shrink: 0;
        }
        #nf-tts-rec-label { color: #ff7777; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; }
        #nf-tts-rec-timer { color: #ff9999; margin-left: auto; font-variant-numeric: tabular-nums; }
        #nf-tts-rec-size   { color: #a0aec0; font-size: 10px; }

        /* Downloads list */
        #nf-tts-rec-downloads {
            display: flex; flex-direction: column; gap: 6px;
        }
        .nf-rec-dl-row {
            display: flex; align-items: center; gap: 8px;
            padding: 7px 10px;
            background: rgba(0,242,254,.05);
            border: 1px solid rgba(0,242,254,.1);
            border-radius: 8px;
            font-size: 11px;
        }
        .nf-rec-dl-name { flex: 1; color: #a0aec0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .nf-rec-dl-size  { color: #718096; font-size: 10px; }
        .nf-rec-dl-btn {
            padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: 700;
            background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
            color: #0d1117; border: none; cursor: pointer; white-space: nowrap;
            transition: opacity .2s;
        }
        .nf-rec-dl-btn:hover { opacity: .85; }
        .nf-rec-dl-del {
            width: 20px; height: 20px; border-radius: 50%; font-size: 12px;
            background: rgba(255,80,80,.15); color: #ff6666;
            border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: background .2s;
        }
        .nf-rec-dl-del:hover { background: rgba(255,80,80,.3); }

        .nf-tts-config-item { display: flex; flex-direction: column; gap: 6px; }
        .nf-tts-config-label {
            display: flex; justify-content: space-between; align-items: center;
            font-size: 11px; font-weight: 700; color: #a0aec0;
            letter-spacing: .5px; text-transform: uppercase;
        }
        .nf-tts-config-val { color: #00f2fe; font-size: 11px; }
        .nf-tts-input, .nf-tts-select {
            width: 100%;
            background: rgba(255,255,255,.04);
            border: 1px solid rgba(255,255,255,.08);
            border-radius: 10px; padding: 8px 12px;
            color: #fff; font-size: 12px; outline: none; box-sizing: border-box;
            transition: border-color .2s ease;
            text-overflow: ellipsis; white-space: nowrap;
        }
        .nf-tts-input:focus, .nf-tts-select:focus { border-color: #00f2fe; }
        .nf-tts-select option { background-color: #121621 !important; color: #fff !important; }
        .nf-tts-slider {
            -webkit-appearance: none; width: 100%; height: 4px;
            border-radius: 2px; background: rgba(255,255,255,.1);
            outline: none; cursor: pointer;
        }
        .nf-tts-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 14px; height: 14px;
            border-radius: 50%; background: #00f2fe;
            box-shadow: 0 0 8px rgba(0,242,254,.5);
            transition: all .15s ease;
        }
        .nf-tts-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
        .nf-tts-switch-row {
            display: flex; align-items: center; justify-content: space-between; padding: 4px 0;
        }
        .nf-tts-switch { position: relative; display: inline-block; width: 42px; height: 22px; }
        .nf-tts-switch input { opacity: 0; width: 0; height: 0; }
        .nf-tts-slider-switch {
            position: absolute; cursor: pointer; top:0;left:0;right:0;bottom:0;
            background-color: rgba(255,255,255,.1); transition:.3s; border-radius: 34px;
        }
        .nf-tts-slider-switch:before {
            position: absolute; content: ""; height: 16px; width: 16px;
            left: 3px; bottom: 3px; background-color: white; transition:.3s; border-radius: 50%;
        }
        input:checked + .nf-tts-slider-switch { background-color: #00f2fe; }
        input:checked + .nf-tts-slider-switch:before { transform: translateX(20px); }
        .nf-tts-progress-container {
            display: flex; align-items: center; gap: 10px;
            font-size: 10px; color: #a0aec0;
        }
        .nf-tts-progress-bar-bg {
            flex: 1; height: 4px;
            background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden;
        }
        .nf-tts-progress-bar-fg {
            width: 0%; height: 100%; background: #00f2fe;
            border-radius: 2px; transition: width .3s ease;
        }
        #nf-tts-status { font-size: 10px; color: #a0aec0; text-align: center; min-height: 14px; }
        #nf-tts-status.error { color: #ff6b6b; }
        #nf-tts-status.ok    { color: #00f2fe; }
        .nf-tts-highlight-para {
            border-left: 4px solid #00f2fe !important;
            background: rgba(0,242,254,.05) !important;
            padding-left: 10px !important; padding-top: 4px !important; padding-bottom: 4px !important;
            border-radius: 0 8px 8px 0 !important;
            box-shadow: 0 4px 15px rgba(0,242,254,.03) !important;
            transition: all 0.4s ease !important;
        }
        .nf-tts-divider {
            height: 1px; background: rgba(255,255,255,.06); margin: 2px 0;
        }
        @media (max-width: 480px) {
            #nf-tts-player-dock { width: calc(100% - 32px); left: 16px; right: 16px; bottom: 16px; }
            #nf-tts-player-dock.collapsed { width: 54px; height: 54px; bottom: 16px; right: 16px; left: auto; }
            #nf-tts-toggle-btn { height: 54px; }
        }
    `;
    document.head.appendChild(styleElement);

    // ── Recording helper ──────────────────────────────────────────────────────
    class AudioRecorder {
        constructor() {
            this.mediaRecorder  = null;
            this.stream         = null;
            this.chunks         = [];
            this.isRecording    = false;
            this.startTime      = null;
            this._timerInterval = null;
            this._sizeInterval  = null;
            this.recordings     = [];   // [{name, url, size, mimeType}]
            this.onStateChange  = null; // callback(isRecording)
            this.onNewRecording = null; // callback(recording)
        }

        /** Pick best supported mime type */
        _mimeType() {
            const candidates = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/ogg',
                'audio/mp4',
            ];
            return candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
        }

        _ext(mimeType) {
            if (mimeType.includes('ogg')) return 'ogg';
            if (mimeType.includes('mp4')) return 'm4a';
            return 'webm';
        }

        async startRecording() {
            if (this.isRecording) return;

            // Ask the user to share a tab or screen with audio
            let stream;
            try {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: false,
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        sampleRate: 44100,
                    },
                    // Edge / Chrome tab-audio hint
                    preferCurrentTab: true,
                    selfBrowserSurface: 'include',
                });
            } catch (err) {
                if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                    console.warn('[TTS REC] User cancelled recording permission.');
                    return;
                }
                // Some browsers need video:true to allow tab audio — retry
                try {
                    stream = await navigator.mediaDevices.getDisplayMedia({
                        video: { width: 1, height: 1, frameRate: 1 },
                        audio: true,
                    });
                    // Immediately stop the dummy video track
                    stream.getVideoTracks().forEach(t => t.stop());
                } catch (err2) {
                    console.error('[TTS REC] Could not start recording:', err2);
                    alert('Recording failed: ' + err2.message);
                    return;
                }
            }

            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
                stream.getTracks().forEach(t => t.stop());
                alert(
                    'No audio track found in the captured stream.\n\n' +
                    'When the browser share-dialog opens, make sure to:\n' +
                    '1. Choose "This Tab" (not Window or Entire Screen)\n' +
                    '2. Enable the "Share tab audio" checkbox\n\n' +
                    'Then click Record again.'
                );
                return;
            }

            this.stream = stream;
            this.chunks = [];
            const mimeType = this._mimeType();
            const opts = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {};

            this.mediaRecorder = new MediaRecorder(stream, opts);
            this.mediaRecorder.ondataavailable = e => {
                if (e.data && e.data.size > 0) this.chunks.push(e.data);
            };
            this.mediaRecorder.onstop = () => this._onStop(mimeType);

            this.mediaRecorder.start(500); // collect every 500 ms
            this.isRecording = true;
            this.startTime   = Date.now();

            // Kill recording if the stream ends externally (user clicks Stop Sharing)
            stream.getAudioTracks()[0].onended = () => {
                if (this.isRecording) this.stopRecording();
            };

            this._startTimerUI();
            if (this.onStateChange) this.onStateChange(true);
        }

        stopRecording() {
            if (!this.isRecording || !this.mediaRecorder) return;
            this.isRecording = false;
            this.mediaRecorder.stop();
            this.stream.getTracks().forEach(t => t.stop());
            this._stopTimerUI();
            if (this.onStateChange) this.onStateChange(false);
        }

        _onStop(mimeType) {
            if (this.chunks.length === 0) return;
            const blob = new Blob(this.chunks, { type: mimeType || 'audio/webm' });
            const url  = URL.createObjectURL(blob);
            const ext  = this._ext(mimeType);
            const chap = (document.querySelector('.chapter-title') || {}).textContent || 'chapter';
            const safe = chap.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);
            const ts   = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
            const name = `${safe}_${ts}.${ext}`;
            const size = blob.size;
            const rec  = { name, url, size, mimeType, blob };
            this.recordings.push(rec);
            if (this.onNewRecording) this.onNewRecording(rec);
            this.chunks = [];
        }

        _startTimerUI() {
            const timerEl = document.getElementById('nf-tts-rec-timer');
            const sizeEl  = document.getElementById('nf-tts-rec-size');
            const bar     = document.getElementById('nf-tts-rec-bar');
            if (bar) bar.classList.add('active');

            this._timerInterval = setInterval(() => {
                if (!timerEl) return;
                const s = Math.floor((Date.now() - this.startTime) / 1000);
                const h = Math.floor(s / 3600).toString().padStart(2,'0');
                const m = Math.floor((s % 3600) / 60).toString().padStart(2,'0');
                const sec = (s % 60).toString().padStart(2,'0');
                timerEl.textContent = h === '00' ? `${m}:${sec}` : `${h}:${m}:${sec}`;
            }, 1000);

            this._sizeInterval = setInterval(() => {
                if (!sizeEl) return;
                const bytes = this.chunks.reduce((a, c) => a + c.size, 0);
                sizeEl.textContent = bytes > 1048576
                    ? `${(bytes/1048576).toFixed(1)} MB`
                    : `${(bytes/1024).toFixed(0)} KB`;
            }, 1000);
        }

        _stopTimerUI() {
            clearInterval(this._timerInterval);
            clearInterval(this._sizeInterval);
            this._timerInterval = null;
            this._sizeInterval  = null;
            const bar = document.getElementById('nf-tts-rec-bar');
            if (bar) bar.classList.remove('active');
        }
    }

    // ── Main TTS Engine ───────────────────────────────────────────────────────
    class NovelSpeechEngine {
        constructor() {
            this.paragraphs = [];
            this.currentIndex = 0;
            this.isPlaying = false;
            this.isPaused  = false;
            this.currentUtterance = null;
            this.voicesList = [];
            this._keepAliveTimer = null;
            this._speakSession   = 0;

            this.autoplay    = localStorage.getItem('nf-tts-autoplay') === 'true';
            this.rate        = parseFloat(localStorage.getItem('nf-tts-rate')) || 1.0;
            this.voiceName   = localStorage.getItem('nf-tts-voice') || '';
            this.stopChapter = localStorage.getItem('nf-tts-stop-chapter') || '';

            this.recorder = new AudioRecorder();
            this.recorder.onStateChange  = (rec) => this._updateRecBtn(rec);
            this.recorder.onNewRecording = (rec) => this._addDownloadEntry(rec);

            this.init();
        }

        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.extractText());
            } else {
                this.extractText();
            }
            this.loadVoices();
            window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
        }

        extractText() {
            const bookTitleEl    = document.querySelector(SEL.bookTitle);
            const chapterTitleEl = document.querySelector(SEL.chapterTitle);

            this.bookTitle    = bookTitleEl    ? bookTitleEl.textContent.trim()    : 'Novel Reader';
            this.chapterTitle = chapterTitleEl ? chapterTitleEl.textContent.trim() : 'Audiobook Player';

            const contentDiv = document.querySelector(SEL.content);
            if (contentDiv) {
                const allEls = Array.from(contentDiv.querySelectorAll(SEL.paragraphTags.join(', ')));
                this.paragraphs = allEls.filter(el => !isJunk(el.textContent.trim()));
                console.log(`[TTS ${SITE}] Extracted ${this.paragraphs.length} paragraphs.`);
            } else {
                console.warn(`[TTS ${SITE}] Content container not found: ${SEL.content}`);
            }

            this.buildUI();
            this.loadVoices();

            if (localStorage.getItem('nf-tts-trigger-autoplay') === 'true') {
                localStorage.removeItem('nf-tts-trigger-autoplay');
                setTimeout(() => this.play(), 800);
            }
        }

        loadVoices() {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length === 0) return;
            this.voicesList = voices.filter(v => v.lang.startsWith('en'));
            this.selectBestVoiceDefault();

            const sel = document.getElementById('nf-tts-voice-select');
            if (!sel) return;
            sel.innerHTML = '';
            const def = document.createElement('option');
            def.value = ''; def.textContent = 'System Default Voice';
            sel.appendChild(def);
            this.voicesList.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.name;
                opt.textContent = `${v.name.replace('Microsoft ', '')} (${v.lang})`;
                if (v.name === this.voiceName) opt.selected = true;
                sel.appendChild(opt);
            });
        }

        selectBestVoiceDefault() {
            if (this.voiceName) return;
            const ms     = v => v.name.toLowerCase().includes('microsoft');
            const neural = v => v.name.toLowerCase().includes('neural') || v.name.toLowerCase().includes('online');
            const best   =
                this.voicesList.find(v => ms(v) && /aria/i.test(v.name))   ||
                this.voicesList.find(v => ms(v) && /guy/i.test(v.name))    ||
                this.voicesList.find(v => ms(v) && /jenny/i.test(v.name))  ||
                this.voicesList.find(v => ms(v) && neural(v))              ||
                this.voicesList.find(v => ms(v) && v.lang.includes('US'))  ||
                this.voicesList.find(v => ms(v))                           ||
                this.voicesList[0];
            if (best) {
                this.voiceName = best.name;
                localStorage.setItem('nf-tts-voice', this.voiceName);
                console.log(`[TTS ${SITE}] Auto-selected voice: ${this.voiceName}`);
            }
        }

        get siteBadgeLabel() {
            return SITE === 'novelphoenix' ? 'Novel Phoenix' : 'NovelFire';
        }

        buildUI() {
            const dock = document.createElement('div');
            dock.id = 'nf-tts-player-dock';
            dock.className = localStorage.getItem('nf-tts-collapsed') === 'true' ? 'collapsed' : '';

            dock.innerHTML = `
                <button id="nf-tts-toggle-btn" title="Toggle Audiobook Panel">${CollapseIcon}</button>
                <div id="nf-tts-content-panel">

                    <div class="nf-tts-title-row">
                        <span class="nf-tts-site-badge">${this.siteBadgeLabel}</span>
                        <span class="nf-tts-book-name">${this.bookTitle}</span>
                        <span class="nf-tts-chapter-name">${this.chapterTitle}</span>
                    </div>

                    <div class="nf-tts-progress-container">
                        <span id="nf-tts-progress-text">0 / 0</span>
                        <div class="nf-tts-progress-bar-bg">
                            <div id="nf-tts-progress-bar-fg" class="nf-tts-progress-bar-fg"></div>
                        </div>
                    </div>

                    <div id="nf-tts-status"></div>

                    <div class="nf-tts-controls">
                        <button id="nf-tts-prev-btn" class="nf-tts-btn nf-tts-btn-secondary" title="Previous Chapter">${PrevIcon}</button>
                        <button id="nf-tts-play-btn" class="nf-tts-btn nf-tts-btn-main" title="Play">${PlayIcon}</button>
                        <button id="nf-tts-next-btn" class="nf-tts-btn nf-tts-btn-secondary" title="Next Chapter">${NextIcon}</button>
                        <button id="nf-tts-rec-btn"  class="nf-tts-btn nf-tts-btn-secondary" title="Record TTS Audio">${RecIcon}</button>
                    </div>

                    <!-- Live recording bar -->
                    <div id="nf-tts-rec-bar">
                        <span class="nf-rec-dot"></span>
                        <span id="nf-tts-rec-label">REC</span>
                        <span id="nf-tts-rec-size"></span>
                        <span id="nf-tts-rec-timer">00:00</span>
                    </div>

                    <div class="nf-tts-divider"></div>

                    <div class="nf-tts-config-item">
                        <span class="nf-tts-config-label">
                            Speed Rate <span id="nf-tts-speed-val" class="nf-tts-config-val">${this.rate.toFixed(2)}x</span>
                        </span>
                        <input id="nf-tts-speed-slider" type="range" class="nf-tts-slider" min="0.5" max="2.5" step="0.1" value="${this.rate}">
                    </div>

                    <div class="nf-tts-config-item">
                        <span class="nf-tts-config-label">Narrator Voice</span>
                        <select id="nf-tts-voice-select" class="nf-tts-select"></select>
                    </div>

                    <div class="nf-tts-config-item">
                        <span class="nf-tts-config-label">Stop After Chapter</span>
                        <input id="nf-tts-stop-input" type="number" class="nf-tts-input"
                               placeholder="e.g. 5 (blank = infinite)" value="${this.stopChapter}">
                    </div>

                    <div class="nf-tts-switch-row">
                        <span class="nf-tts-config-label" style="font-size:11px;">Continuous Auto-Play</span>
                        <label class="nf-tts-switch">
                            <input id="nf-tts-autoplay-chk" type="checkbox" ${this.autoplay ? 'checked' : ''}>
                            <span class="nf-tts-slider-switch"></span>
                        </label>
                    </div>

                    <!-- Saved recordings -->
                    <div id="nf-tts-rec-downloads"></div>

                </div>
            `;
            document.body.appendChild(dock);
            this.updateProgressUI();
            this.bindEvents(dock);
        }

        bindEvents(dock) {
            const playBtn     = document.getElementById('nf-tts-play-btn');
            const prevBtn     = document.getElementById('nf-tts-prev-btn');
            const nextBtn     = document.getElementById('nf-tts-next-btn');
            const recBtn      = document.getElementById('nf-tts-rec-btn');
            const speedSlider = document.getElementById('nf-tts-speed-slider');
            const voiceSelect = document.getElementById('nf-tts-voice-select');
            const stopInput   = document.getElementById('nf-tts-stop-input');
            const autoplayChk = document.getElementById('nf-tts-autoplay-chk');
            const toggleBtn   = document.getElementById('nf-tts-toggle-btn');

            playBtn.addEventListener('click', e => { e.stopPropagation(); this.togglePlay(); });

            toggleBtn.addEventListener('click', e => {
                e.stopPropagation();
                dock.classList.toggle('collapsed');
                localStorage.setItem('nf-tts-collapsed', dock.classList.contains('collapsed'));
            });
            dock.addEventListener('click', () => {
                if (dock.classList.contains('collapsed')) {
                    dock.classList.remove('collapsed');
                    localStorage.setItem('nf-tts-collapsed', 'false');
                }
            });

            speedSlider.addEventListener('input', e => {
                this.rate = parseFloat(e.target.value);
                document.getElementById('nf-tts-speed-val').textContent = `${this.rate.toFixed(2)}x`;
                localStorage.setItem('nf-tts-rate', this.rate);
                if (this.isPlaying) { window.speechSynthesis.cancel(); this.speakCurrent(); }
            });

            voiceSelect.addEventListener('change', e => {
                this.voiceName = e.target.value;
                localStorage.setItem('nf-tts-voice', this.voiceName);
                if (this.isPlaying) { window.speechSynthesis.cancel(); this.speakCurrent(); }
            });

            stopInput.addEventListener('input', e => {
                this.stopChapter = e.target.value.trim();
                localStorage.setItem('nf-tts-stop-chapter', this.stopChapter);
            });

            autoplayChk.addEventListener('change', e => {
                this.autoplay = e.target.checked;
                localStorage.setItem('nf-tts-autoplay', this.autoplay);
            });

            prevBtn.addEventListener('click', e => {
                e.stopPropagation(); this.stop();
                const l = document.querySelector(SEL.prevChap);
                if (isValidNavLink(l)) l.click();
            });
            nextBtn.addEventListener('click', e => {
                e.stopPropagation(); this.stop();
                const l = document.querySelector(SEL.nextChap);
                if (isValidNavLink(l)) l.click();
            });

            // ── Record button ──
            recBtn.addEventListener('click', async e => {
                e.stopPropagation();
                if (this.recorder.isRecording) {
                    this.recorder.stopRecording();
                } else {
                    await this.recorder.startRecording();
                }
            });

            // Paragraph click-to-seek
            this.paragraphs.forEach((para, idx) => {
                para.style.cursor = 'pointer';
                para.addEventListener('click', () => {
                    this.currentIndex = idx;
                    this.updateProgressUI();
                    if (this.isPlaying) { window.speechSynthesis.cancel(); this.speakCurrent(); }
                    else this.play();
                });
            });
        }

        // ── Recording UI helpers ──────────────────────────────────────────────
        _updateRecBtn(isRecording) {
            const btn = document.getElementById('nf-tts-rec-btn');
            if (!btn) return;
            if (isRecording) {
                btn.classList.add('recording');
                btn.innerHTML = StopRecIcon;
                btn.title = 'Stop Recording';
            } else {
                btn.classList.remove('recording');
                btn.innerHTML = RecIcon;
                btn.title = 'Record TTS Audio';
            }
        }

        _addDownloadEntry(rec) {
            const list = document.getElementById('nf-tts-rec-downloads');
            if (!list) return;

            // Section header (only first time)
            if (list.children.length === 0) {
                const hdr = document.createElement('div');
                hdr.className = 'nf-tts-config-label';
                hdr.style.marginBottom = '4px';
                hdr.textContent = 'Recordings';
                list.appendChild(hdr);
            }

            const sizeStr = rec.size > 1048576
                ? `${(rec.size / 1048576).toFixed(1)} MB`
                : `${(rec.size / 1024).toFixed(0)} KB`;

            const row = document.createElement('div');
            row.className = 'nf-rec-dl-row';
            row.innerHTML = `
                <span class="nf-rec-dl-name" title="${rec.name}">${rec.name}</span>
                <span class="nf-rec-dl-size">${sizeStr}</span>
                <button class="nf-rec-dl-btn">↓ Save</button>
                <button class="nf-rec-dl-del" title="Remove">✕</button>
            `;

            row.querySelector('.nf-rec-dl-btn').addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = rec.url; a.download = rec.name; a.click();
            });

            row.querySelector('.nf-rec-dl-del').addEventListener('click', () => {
                URL.revokeObjectURL(rec.url);
                row.remove();
                // Remove header if no more rows
                if (list.querySelectorAll('.nf-rec-dl-row').length === 0) list.innerHTML = '';
            });

            list.appendChild(row);
            this.setStatus('Recording saved — click ↓ Save', 'ok');
        }

        // ── Playback ──────────────────────────────────────────────────────────
        setStatus(msg, type = '') {
            const el = document.getElementById('nf-tts-status');
            if (!el) return;
            el.textContent = msg; el.className = type;
        }

        updateProgressUI() {
            const count = this.paragraphs.length;
            const cur   = count > 0 ? this.currentIndex + 1 : 0;
            const pct   = count > 0 ? (cur / count) * 100 : 0;
            const txt   = document.getElementById('nf-tts-progress-text');
            const bar   = document.getElementById('nf-tts-progress-bar-fg');
            if (txt) txt.textContent = `${cur} / ${count} paragraphs`;
            if (bar) bar.style.width = `${pct}%`;
        }

        togglePlay() { this.isPlaying ? this.pause() : this.play(); }

        play() {
            this.isPlaying = true; this.isPaused = false;
            document.getElementById('nf-tts-play-btn').innerHTML = PauseIcon;
            window.speechSynthesis.cancel();
            this.speakCurrent();
            this._startKeepAlive();
        }

        pause() {
            this.isPlaying = false; this.isPaused = true;
            document.getElementById('nf-tts-play-btn').innerHTML = PauseIcon;
            this._speakSession++;
            window.speechSynthesis.cancel();
            this._stopKeepAlive();
            this.setStatus('Paused');
        }

        stop() {
            this.isPlaying = false; this.isPaused = false;
            this._speakSession++;
            document.getElementById('nf-tts-play-btn').innerHTML = PlayIcon;
            window.speechSynthesis.cancel();
            this._stopKeepAlive();
            this.clearHighlights();
            this.setStatus('');
        }

        clearHighlights() {
            this.paragraphs.forEach(p => p.classList.remove('nf-tts-highlight-para'));
        }

        _startKeepAlive() {
            this._stopKeepAlive();
            this._keepAliveTimer = setInterval(() => {
                if (!this.isPlaying) return;
                if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                    window.speechSynthesis.pause();
                    window.speechSynthesis.resume();
                }
            }, 14000);
        }
        _stopKeepAlive() {
            if (this._keepAliveTimer) { clearInterval(this._keepAliveTimer); this._keepAliveTimer = null; }
        }

        speakCurrent() {
            window.speechSynthesis.cancel();
            this.clearHighlights();

            if (this.currentIndex < 0 || this.currentIndex >= this.paragraphs.length) {
                this.onChapterFinished(); return;
            }

            const sessionId = ++this._speakSession;
            const el        = this.paragraphs[this.currentIndex];
            let text        = el.textContent.replace(/pᴀɴdᴀ\s*nᴏveʟ/gi, '').replace(/[^\S\r\n]+/g, ' ').trim();

            if (!text) {
                if (this.isPlaying) { this.currentIndex++; this.speakCurrent(); }
                return;
            }

            this._speakChunks(this._splitIntoChunks(text, 250), 0, sessionId, el);
        }

        _splitIntoChunks(text, maxLen) {
            if (text.length <= maxLen) return [text];
            const chunks = [];
            const sents  = text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text];
            let cur = '';
            for (const s of sents) {
                if ((cur + s).length > maxLen && cur.length > 0) { chunks.push(cur.trim()); cur = s; }
                else cur += s;
            }
            if (cur.trim()) chunks.push(cur.trim());
            return chunks.length > 0 ? chunks : [text];
        }

        _speakChunks(chunks, idx, sessionId, el) {
            if (sessionId !== this._speakSession) return;
            if (idx === 0) {
                el.classList.add('nf-tts-highlight-para');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                this.updateProgressUI();
                this.setStatus('Speaking...', 'ok');
            }
            if (idx >= chunks.length) {
                if (this.isPlaying && sessionId === this._speakSession) { this.currentIndex++; this.speakCurrent(); }
                return;
            }

            const utter = new SpeechSynthesisUtterance(chunks[idx]);
            utter.rate  = this.rate;
            if (this.voiceName) {
                const v = this.voicesList.find(v => v.name === this.voiceName);
                if (v) utter.voice = v;
            }
            utter.onend  = () => { if (sessionId !== this._speakSession) return; this._speakChunks(chunks, idx + 1, sessionId, el); };
            utter.onerror = e => {
                if (sessionId !== this._speakSession) return;
                if (e.error === 'interrupted' || e.error === 'canceled') return;
                console.error(`[TTS ${SITE}] error:`, e.error);
                this.setStatus(`Voice error: ${e.error}`, 'error');
                if (this.isPlaying) setTimeout(() => { if (sessionId !== this._speakSession) return; this.currentIndex++; this.speakCurrent(); }, 600);
            };
            this.currentUtterance = utter;
            window.speechSynthesis.speak(utter);
        }

        onChapterFinished() {
            this.stop();
            console.log(`[TTS ${SITE}] Chapter completed.`);
            this.setStatus('Chapter complete');

            let chNum = null;
            const m = this.chapterTitle.match(/Chapter\s+(\d+)/i);
            if (m) chNum = parseInt(m[1]);

            if (this.stopChapter && chNum !== null && chNum >= parseInt(this.stopChapter)) {
                alert(`Reached target chapter limit: Chapter ${this.stopChapter}. Playback stopped.`);
                return;
            }

            if (this.autoplay) {
                const next = document.querySelector(SEL.nextChap);
                if (isValidNavLink(next)) {
                    this.setStatus('Loading next chapter...');
                    localStorage.setItem('nf-tts-trigger-autoplay', 'true');
                    setTimeout(() => next.click(), 1000);
                } else {
                    this.setStatus('No next chapter found.');
                }
            }
        }
    }

    window.novelSpeechEngine = new NovelSpeechEngine();

})();
