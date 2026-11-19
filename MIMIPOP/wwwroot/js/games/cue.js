// Cue The Fun: billiards table, physics, practice mode, mode picker and live match table.
import { apiRequest } from "../api.js";
import { cueMatchPollTimer, cueMatchState, performCueMatchAction, refreshCueMatchStatus, setCueMatchPollEnabled, setCueMatchState, setCueMatchStatus } from "./cue-match.js";
import { bubblyModal, fourplayModal, gameModal, swapperModal, tongitsModal } from "./modals.js";
import { gamePageMode, returnFromGamePage } from "../page.js";
import { showToast } from "../ui.js";

const gameCanvas = document.querySelector("#billiards-canvas");
const gameContext = gameCanvas.getContext("2d");
const gameScore = document.querySelector("#billiards-score");
const gameMessage = document.querySelector("#billiards-message");
const cueLiveStatusElement = document.querySelector("#cue-live-status");
export const cueEnterMatchButton = document.querySelector("#cue-enter-match");
const cueModePicker = document.querySelector("#cue-mode-picker");
const cuePracticeView = document.querySelector("#cue-practice-view");
const cueMatchmakingView = document.querySelector("#cue-matchmaking");
const powerSlider = document.querySelector("#shot-power");
const powerValue = document.querySelector("#power-value");
const tableBounds = { left: 91, right: 809, top: 73, bottom: 407 };
const pockets = [
    { x: 83, y: 65 }, { x: 450, y: 65 }, { x: 817, y: 65 },
    { x: 83, y: 415 }, { x: 450, y: 415 }, { x: 817, y: 415 }
];
const ballRadius = 13;
const ballColors = ["#ffd166", "#ff5b94", "#7d8cff", "#78e2bd", "#ff914d", "#b794f6", "#f7f0db", "#fa6e76", "#43c4b8", "#e7a8ff"];
let balls = [];
let score = 0;
let aim = { x: 550, y: 240 };
let moving = false;
let animationFrame = 0;
export let cueMode = null;
let cueLiveSocket;
let cueLivePlayerId;
let cueLiveMatchId;
let cueLiveTurnPlayerId;
let cueLiveFinished = false;
let cueLiveClosing = false;
let lastGameTrigger;

function rackBalls() {
    balls = [{ x: 278, y: 240, vx: 0, vy: 0, cue: true, color: "#fffaf4" }];
    let number = 0;
    for (let column = 0; column < 4; column += 1) {
        for (let row = 0; row <= column; row += 1) {
            balls.push({
                x: 594 + column * 28,
                y: 240 + (row - column / 2) * 29,
                vx: 0,
                vy: 0,
                number: number + 1,
                color: ballColors[number]
            });
            number += 1;
        }
    }
    score = 0;
    moving = false;
    updateScore();
    gameMessage.textContent = "Aim and click the table to shoot.";
    drawTable();
}

function updateScore() {
    gameScore.textContent = `${score} / 10 pocketed`;
}

