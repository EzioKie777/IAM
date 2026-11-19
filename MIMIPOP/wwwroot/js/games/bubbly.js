// Pop The Bubbly slot game.
import { bubblyModal, fourplayModal, gameModal, swapperModal, tongitsModal } from "./modals.js";
import { gamePageMode, returnFromGamePage } from "../page.js";

const bubblyMachine = document.querySelector("#bubbly-machine");
const bubblyReels = Array.from(document.querySelectorAll(".bubbly-reel"));
const bubblyPointsElement = document.querySelector("#bubbly-points");
const bubblySpinsElement = document.querySelector("#bubbly-spins");
const bubblyResultElement = document.querySelector("#bubbly-result");
const bubblySpinButton = document.querySelector("#bubbly-spin");
const bubblySymbols = ["🍒", "🍋", "🍇", "🍀", "🧁", "💎", "🍾"];
let bubblyPoints = 0;
let bubblySpins = 0;
let bubblyIsSpinning = false;
let bubblyRoundId = 0;
let bubblyIntervals = [];
let lastBubblyTrigger;

function updateBubblyStats() {
    bubblyPointsElement.textContent = bubblyPoints.toLocaleString();
    bubblySpinsElement.textContent = String(bubblySpins);
}

function clearBubblySpin() {
    bubblyRoundId += 1;
    bubblyIntervals.forEach((interval) => window.clearInterval(interval));
    bubblyIntervals = [];
    bubblyReels.forEach((reel) => reel.classList.remove("spinning"));
    bubblyIsSpinning = false;
    bubblySpinButton.disabled = false;
    document.querySelector("#bubbly-reset").disabled = false;
}

function resetBubblyGame() {
    clearBubblySpin();
    bubblyPoints = 0;
    bubblySpins = 0;
    bubblyMachine.classList.remove("bubbly-win");
    bubblyReels.forEach((reel, index) => {
        reel.textContent = bubblySymbols[index];
    });
    bubblyResultElement.textContent = "Ready when you are!";
    updateBubblyStats();
}

async function spinBubbly() {
    if (bubblyIsSpinning) return;
    bubblyIsSpinning = true;
    const roundId = ++bubblyRoundId;
    const results = [];
    bubblySpins += 1;
    bubblyMachine.classList.remove("bubbly-win");
    bubblyResultElement.textContent = "Here comes the sparkle…";
    updateBubblyStats();
    bubblySpinButton.disabled = true;
    document.querySelector("#bubbly-reset").disabled = true;

    for (let index = 0; index < bubblyReels.length; index += 1) {
        const reel = bubblyReels[index];
        reel.classList.add("spinning");
        const interval = window.setInterval(() => {
            if (roundId === bubblyRoundId) {
                reel.textContent = bubblySymbols[Math.floor(Math.random() * bubblySymbols.length)];
            }
        }, 75);
        bubblyIntervals.push(interval);
        await new Promise((resolve) => window.setTimeout(resolve, 520 + index * 250));
        window.clearInterval(interval);
        bubblyIntervals = bubblyIntervals.filter((activeInterval) => activeInterval !== interval);
        if (roundId !== bubblyRoundId) return;
        reel.classList.remove("spinning");
        results.push(bubblySymbols[Math.floor(Math.random() * bubblySymbols.length)]);
        reel.textContent = results[index];
    }

    const matches = results.length - new Set(results).size;
    const award = matches === 2 ? 100 : matches === 1 ? 20 : 0;
    bubblyPoints += award;
    bubblyIsSpinning = false;
    bubblySpinButton.disabled = false;
    document.querySelector("#bubbly-reset").disabled = false;
    bubblyMachine.classList.toggle("bubbly-win", award > 0);
    if (award === 100) {
        bubblyResultElement.innerHTML = `<strong>Big pop! Three ${results[0]} — +${award} free-play points!</strong>`;
    } else if (award === 20) {
        const matchingSymbol = results.find((symbol, index) => results.indexOf(symbol) !== index);
        bubblyResultElement.innerHTML = `<strong>Two ${matchingSymbol} — +${award} free-play points!</strong>`;
    } else {
        bubblyResultElement.textContent = "A fresh spin, a fresh chance. Give it another go!";
    }
    updateBubblyStats();
}

export function openBubbly(trigger) {
    lastBubblyTrigger = trigger;
    bubblyModal.hidden = false;
    document.body.classList.add("game-open");
    resetBubblyGame();
    bubblyModal.querySelector("[data-close-bubbly]").focus();
}

export function closeBubbly() {
    if (gamePageMode) {
        returnFromGamePage();
        return;
    }
    clearBubblySpin();
    bubblyModal.hidden = true;
    if (gameModal.hidden && tongitsModal.hidden && fourplayModal.hidden && swapperModal.hidden) document.body.classList.remove("game-open");
    if (lastBubblyTrigger) lastBubblyTrigger.focus();
}

document.querySelector("[data-close-bubbly]").addEventListener("click", closeBubbly);
bubblySpinButton.addEventListener("click", spinBubbly);
document.querySelector("#bubbly-reset").addEventListener("click", resetBubblyGame);
bubblyModal.addEventListener("click", (event) => {
    if (event.target === bubblyModal) closeBubbly();
});
