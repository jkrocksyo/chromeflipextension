(function () {
    const ROOT_ID = "__vtf_root";
    if (document.getElementById(ROOT_ID)) return;

    // ── Video helpers ─────────────────────────────────────────────────────────

    function getVideos() {
        return Array.from(document.querySelectorAll("video")).filter(v => {
            const r = v.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
    }

    function getSelectedIdx(videos) {
        const i = videos.findIndex(v => v.dataset.vtfSel === "1");
        return i >= 0 ? i : 0;
    }

    function setSelected(videos, idx) {
        videos.forEach((v, i) => {
            v.dataset.vtfSel  = i === idx ? "1" : "0";
            v.style.outline   = i === idx ? "3px solid #1db89a" : "";
            v.style.boxShadow = i === idx ? "0 0 10px 2px #1db89a55" : "";
        });
    }

    // Snapshot Meet's natural transform for this video before we touch it.
    // Stored as a data attribute so it survives across isolated/main worlds.
    function snapshot(video) {
        if (video.dataset.vtfBase) return;
        const raw = getComputedStyle(video).transform;
        const m = new DOMMatrix(raw === "none" ? "matrix(1,0,0,1,0,0)" : raw);
        video.dataset.vtfBase = JSON.stringify([m.a, m.b, m.c, m.d, m.e, m.f]);
        video.dataset.vtfH = "0";
        video.dataset.vtfV = "0";
    }

    // Negate scaleX/scaleY relative to Meet's baseline, then lock with
    // !important + MutationObserver so Meet's own inline assignments can't win.
    function applyFlip(video) {
        const flipH = video.dataset.vtfH === "1";
        const flipV = video.dataset.vtfV === "1";

        if (!flipH && !flipV) {
            video._vtfDesired = null;
            if (video._vtfGuard) { video._vtfGuard.disconnect(); video._vtfGuard = null; }
            video.style.removeProperty("transform");
            return;
        }

        const [a, b, c, d, e, f] = JSON.parse(video.dataset.vtfBase);
        const t = `matrix(${flipH ? -a : a},${b},${c},${flipV ? -d : d},${e},${f})`;
        video._vtfDesired = t;
        video.style.setProperty("transform", t, "important");

        if (!video._vtfGuard) {
            video._vtfGuard = new MutationObserver(() => {
                if (video._vtfDesired && video.style.getPropertyPriority("transform") !== "important") {
                    video.style.setProperty("transform", video._vtfDesired, "important");
                }
            });
            video._vtfGuard.observe(video, { attributes: true, attributeFilter: ["style"] });
        }
    }

    function dedup(s) {
        const h = s.length / 2;
        return s.length > 4 && s.length % 2 === 0 && s.slice(0, h) === s.slice(h)
            ? s.slice(0, h) : s;
    }

    function getName(video) {
        let el = video.parentElement;
        for (let i = 0; i < 10; i++) {
            if (!el || el === document.body) break;
            const raw = (el.getAttribute("aria-label") || "").trim();
            if (raw.length > 0 && raw.length < 120) {
                if (/^your\s+(video|camera|screen)/i.test(raw)) return "You";
                const clean = dedup(
                    raw.replace(/['']s (video|camera|feed|screen|audio|mic)(\s+is\s+\w+)?$/i, "")
                       .replace(/,\s*(muted|unmuted|presenter|presenting|pinned).*$/i, "")
                       .trim()
                );
                if (clean.length > 0 && clean.length < 60) return clean;
            }
            el = el.parentElement;
        }

        const vr = video.getBoundingClientRect();
        const skip = new Set(["muted", "unmuted", "off", "on", "pin", "more", "presenting"]);
        const hits = Array.from(document.querySelectorAll("span, div"))
            .filter(n => {
                if (n.querySelector("video, canvas")) return false;
                if (n.children.length > 1) return false;
                const txt = n.textContent.trim();
                if (txt.length < 2 || txt.length > 50) return false;
                const r = n.getBoundingClientRect();
                return r.width > 0 && r.height > 0
                    && r.left >= vr.left - 10 && r.right  <= vr.right  + 10
                    && r.top  >= vr.top  - 10 && r.bottom <= vr.bottom + 40;
            })
            .map(n => dedup(n.textContent.trim()));

        if (hits.includes("You")) return "You";
        return hits.find(t => !skip.has(t.toLowerCase())) || null;
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    function updateStatus(shadow) {
        const el = shadow.getElementById("vtf-status");
        if (!el) return;
        const videos = getVideos();
        if (!videos.length) { el.textContent = "no video found"; return; }
        const idx = getSelectedIdx(videos);
        setSelected(videos, idx);
        el.textContent = getName(videos[idx]) || `Video ${idx + 1}`;
    }

    function doNext(shadow) {
        const videos = getVideos();
        if (!videos.length) return;
        const next = (getSelectedIdx(videos) + 1) % videos.length;
        setSelected(videos, next);
        const el = shadow.getElementById("vtf-status");
        if (el) el.textContent = getName(videos[next]) || `Video ${next + 1}`;
    }

    function doTransform(action) {
        const videos = getVideos();
        if (!videos.length) return;
        const idx = getSelectedIdx(videos);
        const video = videos[idx];

        if (action === "reset") {
            video._vtfDesired = null;
            if (video._vtfGuard) { video._vtfGuard.disconnect(); video._vtfGuard = null; }
            delete video.dataset.vtfBase;
            video.dataset.vtfH = "0";
            video.dataset.vtfV = "0";
            video.style.removeProperty("transform");
            return;
        }

        snapshot(video);
        if (action === "flip")  video.dataset.vtfH = video.dataset.vtfH === "1" ? "0" : "1";
        if (action === "flipv") video.dataset.vtfV = video.dataset.vtfV === "1" ? "0" : "1";
        applyFlip(video);
    }

    // ── Shadow DOM UI ─────────────────────────────────────────────────────────

    const host = document.createElement("div");
    host.id = ROOT_ID;
    // Zero-size host at bottom-right; children use position:fixed themselves.
    // High z-index so our stacking context sits above Meet's UI layers.
    host.style.cssText = "position:fixed;bottom:0;right:0;width:0;height:0;z-index:2147483647;pointer-events:none;overflow:visible";
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    const iconUrl = chrome.runtime.getURL("VideoTransformIcon.png");

    shadow.innerHTML = `
        <style>
            *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

            #btn {
                position: fixed;
                bottom: 96px;
                right: 24px;
                width: 48px;
                height: 48px;
                background: rgba(26,28,36,0.92);
                backdrop-filter: blur(8px);
                border-radius: 12px;
                cursor: pointer;
                pointer-events: auto;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 14px rgba(0,0,0,0.55);
                border: 2px solid #31354a;
                transition: border-color 0.15s, box-shadow 0.15s;
                user-select: none;
            }
            #btn:hover {
                border-color: #1db89a;
                box-shadow: 0 0 0 4px rgba(29,184,154,0.15), 0 2px 14px rgba(0,0,0,0.55);
            }
            #btn img { width: 28px; height: 28px; object-fit: contain; display: block; }

            #panel {
                position: fixed;
                bottom: 156px;
                right: 24px;
                width: 210px;
                background: rgba(26,28,36,0.96);
                backdrop-filter: blur(14px);
                border-radius: 14px;
                padding: 14px;
                box-shadow: 0 4px 32px rgba(0,0,0,0.65);
                border: 1px solid #31354a;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #dde1ec;
                pointer-events: auto;
                display: none;
            }

            #panel-title {
                font-size: 13px;
                font-weight: 700;
                text-align: center;
                margin-bottom: 12px;
            }

            button {
                display: block;
                width: 100%;
                background: #252833;
                border: 1px solid #31354a;
                border-radius: 7px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 13px;
                font-weight: 500;
                color: #dde1ec;
                padding: 10px 8px;
                margin-bottom: 7px;
                cursor: pointer;
                transition: background 0.12s, border-color 0.12s, color 0.12s;
                text-align: center;
            }
            button:hover { background: #1db89a18; border-color: #1db89a; color: #1db89a; }
            button:active { opacity: 0.75; }
            button.danger:hover { background: #c0505018; border-color: #c05050; color: #c05050; }

            .divider { height: 1px; background: #31354a; margin: 4px 0 10px; }

            #status-line {
                font-size: 11px;
                color: #5c6280;
                text-align: center;
                margin-top: 2px;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            #vtf-status { color: #1db89a; font-weight: 600; }
        </style>

        <div id="btn" title="Video Transformer">
            <img src="${iconUrl}" alt="">
        </div>

        <div id="panel">
            <div id="panel-title">Video Transformer</div>
            <button id="fliph">Flip Horizontal</button>
            <button id="flipv">Flip Vertical</button>
            <button id="reset" class="danger">Reset</button>
            <div class="divider"></div>
            <button id="next">Next Video</button>
            <div id="status-line">Affecting: <span id="vtf-status">—</span></div>
        </div>
    `;

    const btn   = shadow.getElementById("btn");
    const panel = shadow.getElementById("panel");

    btn.addEventListener("click", () => {
        const open = panel.style.display === "block";
        panel.style.display = open ? "none" : "block";
        if (!open) updateStatus(shadow);
    });

    shadow.getElementById("fliph").addEventListener("click", () => doTransform("flip"));
    shadow.getElementById("flipv").addEventListener("click", () => doTransform("flipv"));
    shadow.getElementById("reset").addEventListener("click", () => doTransform("reset"));
    shadow.getElementById("next").addEventListener("click",  () => doNext(shadow));

    // Close when clicking anywhere outside our shadow tree
    document.addEventListener("click", e => {
        if (!e.composedPath().includes(host)) panel.style.display = "none";
    }, true);

})();
