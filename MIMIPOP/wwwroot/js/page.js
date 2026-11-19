// Page-level state read from the URL (?game=, ?page=) and helpers for standalone game pages.

export const requestedGame = new URLSearchParams(window.location.search).get("game");
export const requestedPage = new URLSearchParams(window.location.search).get("page");
export let gamePageMode = false;

export function returnFromGamePage() {
    if (gamePageMode) window.location.assign("index.html#games");
}

export function setGamePageMode(value) {
    gamePageMode = value;
}
