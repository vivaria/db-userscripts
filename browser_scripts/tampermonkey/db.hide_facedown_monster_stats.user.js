// ==UserScript==
// @name         DuelingBook: Hide Face-Down Field Stats
// @description  Hides the ATK/DEF overlay stats for face-down monsters on the field.
// @version      1.0
// @author       vivaria
// @license      MIT
// @homepageURL  https://github.com/vivaria/edison-scripts-public
// @updateURL    https://github.com/vivaria/edison-scripts-public/raw/main/browser_scripts/tampermonkey/db.hide_facedown_monster_stats.user.js
// @downloadURL  https://github.com/vivaria/edison-scripts-public/raw/main/browser_scripts/tampermonkey/db.hide_facedown_monster_stats.user.js
// @match        *://*.duelingbook.com/replay?id=*
// @grant        unsafeWindow
// ==/UserScript==

// --- unsafeWindow note ---
// Tampermonkey runs userscripts in an isolated JS sandbox, separate from the page's
// own scope. This means page globals like player1, player2, and jQuery ($) are not
// directly accessible. unsafeWindow is Tampermonkey's escape hatch — it points to
// the real window object of the page, letting us read duel.js globals like
// unsafeWindow.player1['m1']. The @grant unsafeWindow header line is required to
// opt in. It's called "unsafe" as a general security caution (a compromised page
// could plant hostile values on window), but for a trusted site this is fine.

(function () {
    'use strict';

    // Maps each stat span ID to the player global and zone key it corresponds to.
    // player1 = the local duelist (hm = "human monster")
    // player2 = the opponent      (om = "opponent monster")
    const ZONE_MAP = [
        { spanId: 'hm1_txt', player: 'player1', zone: 'm1' },
        { spanId: 'hm2_txt', player: 'player1', zone: 'm2' },
        { spanId: 'hm3_txt', player: 'player1', zone: 'm3' },
        { spanId: 'hm4_txt', player: 'player1', zone: 'm4' },
        { spanId: 'hm5_txt', player: 'player1', zone: 'm5' },
        { spanId: 'om1_txt', player: 'player2', zone: 'm1' },
        { spanId: 'om2_txt', player: 'player2', zone: 'm2' },
        { spanId: 'om3_txt', player: 'player2', zone: 'm3' },
        { spanId: 'om4_txt', player: 'player2', zone: 'm4' },
        { spanId: 'om5_txt', player: 'player2', zone: 'm5' },
        // Link Extra zones (hl/ol) are intentionally omitted but could be added here if desired.
    ];

    let observer = null;

    function hideFaceDownStats() {
        const win = unsafeWindow;
        if (!win.player1 || !win.player2) return;

        for (const { spanId, player, zone } of ZONE_MAP) {
            const span = document.getElementById(spanId);
            // Skip spans that are already hidden — nothing to do.
            if (!span || span.style.display === 'none') continue;

            const card = win[player][zone];
            if (!card) continue;

            // card is a jQuery object managed by duel.js; read face_down from its data store.
            if (card.data('face_down')) {
                span.style.setProperty('display', 'none', 'important');
            }
        }
    }

    function setupObserver() {
        const fieldStats = document.getElementById('field_stats');
        if (!fieldStats || observer) return;

        observer = new MutationObserver(() => {
            // Disconnect before touching the DOM to prevent the observer
            // re-triggering itself on our own style changes.
            observer.disconnect();
            hideFaceDownStats();
            observer.observe(fieldStats, observerOptions);
        });

        const observerOptions = {
            subtree: true,
            attributes: true,
            attributeFilter: ['style'],
        };

        observer.observe(fieldStats, observerOptions);
    }

    // #field_stats exists in the static HTML but player1/player2 are not
    // populated until the duel initialises — poll until both are ready.
    const readyInterval = setInterval(() => {
        const win = unsafeWindow;
        if (document.getElementById('field_stats') && win.player1 && win.player2) {
            setupObserver();
            clearInterval(readyInterval);
        }
    }, 500);
})();
