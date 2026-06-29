async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

async function execInPage(func, args = []) {
    const tab = await getActiveTab();
    if (!tab?.url?.startsWith("https://meet.google.com/")) {
        document.getElementById("status-text").textContent = "open a Meet call first";
        return undefined;
    }
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func,
            args,
            world: "MAIN"
        });
        return results[0]?.result;
    } catch (e) {
        return undefined;
    }
}

function pageAction(action) {
    function getVideos() {
        return Array.from(document.querySelectorAll("video")).filter(v => {
            const r = v.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
    }

    // Snapshot Meet's natural transform for this video (only once, cleared on reset).
    // We read the computed matrix BEFORE we've applied anything, so we capture
    // whatever Meet set (e.g. scaleX(-1) on the self-view mirror).
    function snapshot(video) {
        if (typeof video.__vtfBaseA !== "undefined") return;
        const raw = getComputedStyle(video).transform;
        const m = new DOMMatrix(raw === "none" ? "matrix(1,0,0,1,0,0)" : raw);
        video.__vtfBaseA = m.a;
        video.__vtfBaseB = m.b;
        video.__vtfBaseC = m.c;
        video.__vtfBaseD = m.d;
        video.__vtfBaseE = m.e;
        video.__vtfBaseF = m.f;
        video.__vtfFlipH = false;
        video.__vtfFlipV = false;
    }

    // Apply the desired transform. Negates a (scaleX) and/or d (scaleY) relative
    // to Meet's natural baseline, then locks it with !important + MutationObserver
    // so Meet can't overwrite our inline style.
    function applyFlip(video) {
        if (!video.__vtfFlipH && !video.__vtfFlipV) {
            video.__vtfDesired = null;
            if (video.__vtfGuard) { video.__vtfGuard.disconnect(); video.__vtfGuard = null; }
            video.style.removeProperty("transform");
            return;
        }

        const a = video.__vtfFlipH ? -(video.__vtfBaseA) : video.__vtfBaseA;
        const d = video.__vtfFlipV ? -(video.__vtfBaseD) : video.__vtfBaseD;
        const t = `matrix(${a},${video.__vtfBaseB},${video.__vtfBaseC},${d},${video.__vtfBaseE},${video.__vtfBaseF})`;

        video.__vtfDesired = t;
        video.style.setProperty("transform", t, "important");

        // Guard: if Meet's JS later overwrites our !important inline style,
        // the MutationObserver fires and immediately restores it.
        if (!video.__vtfGuard) {
            video.__vtfGuard = new MutationObserver(() => {
                if (video.__vtfDesired && video.style.getPropertyPriority("transform") !== "important") {
                    video.style.setProperty("transform", video.__vtfDesired, "important");
                }
            });
            video.__vtfGuard.observe(video, { attributes: true, attributeFilter: ["style"] });
        }
    }

    function dedup(s) {
        const h = s.length / 2;
        return s.length > 4 && s.length % 2 === 0 && s.slice(0, h) === s.slice(h)
            ? s.slice(0, h) : s;
    }

    function getName(video) {
        // 1. Walk up DOM for aria-label
        let el = video.parentElement;
        for (let i = 0; i < 10; i++) {
            if (!el || el === document.body) break;
            const raw = (el.getAttribute("aria-label") || "").trim();
            if (raw.length > 0 && raw.length < 120) {
                if (/^your\s+(video|camera|screen)/i.test(raw)) return "You";
                const clean = dedup(raw
                    .replace(/['']s (video|camera|feed|screen|audio|mic)(\s+is\s+\w+)?$/i, "")
                    .replace(/,\s*(muted|unmuted|presenter|presenting|pinned).*$/i, "")
                    .trim());
                if (clean.length > 0 && clean.length < 60) return clean;
            }
            el = el.parentElement;
        }

        // 2. Positional: find visible text leaf-nodes within the tile's bounding area
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
                    && r.left >= vr.left - 10 && r.right <= vr.right + 10
                    && r.top  >= vr.top  - 10 && r.bottom <= vr.bottom + 40;
            })
            .map(n => dedup(n.textContent.trim()));

        if (hits.includes("You")) return "You";
        return hits.find(t => !skip.has(t.toLowerCase())) || null;
    }

    const videos = getVideos();
    if (!videos.length) return { empty: true };

    let idx = Math.min(window.__videoIndex || 0, videos.length - 1);

    if (action === "next") {
        idx = (idx + 1) % videos.length;
        window.__videoIndex = idx;
        videos.forEach(v => { v.style.outline = ""; v.style.boxShadow = ""; });
        videos[idx].style.outline = "3px solid #1db89a";
        videos[idx].style.boxShadow = "0 0 10px 2px #1db89a55";
        return { name: getName(videos[idx]) || ("Video " + (idx + 1)) };
    }

    if (action !== "status") {
        window.__videoIndex = idx;
        const video = videos[idx];

        if (action === "reset") {
            video.__vtfFlipH = false;
            video.__vtfFlipV = false;
            video.__vtfBaseA = undefined; // cleared so next flip re-snapshots naturally
            video.__vtfDesired = null;
            if (video.__vtfGuard) { video.__vtfGuard.disconnect(); video.__vtfGuard = null; }
            video.style.removeProperty("transform");
            return {};
        }

        // Snapshot natural transform before our first flip on this video.
        // Must happen BEFORE toggling so we capture Meet's baseline, not ours.
        snapshot(video);

        if (action === "flip")  video.__vtfFlipH = !video.__vtfFlipH;
        if (action === "flipv") video.__vtfFlipV = !video.__vtfFlipV;

        applyFlip(video);
        return {};
    }

    // "status" — refresh outline and report name
    window.__videoIndex = idx;
    videos.forEach(v => { v.style.outline = ""; v.style.boxShadow = ""; });
    videos[idx].style.outline = "3px solid #1db89a";
    videos[idx].style.boxShadow = "0 0 10px 2px #1db89a55";
    return { name: getName(videos[idx]) || ("Video " + (idx + 1)) };
}

async function run(action) {
    const result = await execInPage(pageAction, [action]);
    if (!result) return;
    if (result.empty) {
        document.getElementById("status-text").textContent = "no video found";
    } else if (result.name) {
        document.getElementById("status-text").textContent = result.name;
    }
}

document.getElementById("flip-h").addEventListener("click", () => run("flip"));
document.getElementById("flip-v").addEventListener("click", () => run("flipv"));
document.getElementById("reset-btn").addEventListener("click", () => run("reset"));
document.getElementById("next-btn").addEventListener("click", () => run("next"));

run("status");
