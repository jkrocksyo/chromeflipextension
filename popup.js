let currentVideoIndex = 1;

document.getElementById("invert").addEventListener("click", () => {
    sendMessageToContentScript("flip");
});

document.getElementById("rotate").addEventListener("click", () => {
    sendMessageToContentScript("rotate");
});

document.getElementById("reset").addEventListener("click", () => {
    sendMessageToContentScript("reset");
});

document.getElementById("next").addEventListener("click", () => {
    sendMessageToContentScript("next");
});

function sendMessageToContentScript(action) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: transformVideo,
            args: [action],
            world: "MAIN" // This is important to access page context (videos inside Shadow DOM)
        });
    });
}

function transformVideo(action) {
    const videos = Array.from(document.querySelectorAll("video")).filter(v => v.offsetParent !== null);
    if (videos.length === 0) {
        console.warn("No visible video elements found.");
        return;
    }

    window.__videoIndex = window.__videoIndex || 0;


if (action === "next") {
    // Move to next video
    window.__videoIndex = (window.__videoIndex + 1) % videos.length;

    // Clear previous highlights
    videos.forEach(v => {
        v.style.outline = "";
        v.style.boxShadow = "";
        v.style.zIndex = "";
        v.style.position = "";
    });

    const selected = videos[window.__videoIndex];

    // Add red border
    selected.style.outline = "4px solid red";
    selected.style.boxShadow = "0 0 15px 5px red";
    selected.style.zIndex = "9999";
    selected.style.position = "relative";

    // Show updated message AFTER index is updated
    const current = window.__videoIndex + 1;
    const total = videos.length;
    const message = `Transforming Video ${current}/${total}`;
    showFloatingMessage(message);

    return;
}

    function showFloatingMessage(text) {
        let existing = document.getElementById("__videoMessage");
        if (existing) existing.remove();
    
        const msg = document.createElement("div");
        msg.id = "__videoMessage";
        msg.innerText = text;
        msg.style.position = "fixed";
        msg.style.top = "20px";
        msg.style.left = "50%";
        msg.style.transform = "translateX(-50%)";
        msg.style.padding = "10px 20px";
        msg.style.background = "rgba(0,0,0,0.8)";
        msg.style.color = "white";
        msg.style.fontSize = "16px";
        msg.style.borderRadius = "8px";
        msg.style.zIndex = "10000";
        msg.style.boxShadow = "0 0 10px rgba(0,0,0,0.5)";
        document.body.appendChild(msg);
    
        setTimeout(() => {
            msg.remove();
        }, 1500);
    }

    // Remove previous highlights
    videos.forEach(v => {
        v.style.outline = "";
        v.style.boxShadow = "";
        v.style.zIndex = "";
        v.style.position = "";
    });

    if (action === "next") {
        // Move to next video
        window.__videoIndex = (window.__videoIndex + 1) % videos.length;

        const selected = videos[window.__videoIndex];

        // Add strong visible highlight
        selected.style.outline = "4px solid red";
        selected.style.boxShadow = "0 0 15px 5px red";
        selected.style.zIndex = "9999";
        selected.style.position = "relative";

        return;
    }

    const video = videos[window.__videoIndex];
    if (!video) return;

    if (action === "flip") {
        video.style.transform = video.style.transform.includes("scaleX(-1)")
            ? video.style.transform.replace("scaleX(-1)", "")
            : video.style.transform + " scaleX(-1)";
    } else if (action === "rotate") {
        video.style.transform = video.style.transform.includes("rotate(180deg)")
            ? video.style.transform.replace("rotate(180deg)", "")
            : video.style.transform + " rotate(180deg)";
    } else if (action === "reset") {
        video.style.transform = "";
    }
}