function drawTable() {
    const ctx = gameContext;
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
    ctx.fillStyle = "#392542";
    ctx.fillRect(0, 0, 900, 480);
    ctx.fillStyle = "#b77b4c";
    ctx.beginPath();
    ctx.roundRect(45, 28, 810, 424, 30);
    ctx.fill();
    ctx.fillStyle = "#175448";
    ctx.beginPath();
    ctx.roundRect(70, 50, 760, 380, 23);
    ctx.fill();
    ctx.fillStyle = "#24715b";
    ctx.beginPath();
    ctx.roundRect(tableBounds.left, tableBounds.top, tableBounds.right - tableBounds.left, tableBounds.bottom - tableBounds.top, 13);
    ctx.fill();
    ctx.strokeStyle = "rgba(227, 203, 151, .34)";
    ctx.lineWidth = 2;
    ctx.strokeRect(tableBounds.left + 18, tableBounds.top + 18, tableBounds.right - tableBounds.left - 36, tableBounds.bottom - tableBounds.top - 36);

    pockets.forEach((pocket) => {
        ctx.fillStyle = "#171221";
        ctx.beginPath();
        ctx.arc(pocket.x, pocket.y, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 223, 173, .35)";
        ctx.lineWidth = 3;
        ctx.stroke();
    });

    if (!moving && gameModal && !gameModal.hidden &&
        (cueMode === "practice" || (cueMode === "live" && cueLiveTurnPlayerId === cueLivePlayerId && !cueLiveFinished))) {
        const cue = balls.find((ball) => ball.cue);
        if (cue) {
            const dx = aim.x - cue.x;
            const dy = aim.y - cue.y;
            const length = Math.hypot(dx, dy) || 1;
            const nx = dx / length;
            const ny = dy / length;
            ctx.save();
            ctx.setLineDash([6, 8]);
            ctx.strokeStyle = "rgba(255, 250, 244, .72)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cue.x + nx * ballRadius, cue.y + ny * ballRadius);
            ctx.lineTo(cue.x + nx * 185, cue.y + ny * 185);
            ctx.stroke();
            ctx.restore();
            ctx.strokeStyle = "#d5b68f";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(cue.x - nx * 28, cue.y - ny * 28);
            ctx.lineTo(cue.x - nx * 132, cue.y - ny * 132);
            ctx.stroke();
        }
    }

    balls.forEach((ball) => {
        ctx.fillStyle = "rgba(10, 7, 18, .28)";
        ctx.beginPath();
        ctx.ellipse(ball.x + 3, ball.y + 5, ballRadius, ballRadius * .72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ball.color;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.55)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (!ball.cue) {
            ctx.fillStyle = "#fffaf4";
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#31243a";
            ctx.font = "bold 7px system-ui";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(ball.number), ball.x, ball.y + .5);
        }
    });
}

function advanceBalls() {
    if (!moving) return;
    balls.forEach((ball) => {
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= .986;
        ball.vy *= .986;

        const pocket = pockets.find((spot) => Math.hypot(ball.x - spot.x, ball.y - spot.y) < 21);
        if (pocket) {
            if (ball.cue) {
                ball.x = 278;
                ball.y = 240;
                ball.vx = 0;
                ball.vy = 0;
                gameMessage.textContent = "Scratch! Your cue ball is back in play.";
            } else {
                balls = balls.filter((item) => item !== ball);
                score += 1;
                updateScore();
                gameMessage.textContent = score === 10 ? "Rack cleared — you're a natural!" : "Nice shot! Line up another.";
            }
            return;
        }

        if (ball.x < tableBounds.left + ballRadius) {
            ball.x = tableBounds.left + ballRadius;
            ball.vx = Math.abs(ball.vx) * .82;
        } else if (ball.x > tableBounds.right - ballRadius) {
            ball.x = tableBounds.right - ballRadius;
            ball.vx = -Math.abs(ball.vx) * .82;
        }
        if (ball.y < tableBounds.top + ballRadius) {
            ball.y = tableBounds.top + ballRadius;
            ball.vy = Math.abs(ball.vy) * .82;
        } else if (ball.y > tableBounds.bottom - ballRadius) {
            ball.y = tableBounds.bottom - ballRadius;
            ball.vy = -Math.abs(ball.vy) * .82;
        }
    });

    for (let first = 0; first < balls.length; first += 1) {
        for (let second = first + 1; second < balls.length; second += 1) {
            const a = balls[first];
            const b = balls[second];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distance = Math.hypot(dx, dy);
            if (distance >= ballRadius * 2 || distance === 0) continue;
            const nx = dx / distance;
            const ny = dy / distance;
            const overlap = (ballRadius * 2 - distance) / 2;
            a.x -= nx * overlap;
            a.y -= ny * overlap;
            b.x += nx * overlap;
            b.y += ny * overlap;
            const approach = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (approach < 0) {
                a.vx += approach * nx;
                a.vy += approach * ny;
                b.vx -= approach * nx;
                b.vy -= approach * ny;
            }
        }
    }

    moving = balls.some((ball) => Math.abs(ball.vx) > .08 || Math.abs(ball.vy) > .08);
    if (!moving) {
        balls.forEach((ball) => { ball.vx = 0; ball.vy = 0; });
        if (score === 0 && gameMessage.textContent === "Aim and click the table to shoot.") {
            gameMessage.textContent = "No worries — line it up and try again.";
        } else if (gameMessage.textContent === "The balls are rolling...") {
            gameMessage.textContent = score === 10 ? "Rack cleared — you're a natural!" : "Your turn — line up another.";
        }
    }
}

