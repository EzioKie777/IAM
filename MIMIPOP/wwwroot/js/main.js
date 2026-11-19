// Entry point: page routing, placeholder game cards and the global Escape key handler.
import { configureLoginPage, refreshAccountActions } from "./auth.js";
import { closeBubbly, openBubbly } from "./games/bubbly.js";
import { closeGame, openGame } from "./games/cue.js";
import { closeFourPlay, openFourPlay } from "./games/fourplay.js";
import { bubblyModal, fourplayModal, gameModal, swapperModal, tongitsModal } from "./games/modals.js";
import { closeSwapper, openSwapper } from "./games/swapper.js";
import { closeTongits, openTongits } from "./games/tongits.js";
import { requestedGame, requestedPage, setGamePageMode } from "./page.js";
import { loadProfilePage } from "./profile.js";
import { showToast } from "./ui.js";

document.querySelectorAll("[data-game]:not([data-billiards-trigger]):not([data-tongits-trigger]):not([data-fourplay-trigger]):not([data-bubbly-trigger]):not([data-swapper-trigger])").forEach((game) => {
    game.addEventListener("click", (event) => {
        event.preventDefault();
        showToast(`${game.dataset.game} is getting ready — check back soon!`);
    });
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !swapperModal.hidden) closeSwapper();
    else if (event.key === "Escape" && !bubblyModal.hidden) closeBubbly();
    else if (event.key === "Escape" && !fourplayModal.hidden) closeFourPlay();
    else if (event.key === "Escape" && !tongitsModal.hidden) closeTongits();
    else if (event.key === "Escape" && !gameModal.hidden) closeGame();
});

if ((window.location.protocol === "http:" || window.location.protocol === "https:") && !requestedGame && !requestedPage) {
    refreshAccountActions().catch(() => {
        showToast("Account service is unavailable. Start the MIMIPOP server to use sign-in.");
    });
}

const gamePages = {
    "cue-the-fun": { title: "Cue The Fun", modal: gameModal, open: () => openGame(null) },
    "tongits-trio": { title: "Tongits Trio", modal: tongitsModal, open: () => openTongits(null) },
    "four-play": { title: "Four Play", modal: fourplayModal, open: () => openFourPlay(null) },
    "pop-the-bubbly": { title: "Pop The Bubbly", modal: bubblyModal, open: () => openBubbly(null) },
    swapper: { title: "Swapper", modal: swapperModal, open: () => openSwapper(null) }
};
const selectedGamePage = gamePages[requestedGame];

if (selectedGamePage) {
    setGamePageMode(true);
    document.body.classList.add("game-page-mode");
    document.title = `${selectedGamePage.title} — MIMIPOP`;
    selectedGamePage.modal.setAttribute("role", "main");
    selectedGamePage.modal.removeAttribute("aria-modal");
    selectedGamePage.open();
} else if (["login", "register", "verify-email", "forgot-password", "reset-password"].includes(requestedPage)) {
    configureLoginPage();
} else if (requestedPage === "profile") {
    loadProfilePage();
}
