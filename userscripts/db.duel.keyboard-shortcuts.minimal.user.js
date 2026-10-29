// ==UserScript==
// @name         DB - Duel: Minimal keyboard shortcuts
// @namespace    db-interface
// @version      1.0.0
// @description  Keyboard shortcuts for Think and OK buttons in DuelingBook duels.
// @author       vivaria
// @match        https://www.duelingbook.com/*
// @match        https://duelingbook.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/vivaria/db-userscripts
// @updateURL    https://github.com/vivaria/db-userscripts/raw/main/userscripts/db.duel.keyboard-shortcuts.minimal.user.js
// @downloadURL  https://github.com/vivaria/db-userscripts/raw/main/userscripts/db.duel.keyboard-shortcuts.minimal.user.js
// ==/UserScript==

(function () {
    "use strict";

    // Customize these shortcuts by setting each value to a KeyboardEvent.code, such as "KeyT", "KeyO", or "ArrowDown".
    // Reference: https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values
    const SHORTCUTS = {
        ok: "KeyF", // Home row for left hand: Index finger
        think: "KeyD", // Home row for left hand: Middle finger
    };

    const BUTTONS = {
        ok: "#good_btn",
        think: "#think_btn",
    };

    /** Returns whether the event target is an editable element. */
    function isTypingTarget(target) {
        return target instanceof Element &&
            (target.matches("input, textarea, select") || target.isContentEditable);
    }

    /** Handles configured shortcuts and clicks the corresponding duel button. */
    function onKeydown(event) {
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        if (isTypingTarget(event.target)) return;

        const action = Object.keys(SHORTCUTS).find(
            (name) => event.code === SHORTCUTS[name]
        );
        if (!action) return;

        const button = document.querySelector(BUTTONS[action]);
        if (!button) return;

        event.preventDefault();
        if (!event.repeat) button.click();
    }

    window.addEventListener("keydown", onKeydown, true);
})();