function animateGame() {
    if (gameModal.hidden || (cueMode !== "practice" && cueMode !== "live")) return;
    if (cueMode === "practice") advanceBalls();
    drawTable();
    animationFrame = window.requestAnimationFrame(animateGame);
}

function shootCue() {
    if (moving) return;
    const cue = balls.find((ball) => ball.cue);
    if (!cue) return;
    const dx = aim.x - cue.x;
    const dy = aim.y - cue.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return;
    if (cueMode === "live") {
        if (!cueLiveSocket || cueLiveSocket.readyState !== WebSocket.OPEN ||
            cueLiveTurnPlayerId !== cueLivePlayerId || cueLiveFinished) {
            return;
        }
        cueLiveSocket.send(JSON.stringify({
            type: "shot",
            aimX: aim.x,
            aimY: aim.y,
            power: Number(powerSlider.value)
        }));
        moving = true;
        gameMessage.textContent = "Shot sent — watching the table…";
        return;
    }
    const speed = 3 + Number(powerSlider.value) * .105;
    cue.vx = dx / distance * speed;
    cue.vy = dy / distance * speed;
    moving = true;
    gameMessage.textContent = "The balls are rolling...";
}

export function openGame(game) {
    lastGameTrigger = game;
    gameModal.hidden = false;
    document.body.classList.add("game-open");
    cueMode = null;
    cueModePicker.hidden = false;
    cuePracticeView.hidden = true;
    cueMatchmakingView.hidden = true;
    setCueMatchPollEnabled(false);
    window.clearTimeout(cueMatchPollTimer);
    window.cancelAnimationFrame(animationFrame);
    gameModal.querySelector("[data-close-game]").focus();
    if (gamePageMode) resumeCueMatch();
}

function resumeCueMatch() {
    cueMode = "classic";
    cueModePicker.hidden = true;
    cuePracticeView.hidden = true;
    cueMatchmakingView.hidden = false;
    document.querySelector("#cue-matchmaking-title").textContent = "Classic · Find a Match";
    document.querySelector("#cue-match-description").textContent =
        "Queue up and get paired with another player.";
    document.querySelector("#cue-classic-actions").hidden = false;
    document.querySelector("#cue-invite-form").hidden = true;
    setCueMatchPollEnabled(true);
    refreshCueMatchStatus().then(() => {
        if (cueMatchState?.state === "matched") {
            enterCueLiveGame();
        } else if (cueMatchState?.state === "idle" &&
            !cueMatchState.incomingInvitations?.length &&
            !cueMatchState.outgoingInvitations?.length) {
            cueMode = null;
            setCueMatchPollEnabled(false);
            window.clearTimeout(cueMatchPollTimer);
            cueModePicker.hidden = false;
            cueMatchmakingView.hidden = true;
        }
    });
}

function selectCueMode(mode) {
    cueMode = mode;
    cueModePicker.hidden = true;
    cuePracticeView.hidden = mode !== "practice";
    cueMatchmakingView.hidden = mode === "practice";
    window.cancelAnimationFrame(animationFrame);

    if (mode === "practice") {
        setCueMatchPollEnabled(false);
        window.clearTimeout(cueMatchPollTimer);
        rackBalls();
        animationFrame = window.requestAnimationFrame(animateGame);
        gameCanvas.focus();
        return;
    }

    const isCustom = mode === "custom";
    document.querySelector("#cue-matchmaking-title").textContent =
        isCustom ? "Custom · Friend Duel" : "Classic · Find a Match";
    document.querySelector("#cue-match-description").textContent = isCustom
        ? "Challenge an accepted friend to a private duel."
        : "Queue up and get paired with another player.";
    document.querySelector("#cue-classic-actions").hidden = isCustom;
    document.querySelector("#cue-invite-form").hidden = !isCustom;
    setCueMatchPollEnabled(true);
    refreshCueMatchStatus().then(() => {
        if (mode === "classic" && cueMatchState?.state === "idle") {
            performCueMatchAction("/api/cue/queue", "POST");
        }
    });
}

