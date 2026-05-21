// ==UserScript==
// @name         DuelingBook: Toggle Replay Perspective
// @description  Adds a button to switch the player whose perspective the replay is viewed from
// @version      1.1
// @author       vivaria
// @license      MIT
// @homepageURL  https://github.com/vivaria/edison-scripts-public
// @updateURL    https://github.com/vivaria/edison-scripts-public/raw/main/browser_scripts/tampermonkey/db.toggle_replay_perspective.user.js
// @downloadURL  https://github.com/vivaria/edison-scripts-public/raw/main/browser_scripts/tampermonkey/db.toggle_replay_perspective.user.js
// @match        *://*.duelingbook.com/replay?id=*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Parse the URL id param, which may be either:
  //   "playerid-replayid"  (perspective URL)
  //   "replayid"           (neutral URL, defaults to P1 perspective)
  const urlParams = new URLSearchParams(window.location.search);
  const idParam = urlParams.get("id");
  const parts = idParam?.split("-") || [];

  // If two parts: [currentPlayerId, replayId]. If one part: [replayId] with no known player.
  const [currentPlayerId, replayId] = parts.length >= 2
    ? [parts[0], parts[1]]
    : [null, parts[0]];

  if (!replayId) {
    console.warn("⚠️ Failed to parse replay ID from URL.");
    return;
  }

  // Hook fetch
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const url = args[0];
    if (typeof url === "string" && url.includes("/view-replay")) {
      return originalFetch.apply(this, args).then(async response => {
        const clone = response.clone();
        try {
          const json = await clone.json();
          handleReplayJSON(json);
        } catch (err) {
          console.error("❌ Fetch JSON parse failed", err);
        }
        return response;
      });
    }

    return originalFetch.apply(this, args);
  };

  // Hook XHR
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    this.addEventListener('load', function () {
      const url = this._url;
      if (url.includes("/view-replay")) {
        try {
          const json = JSON.parse(this.responseText);
          handleReplayJSON(json);
        } catch (err) {
          console.error("❌ XHR JSON parse failed", err);
        }
      }
    });

    return originalSend.apply(this, arguments);
  };

  function handleReplayJSON(json) {
    const p1_id = json?.player1?.user_id?.toString();
    const p2_id = json?.player2?.user_id?.toString();
    const p1_name = json?.player1?.username || "Player 1";
    const p2_name = json?.player2?.username || "Player 2";

    if (!p1_id || !p2_id) {
      console.warn("⚠️ Missing one or both player IDs in response.");
      return;
    }

    // If currentPlayerId is absent (neutral URL), the site defaults to P1's perspective,
    // so we treat it as viewing P1 and offer a switch to P2.
    const isViewingP1 = !currentPlayerId || currentPlayerId === p1_id;
    const otherId = isViewingP1 ? p2_id : p1_id;
    const otherName = isViewingP1 ? p2_name : p1_name;

    const newURL = `https://www.duelingbook.com/replay?id=${otherId}-${replayId}`;
    insertLink(newURL, otherName);
  }

  function insertLink(url, otherName) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => addLink(url, otherName));
    } else {
      addLink(url, otherName);
    }
  }

  function addLink(url, otherName) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.textContent = `Switch player perspectives`;
    link.style.position = "fixed";
    link.style.top = "10px";
    link.style.right = "10px";
    link.style.zIndex = "10000";
    link.style.background = "#f0f0f0";
    link.style.border = "1px solid #ccc";
    link.style.padding = "6px 10px";
    link.style.borderRadius = "6px";
    link.style.boxShadow = "0 2px 5px rgba(0,0,0,0.1)";
    link.style.fontSize = "14px";
    link.style.textDecoration = "none";
    link.style.color = "#333";

    document.body.appendChild(link);
  }
})();