function enterCueLiveGame() {
    const match = cueMatchState?.match;
    if (!match) return;

    setCueMatchPollEnabled(false);
    window.clearTimeout(cueMatchPollTimer);
    cueMode = "live";
    cueLiveMatchId = match.id;
    cueLiveClosing = false;
    cueModePicker.hidden = true;
    cueMatchmakingView.hidden = true;
    cuePracticeView.hidden = false;
    cueLiveStatusElement.hidden = false;
    document.querySelector("[data-cue-change-mode]").textContent = "← Leave live match";
    document.querySelector("#rack-balls").hidden = true;
    document.querySelector("#billiards-instructions").textContent =
        "Aim with your pointer, then click or tap to shoot on your turn. The server keeps both tables in sync; turns alternate after each shot.";
    cueLiveStatusElement.classList.remove("error");
    cueLiveStatusElement.textContent = `Connecting to ${match.opponent.name}…`;
    moving = true;
    window.cancelAnimationFrame(animationFrame);
    animationFrame = window.requestAnimationFrame(animateGame);

    const socketScheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    cueLiveSocket = new WebSocket(
        `${socketScheme}//${window.location.host}/api/cue/live?matchId=${encodeURIComponent(match.id)}`
    );
    cueLiveSocket.addEventListener("message", (event) => {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            setCueLiveStatus("The live table sent an unreadable update.", true);
            return;
        }

        if (message.type === "error") {
            moving = false;
            gameMessage.textContent = message.message;
        } else if (message.type === "state") {
            renderCueLiveState(message);
        }
    });
    cueLiveSocket.addEventListener("open", () => {
        setCueLiveStatus(`Connected to ${match.opponent.name}. Loading the shared table…`);
    });
    cueLiveSocket.addEventListener("close", () => {
        if (cueLiveClosing || cueMode !== "live") return;
        moving = true;
        setCueLiveStatus("Connection to the live table was lost. Return to the game menu and rejoin.", true);
    });
    cueLiveSocket.addEventListener("error", () => {
        setCueLiveStatus("Couldn’t connect to the live table. Check the connection and try again.", true);
    });
}

function setCueLiveStatus(message, isError = false) {
    cueLiveStatusElement.textContent = message;
    cueLiveStatusElement.classList.toggle("error", isError);
}

function renderCueLiveState(state) {
    cueLivePlayerId = state.playerId;
    cueLiveTurnPlayerId = state.turnPlayerId;
    cueLiveFinished = state.finished;
    balls = state.balls.map((ball) => ({
        x: ball.x,
        y: ball.y,
        vx: ball.vx,
        vy: ball.vy,
        cue: ball.cue,
        number: ball.number,
        color: ball.cue ? "#fffaf4" : ballColors[ball.number - 1]
    }));
    const waitingForOpponent = state.connectedPlayers < 2;
    moving = state.moving || waitingForOpponent;
    const opponentScore = state.scores[state.opponent.id] ?? 0;
    score = state.scores[state.playerId] ?? 0;
    gameScore.textContent = `You ${score} · ${state.opponent.name} ${opponentScore}`;
    gameMessage.textContent = state.finished
        ? state.message
        : waitingForOpponent ? `Waiting for ${state.opponent.name} to connect…`
            : state.moving ? "The balls are rolling…"
            : state.turnPlayerId === state.playerId ? "Your turn — line up a shot."
                : `${state.opponent.name} is lining up a shot.`;
    setCueLiveStatus(state.finished
        ? state.message
        : waitingForOpponent ? `Waiting for ${state.opponent.name} to connect.`
            : state.turnPlayerId === state.playerId
            ? `Your turn against ${state.opponent.name}.`
            : `${state.opponent.name}’s turn.`);
    document.querySelector("#shot-power").disabled =
        waitingForOpponent || state.turnPlayerId !== state.playerId || state.moving || state.finished;
    gameCanvas.setAttribute("aria-label", `Live billiards match against ${state.opponent.name}. ${gameMessage.textContent}`);
    drawTable();
}

async function changeCueMode() {
    setCueMatchPollEnabled(false);
    window.clearTimeout(cueMatchPollTimer);
    window.cancelAnimationFrame(animationFrame);
    try {
        if (cueMode === "live" && cueMatchState?.state === "matched") {
            cueLiveClosing = true;
            cueLiveSocket?.close(1000, "Leaving match");
            cueLiveSocket = undefined;
            await apiRequest("/api/cue/match/leave", { method: "POST" });
        } else if (cueMatchState?.state === "queued") {
            setCueMatchState(await apiRequest("/api/cue/queue", { method: "DELETE" }));
        } else if (cueMatchState?.state === "matched") {
            setCueMatchState(await apiRequest("/api/cue/match/leave", { method: "POST" }));
        }
    } catch (error) {
        setCueMatchStatus(error instanceof TypeError
            ? "MIMIPOP couldn’t reach the match service."
            : error.message, true);
        return;
    }

    cueMode = null;
    cueLiveMatchId = undefined;
    cueLivePlayerId = undefined;
    cueLiveTurnPlayerId = undefined;
    cueLiveFinished = false;
    cueLiveStatusElement.hidden = true;
    document.querySelector("[data-cue-change-mode]").textContent = "← Change mode";
    document.querySelector("#rack-balls").hidden = false;
    document.querySelector("#billiards-instructions").textContent =
        "Move your pointer to aim, then click or tap the table to shoot. Keyboard players can use the arrow keys to aim and space to shoot. Pocket all 10 balls to clear the rack.";
    document.querySelector("#shot-power").disabled = false;
    cueModePicker.hidden = false;
    cuePracticeView.hidden = true;
    cueMatchmakingView.hidden = true;
    window.cancelAnimationFrame(animationFrame);
    cueModePicker.querySelector("[data-cue-mode]").focus();
}

export function closeGame() {
    if (gamePageMode) {
        const cleanupUrl = cueMatchState?.state === "queued"
            ? "/api/cue/queue"
            : cueMatchState?.state === "matched" ? "/api/cue/match/leave" : null;
        if (!cleanupUrl) {
            returnFromGamePage();
            return;
        }

        cueLiveClosing = true;
        cueLiveSocket?.close(1000, "Leaving match");
        apiRequest(cleanupUrl, { method: cueMatchState.state === "queued" ? "DELETE" : "POST" })
            .catch(() => showToast("Couldn’t leave the Cue The Fun match cleanly."))
            .finally(returnFromGamePage);
        return;
    }
    gameModal.hidden = true;
    setCueMatchPollEnabled(false);
    window.clearTimeout(cueMatchPollTimer);
    if (cueMatchState && cueMatchState.state === "queued") {
        apiRequest("/api/cue/queue", { method: "DELETE" }).catch(() => {
            showToast("Couldn’t cancel your Cue The Fun search.");
        });
    }
    if (tongitsModal.hidden && fourplayModal.hidden && bubblyModal.hidden && swapperModal.hidden) document.body.classList.remove("game-open");
    cueMode = null;
    window.cancelAnimationFrame(animationFrame);
    if (lastGameTrigger) lastGameTrigger.focus();
}

document.querySelector("[data-close-game]").addEventListener("click", closeGame);
document.querySelector("#rack-balls").addEventListener("click", rackBalls);
document.querySelectorAll("[data-cue-mode]").forEach((button) => {
    button.addEventListener("click", () => selectCueMode(button.dataset.cueMode));
});
document.querySelectorAll("[data-cue-change-mode]").forEach((button) => {
    button.addEventListener("click", changeCueMode);
});
cueEnterMatchButton.addEventListener("click", enterCueLiveGame);
gameModal.addEventListener("click", (event) => {
    if (event.target === gameModal) closeGame();
});
powerSlider.addEventListener("input", () => {
    powerValue.textContent = `${powerSlider.value}%`;
});
gameCanvas.addEventListener("pointermove", (event) => {
    const bounds = gameCanvas.getBoundingClientRect();
    aim = {
        x: (event.clientX - bounds.left) * gameCanvas.width / bounds.width,
        y: (event.clientY - bounds.top) * gameCanvas.height / bounds.height
    };
    if (!moving) drawTable();
});
gameCanvas.addEventListener("pointerdown", (event) => {
    const bounds = gameCanvas.getBoundingClientRect();
    aim = {
        x: (event.clientX - bounds.left) * gameCanvas.width / bounds.width,
        y: (event.clientY - bounds.top) * gameCanvas.height / bounds.height
    };
    shootCue();
});
gameCanvas.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 60 : 30;
    const directions = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step]
    };
    if (directions[event.key]) {
        event.preventDefault();
        aim.x = Math.max(tableBounds.left, Math.min(tableBounds.right, aim.x + directions[event.key][0]));
        aim.y = Math.max(tableBounds.top, Math.min(tableBounds.bottom, aim.y + directions[event.key][1]));
        if (!moving) drawTable();
    } else if (event.code === "Space") {
        event.preventDefault();
        shootCue();
    }
});
