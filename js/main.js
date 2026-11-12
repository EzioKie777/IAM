// MIMIPOP client — ES module entry point
import { showToast, getCsrfToken, apiRequest } from "./utils.js";


document.querySelectorAll("[data-message]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.message));
});

const gameModal = document.querySelector("#billiards-modal");
const gameCanvas = document.querySelector("#billiards-canvas");
const gameContext = gameCanvas.getContext("2d");
const gameScore = document.querySelector("#billiards-score");
const gameMessage = document.querySelector("#billiards-message");
const cueLiveStatusElement = document.querySelector("#cue-live-status");
const cueEnterMatchButton = document.querySelector("#cue-enter-match");
const cueModePicker = document.querySelector("#cue-mode-picker");
const cuePracticeView = document.querySelector("#cue-practice-view");
const cueMatchmakingView = document.querySelector("#cue-matchmaking");
const cueMatchStatusElement = document.querySelector("#cue-match-status");
const cueQueueButton = document.querySelector("#cue-queue-button");
const cueCancelQueueButton = document.querySelector("#cue-cancel-queue");
const cueInviteButton = document.querySelector("#cue-invite-button");
const cueFriendSelect = document.querySelector("#cue-friend-select");
const cueMatchCard = document.querySelector("#cue-match-card");
const cueIncomingInvitations = document.querySelector("#cue-incoming-invitations");
const cueOutgoingInvitations = document.querySelector("#cue-outgoing-invitations");
const tongitsModal = document.querySelector("#tongits-modal");
const fourplayModal = document.querySelector("#fourplay-modal");
const bubblyModal = document.querySelector("#bubbly-modal");
const bubblyMachine = document.querySelector("#bubbly-machine");
const bubblyReels = Array.from(document.querySelectorAll(".bubbly-reel"));
const bubblyPointsElement = document.querySelector("#bubbly-points");
const bubblySpinsElement = document.querySelector("#bubbly-spins");
const bubblyResultElement = document.querySelector("#bubbly-result");
const bubblySpinButton = document.querySelector("#bubbly-spin");
const swapperModal = document.querySelector("#swapper-modal");
const swapperBoardElement = document.querySelector("#swapper-board");
const swapperScoreElement = document.querySelector("#swapper-score");
const swapperMovesElement = document.querySelector("#swapper-moves");
const swapperStatusElement = document.querySelector("#swapper-status");
const requestedGame = new URLSearchParams(window.location.search).get("game");
const requestedPage = new URLSearchParams(window.location.search).get("page");
const loginPage = document.querySelector("#login-page");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const loginPassword = document.querySelector("#login-password");
const loginName = document.querySelector("#login-name");
const loginNameField = document.querySelector("#login-name-field");
const loginIsRegister = requestedPage === "register";
const profilePage = document.querySelector("#profile-page");
const profileForm = document.querySelector("#profile-form");
const profileMessage = document.querySelector("#profile-message");
const friendMessage = document.querySelector("#friend-message");
const friendSearchResult = document.querySelector("#friend-search-result");
let gamePageMode = false;
const fourplayBoardElement = document.querySelector("#fourplay-board");
const fourplayTurnElement = document.querySelector("#fourplay-turn");
const tongitsHand = document.querySelector("#tongits-hand");
const tongitsStatus = document.querySelector("#tongits-status");
const tongitsTurnLabel = document.querySelector("#tongits-turn");
const tongitsMelds = document.querySelector("#tongits-melds");
const tongitsStockCount = document.querySelector("#tongits-stock-count");
const tongitsDiscardTop = document.querySelector("#tongits-discard-top");
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
let cueMode = null;
let cueLiveSocket;
let cueLivePlayerId;
let cueLiveMatchId;
let cueLiveTurnPlayerId;
let cueLiveFinished = false;
let cueLiveClosing = false;
let cueMatchPollTimer;
let cueMatchPollInFlight = false;
let cueMatchPollEnabled = false;
let cueMatchFriendsLoaded = false;
let cueMatchState;
let lastGameTrigger;
const tongitsSuits = [
    { name: "clubs", symbol: "♣", red: false },
    { name: "diamonds", symbol: "♦", red: true },
    { name: "hearts", symbol: "♥", red: true },
    { name: "spades", symbol: "♠", red: false }
];
const tongitsRanks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
let tongitsPlayers = [];
let tongitsStock = [];
let tongitsDiscards = [];
let tongitsSelected = new Set();
let tongitsPhase = "over";
let tongitsCurrentPlayer = 0;
let tongitsRoundId = 0;
let lastTongitsTrigger;
const fourplayRows = 6;
const fourplayColumns = 7;
let fourplayBoard = [];
let fourplayFinished = false;
let fourplayThinking = false;
let fourplayWinningCells = [];
let lastFourplayTrigger;
const bubblySymbols = ["🍒", "🍋", "🍇", "🍀", "🧁", "💎", "🍾"];
let bubblyPoints = 0;
let bubblySpins = 0;
let bubblyIsSpinning = false;
let bubblyRoundId = 0;
let bubblyIntervals = [];
let lastBubblyTrigger;
const swapperRows = 8;
const swapperColumns = 8;
const swapperGoal = 500;
const swapperSymbols = ["🍓", "🍋", "🍇", "🫐", "🍀", "💎"];
let swapperBoard = [];
let swapperSelected = null;
let swapperMatches = new Set();
let swapperScore = 0;
let swapperMoves = 20;
let swapperBusy = false;
let swapperOver = false;
let swapperRoundId = 0;
let lastSwapperTrigger;

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

function openGame(game) {
    lastGameTrigger = game;
    gameModal.hidden = false;
    document.body.classList.add("game-open");
    cueMode = null;
    cueModePicker.hidden = false;
    cuePracticeView.hidden = true;
    cueMatchmakingView.hidden = true;
    cueMatchPollEnabled = false;
    window.clearTimeout(cueMatchPollTimer);
    window.cancelAnimationFrame(animationFrame);
    gameModal.querySelector("[data-close-game]").focus();
}

function selectCueMode(mode) {
    cueMode = mode;
    cueModePicker.hidden = true;
    cuePracticeView.hidden = mode !== "practice";
    cueMatchmakingView.hidden = mode === "practice";
    window.cancelAnimationFrame(animationFrame);

    if (mode === "practice") {
        cueMatchPollEnabled = false;
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
    cueMatchPollEnabled = true;
    refreshCueMatchStatus().then(() => {
        if (mode === "classic" && cueMatchState?.state === "idle") {
            performCueMatchAction("/api/cue/queue", "POST");
        }
    });
}

function enterCueLiveGame() {
    const match = cueMatchState?.match;
    if (!match) return;

    cueMatchPollEnabled = false;
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
    cueMatchPollEnabled = false;
    window.clearTimeout(cueMatchPollTimer);
    window.cancelAnimationFrame(animationFrame);
    try {
        if (cueMode === "live" && cueMatchState?.state === "matched") {
            cueLiveClosing = true;
            cueLiveSocket?.close(1000, "Leaving match");
            cueLiveSocket = undefined;
            await apiRequest("/api/cue/match/leave", { method: "POST" });
        } else if (cueMatchState?.state === "queued") {
            cueMatchState = await apiRequest("/api/cue/queue", { method: "DELETE" });
        } else if (cueMatchState?.state === "matched") {
            cueMatchState = await apiRequest("/api/cue/match/leave", { method: "POST" });
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

function returnFromGamePage() {
    if (gamePageMode) window.location.assign("index.html#games");
}

function closeGame() {
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
    cueMatchPollEnabled = false;
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

function tongitsCardLabel(card) {
    return `${card.rank}${card.suit.symbol}`;
}

function tongitsCardPoints(card) {
    const value = tongitsRanks.indexOf(card.rank) + 1;
    return Math.min(value, 10);
}

function tongitsCardOrder(card) {
    return tongitsRanks.indexOf(card.rank) * 4 + tongitsSuits.findIndex((suit) => suit.name === card.suit.name);
}

function tongitsIsMeld(cards) {
    if (cards.length < 3) return false;
    const sameRank = cards.every((card) => card.rank === cards[0].rank);
    if (sameRank) return true;
    if (!cards.every((card) => card.suit.name === cards[0].suit.name)) return false;
    const values = cards.map((card) => tongitsRanks.indexOf(card.rank) + 1).sort((a, b) => a - b);
    return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

function tongitsFindMeld(hand) {
    const ranks = new Map();
    hand.forEach((card) => {
        if (!ranks.has(card.rank)) ranks.set(card.rank, []);
        ranks.get(card.rank).push(card);
    });
    for (const group of ranks.values()) {
        if (group.length >= 3) return group.slice(0, 4);
    }

    for (const suit of tongitsSuits) {
        const suited = hand
            .filter((card) => card.suit.name === suit.name)
            .sort((a, b) => tongitsRanks.indexOf(a.rank) - tongitsRanks.indexOf(b.rank));
        let run = [];
        for (const card of suited) {
            if (run.length && tongitsRanks.indexOf(card.rank) !== tongitsRanks.indexOf(run[run.length - 1].rank) + 1) {
                if (run.length >= 3) return run;
                run = [];
            }
            run.push(card);
        }
        if (run.length >= 3) return run;
    }
    return null;
}

function renderTongits() {
    const player = tongitsPlayers[0];
    if (!player) return;
    const phaseLabels = {
        draw: "Your turn · draw a card",
        discard: "Your turn · lay a meld or discard",
        opponents: `${tongitsPlayers[tongitsCurrentPlayer].name} is thinking…`,
        over: "Hand complete"
    };
    tongitsTurnLabel.textContent = phaseLabels[tongitsPhase];
    tongitsStockCount.textContent = `Stock · ${tongitsStock.length}`;
    document.querySelector("#tongits-mimi-count").textContent = `${tongitsPlayers[1].hand.length} cards`;
    document.querySelector("#tongits-pop-count").textContent = `${tongitsPlayers[2].hand.length} cards`;
    document.querySelector("#tongits-mimi-backs").innerHTML = "<i class=\"tongits-card-back\"></i>".repeat(tongitsPlayers[1].hand.length);
    document.querySelector("#tongits-pop-backs").innerHTML = "<i class=\"tongits-card-back\"></i>".repeat(tongitsPlayers[2].hand.length);

    const discard = tongitsDiscards[tongitsDiscards.length - 1];
    tongitsDiscardTop.classList.toggle("red", Boolean(discard && discard.suit.red));
    tongitsDiscardTop.innerHTML = discard ? `${discard.rank}<small>${discard.suit.symbol}</small>` : "—";

    tongitsMelds.innerHTML = "<strong>Your melds</strong>";
    if (!player.melds.length) {
        tongitsMelds.insertAdjacentHTML("beforeend", "<span>No melds yet</span>");
    } else {
        player.melds.forEach((meld) => {
            const item = document.createElement("span");
            item.className = "tongits-meld";
            item.textContent = meld.map(tongitsCardLabel).join(" ");
            tongitsMelds.append(item);
        });
    }

    tongitsHand.innerHTML = "";
    [...player.hand].sort((a, b) => tongitsCardOrder(a) - tongitsCardOrder(b)).forEach((card) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `tongits-hand-card${card.suit.red ? " red" : ""}${tongitsSelected.has(card.id) ? " selected" : ""}`;
        button.dataset.cardId = card.id;
        button.disabled = tongitsPhase !== "discard";
        button.setAttribute("aria-pressed", String(tongitsSelected.has(card.id)));
        button.setAttribute("aria-label", `${card.rank} of ${card.suit.name}${tongitsSelected.has(card.id) ? ", selected" : ""}`);
        button.innerHTML = `${card.rank}<small>${card.suit.symbol}</small>`;
        button.addEventListener("click", () => {
            if (tongitsPhase !== "discard") return;
            if (tongitsSelected.has(card.id)) tongitsSelected.delete(card.id);
            else tongitsSelected.add(card.id);
            renderTongits();
        });
        tongitsHand.append(button);
    });

    const canDraw = tongitsPhase === "draw";
    document.querySelector("#tongits-draw-stock").disabled = !canDraw || tongitsStock.length === 0;
    document.querySelector("#tongits-draw-discard").disabled = !canDraw || tongitsDiscards.length === 0;
    document.querySelector("#tongits-meld").disabled = tongitsPhase !== "discard" || !tongitsIsMeld(player.hand.filter((card) => tongitsSelected.has(card.id)));
    document.querySelector("#tongits-discard").disabled = tongitsPhase !== "discard" || tongitsSelected.size !== 1;
}

function newTongitsHand() {
    tongitsRoundId += 1;
    tongitsPlayers = [
        { name: "You", hand: [], melds: [] },
        { name: "Mimi", hand: [], melds: [] },
        { name: "Pop", hand: [], melds: [] }
    ];
    tongitsStock = [];
    tongitsDiscards = [];
    tongitsSelected.clear();
    tongitsPhase = "draw";
    tongitsCurrentPlayer = 0;

    let id = 0;
    const deck = [];
    tongitsSuits.forEach((suit) => {
        tongitsRanks.forEach((rank) => {
            deck.push({ id: String(id++), rank, suit });
        });
    });
    for (let index = deck.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    tongitsPlayers.forEach((player) => {
        player.hand = deck.splice(0, 12);
    });
    tongitsDiscards.push(deck.pop());
    tongitsStock = deck;
    tongitsStatus.textContent = "Pick from the stock or take the top discard.";
    renderTongits();
}

function drawTongitsCard(fromDiscard) {
    if (tongitsPhase !== "draw") return;
    const card = fromDiscard ? tongitsDiscards.pop() : tongitsStock.pop();
    if (!card) return;
    tongitsPlayers[0].hand.push(card);
    tongitsSelected.clear();
    tongitsPhase = "discard";
    tongitsStatus.textContent = fromDiscard ? `You picked up ${tongitsCardLabel(card)}. Make a meld or discard.` : "Card drawn. Select a meld or choose one card to discard.";
    renderTongits();
}

function layTongitsMeld() {
    if (tongitsPhase !== "discard") return;
    const player = tongitsPlayers[0];
    const cards = player.hand.filter((card) => tongitsSelected.has(card.id));
    if (!tongitsIsMeld(cards)) {
        tongitsStatus.textContent = "Choose 3 or more matching ranks or consecutive cards in one suit.";
        return;
    }
    const ids = new Set(cards.map((card) => card.id));
    player.hand = player.hand.filter((card) => !ids.has(card.id));
    player.melds.push(cards);
    tongitsSelected.clear();
    renderTongits();
    if (!player.hand.length) {
        tongitsPhase = "over";
        tongitsStatus.innerHTML = "<strong>Tongits! You cleared your hand and won the table!</strong>";
        renderTongits();
    } else {
        tongitsStatus.textContent = "Lovely meld! You can lay another or discard one card.";
    }
}

function finishTongitsRound(winner, message) {
    tongitsPhase = "over";
    tongitsSelected.clear();
    renderTongits();
    const result = winner.name === "You" ? "You win" : `${winner.name} wins`;
    tongitsStatus.innerHTML = `<strong>${message}</strong> ${result} with ${winner.points} unmatched points.`;
}

function endTongitsByScore() {
    const scores = tongitsPlayers.map((player) => ({
        name: player.name,
        points: player.hand.reduce((total, card) => total + tongitsCardPoints(card), 0)
    }));
    const winner = scores.reduce((best, player) => player.points < best.points ? player : best);
    finishTongitsRound(winner, "Stock is empty.");
}

function discardTongitsCard() {
    if (tongitsPhase !== "discard" || tongitsSelected.size !== 1) return;
    const player = tongitsPlayers[0];
    const cardId = tongitsSelected.values().next().value;
    const index = player.hand.findIndex((item) => item.id === cardId);
    if (index < 0) return;
    tongitsDiscards.push(player.hand.splice(index, 1)[0]);
    tongitsSelected.clear();
    if (!player.hand.length) {
        finishTongitsRound({ name: "You", points: 0 }, "Tongits!");
        return;
    }
    tongitsCurrentPlayer = 1;
    tongitsPhase = "opponents";
    tongitsStatus.textContent = "Your card is down. Mimi and Pop are taking their turns…";
    renderTongits();
    playTongitsOpponents(tongitsRoundId);
}

function playTongitsOpponents(roundId) {
    const waitForTurn = () => new Promise((resolve) => window.setTimeout(resolve, 420));
    const takeTurn = async () => {
        while (tongitsPhase === "opponents" && roundId === tongitsRoundId) {
            await waitForTurn();
            if (roundId !== tongitsRoundId || tongitsPhase !== "opponents") return;
            const player = tongitsPlayers[tongitsCurrentPlayer];
            const topDiscard = tongitsDiscards[tongitsDiscards.length - 1];
            const discardMeld = topDiscard && tongitsFindMeld([...player.hand, topDiscard]);
            let drawn;
            if (topDiscard && discardMeld && discardMeld.some((card) => card.id === topDiscard.id)) {
                drawn = tongitsDiscards.pop();
            } else if (tongitsStock.length) {
                drawn = tongitsStock.pop();
            } else {
                drawn = tongitsDiscards.pop();
            }
            if (!drawn) {
                endTongitsByScore();
                return;
            }
            player.hand.push(drawn);
            const meld = tongitsFindMeld(player.hand);
            if (meld) {
                const meldIds = new Set(meld.map((card) => card.id));
                player.hand = player.hand.filter((card) => !meldIds.has(card.id));
                player.melds.push(meld);
            }
            if (!player.hand.length) {
                finishTongitsRound({ name: player.name, points: 0 }, "Tongits!");
                return;
            }
            const discardIndex = player.hand.reduce((highest, card, index, hand) =>
                tongitsCardPoints(card) > tongitsCardPoints(hand[highest]) ? index : highest, 0);
            tongitsDiscards.push(player.hand.splice(discardIndex, 1)[0]);
            tongitsCurrentPlayer = (tongitsCurrentPlayer + 1) % tongitsPlayers.length;
            if (tongitsCurrentPlayer === 0 && tongitsStock.length === 0) {
                endTongitsByScore();
                return;
            }
            renderTongits();
            if (tongitsCurrentPlayer === 0) {
                tongitsPhase = "draw";
                tongitsStatus.textContent = "Your turn. Draw from the stock or take the top discard.";
                renderTongits();
                return;
            }
        }
    }
    takeTurn();
}

function openTongits(trigger) {
    lastTongitsTrigger = trigger;
    tongitsModal.hidden = false;
    document.body.classList.add("game-open");
    newTongitsHand();
    tongitsModal.querySelector("[data-close-tongits]").focus();
}

function closeTongits() {
    if (gamePageMode) {
        returnFromGamePage();
        return;
    }
    tongitsModal.hidden = true;
    if (gameModal.hidden && fourplayModal.hidden && bubblyModal.hidden && swapperModal.hidden) document.body.classList.remove("game-open");
    if (lastTongitsTrigger) lastTongitsTrigger.focus();
}

function renderFourPlay() {
    fourplayBoardElement.innerHTML = "";
    for (let row = 0; row < fourplayRows; row += 1) {
        for (let column = 0; column < fourplayColumns; column += 1) {
            const value = fourplayBoard[row][column];
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = `fourplay-cell${value === 1 ? " player-one" : ""}${value === 2 ? " player-two" : ""}${fourplayWinningCells.some(([winRow, winColumn]) => winRow === row && winColumn === column) ? " winning-cell" : ""}`;
            cell.setAttribute("role", "gridcell");
            cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}${value === 1 ? ", gold disc" : value === 2 ? ", pink disc" : ", empty"}${fourplayWinningCells.some(([winRow, winColumn]) => winRow === row && winColumn === column) ? ", winning disc" : ""}`);
            cell.disabled = value !== 0 || fourplayFinished || fourplayThinking;
            cell.addEventListener("click", () => playFourPlayColumn(column));
            fourplayBoardElement.append(cell);
        }
    }
}

function updateFourPlayTurn(message, player = 1) {
    const discClass = player === 2 ? "fourplay-disc opponent" : "fourplay-disc";
    fourplayTurnElement.innerHTML = `<span class="${discClass}" aria-hidden="true"></span><strong>${message}</strong>`;
}

function findFourPlayWinningCells(player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let row = 0; row < fourplayRows; row += 1) {
        for (let column = 0; column < fourplayColumns; column += 1) {
            if (fourplayBoard[row][column] !== player) continue;
            for (const [rowStep, columnStep] of directions) {
                const cells = [[row, column]];
                for (let step = 1; step < 4; step += 1) {
                    const nextRow = row + rowStep * step;
                    const nextColumn = column + columnStep * step;
                    if (nextRow < 0 || nextRow >= fourplayRows || nextColumn < 0 || nextColumn >= fourplayColumns || fourplayBoard[nextRow][nextColumn] !== player) break;
                    cells.push([nextRow, nextColumn]);
                }
                if (cells.length === 4) return cells;
            }
        }
    }
    return [];
}

function findFourPlayDropRow(column) {
    for (let row = fourplayRows - 1; row >= 0; row -= 1) {
        if (fourplayBoard[row][column] === 0) return row;
    }
    return -1;
}

function getFourPlayWinningMove(player) {
    for (let column = 0; column < fourplayColumns; column += 1) {
        const row = findFourPlayDropRow(column);
        if (row < 0) continue;
        fourplayBoard[row][column] = player;
        const wins = findFourPlayWinningCells(player).length > 0;
        fourplayBoard[row][column] = 0;
        if (wins) return column;
    }
    return -1;
}

function finishFourPlay(winner, message) {
    fourplayFinished = true;
    fourplayThinking = false;
    fourplayWinningCells = winner ? findFourPlayWinningCells(winner) : [];
    updateFourPlayTurn(message, winner || 1);
    renderFourPlay();
}

function dropFourPlayDisc(column, player) {
    const row = findFourPlayDropRow(column);
    if (row < 0) return false;
    fourplayBoard[row][column] = player;
    const winningCells = findFourPlayWinningCells(player);
    if (winningCells.length) {
        fourplayFinished = true;
        fourplayWinningCells = winningCells;
        updateFourPlayTurn(player === 1 ? "You win! ✨" : "Pink takes this one!", player);
    } else if (fourplayBoard.every((boardRow) => boardRow.every((cell) => cell !== 0))) {
        finishFourPlay(0, "It's a draw!");
    }
    return true;
}

function playFourPlayColumn(column) {
    if (fourplayFinished || fourplayThinking || findFourPlayDropRow(column) < 0) return;
    dropFourPlayDisc(column, 1);
    if (fourplayFinished) {
        renderFourPlay();
        return;
    }
    fourplayThinking = true;
    updateFourPlayTurn("Pink is thinking…", 2);
    renderFourPlay();
    const round = fourplayBoard;
    window.setTimeout(() => {
        if (fourplayModal.hidden || round !== fourplayBoard || fourplayFinished) return;
        let columnChoice = getFourPlayWinningMove(2);
        if (columnChoice < 0) columnChoice = getFourPlayWinningMove(1);
        if (columnChoice < 0) {
            const availableColumns = [3, 2, 4, 1, 5, 0, 6].filter((available) => findFourPlayDropRow(available) >= 0);
            columnChoice = availableColumns[Math.floor(Math.random() * Math.min(3, availableColumns.length))];
        }
        if (columnChoice !== undefined && dropFourPlayDisc(columnChoice, 2) && !fourplayFinished) {
            fourplayThinking = false;
            updateFourPlayTurn("Your turn · Gold", 1);
        }
        renderFourPlay();
    }, 430);
}

function newFourPlayGame() {
    fourplayBoard = Array.from({ length: fourplayRows }, () => Array(fourplayColumns).fill(0));
    fourplayFinished = false;
    fourplayThinking = false;
    fourplayWinningCells = [];
    updateFourPlayTurn("Your turn · Gold", 1);
    renderFourPlay();
}

function openFourPlay(trigger) {
    lastFourplayTrigger = trigger;
    fourplayModal.hidden = false;
    document.body.classList.add("game-open");
    newFourPlayGame();
    fourplayModal.querySelector("[data-close-fourplay]").focus();
}

function closeFourPlay() {
    if (gamePageMode) {
        returnFromGamePage();
        return;
    }
    fourplayModal.hidden = true;
    if (gameModal.hidden && tongitsModal.hidden && bubblyModal.hidden && swapperModal.hidden) document.body.classList.remove("game-open");
    if (lastFourplayTrigger) lastFourplayTrigger.focus();
}

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

function findSwapperMatches(board) {
    const matches = new Set();
    const addRun = (run) => {
        if (run.length >= 3) run.forEach((index) => matches.add(index));
    };

    for (let row = 0; row < swapperRows; row += 1) {
        let run = [];
        for (let column = 0; column < swapperColumns; column += 1) {
            const index = row * swapperColumns + column;
            if (board[row][column] !== null && (run.length === 0 || board[row][column] === board[row][column - 1])) {
                run.push(index);
            } else {
                addRun(run);
                run = board[row][column] === null ? [] : [index];
            }
        }
        addRun(run);
    }

    for (let column = 0; column < swapperColumns; column += 1) {
        let run = [];
        for (let row = 0; row < swapperRows; row += 1) {
            const index = row * swapperColumns + column;
            if (board[row][column] !== null && (run.length === 0 || board[row][column] === board[row - 1][column])) {
                run.push(index);
            } else {
                addRun(run);
                run = board[row][column] === null ? [] : [index];
            }
        }
        addRun(run);
    }
    return matches;
}

function hasSwapperMove(board) {
    for (let row = 0; row < swapperRows; row += 1) {
        for (let column = 0; column < swapperColumns; column += 1) {
            for (const [nextRow, nextColumn] of [[row + 1, column], [row, column + 1]]) {
                if (nextRow >= swapperRows || nextColumn >= swapperColumns) continue;
                [board[row][column], board[nextRow][nextColumn]] = [board[nextRow][nextColumn], board[row][column]];
                const createsMatch = findSwapperMatches(board).size > 0;
                [board[row][column], board[nextRow][nextColumn]] = [board[nextRow][nextColumn], board[row][column]];
                if (createsMatch) return true;
            }
        }
    }
    return false;
}

function createSwapperBoard() {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
        const board = [];
        for (let row = 0; row < swapperRows; row += 1) {
            board[row] = [];
            for (let column = 0; column < swapperColumns; column += 1) {
                let choices = swapperSymbols.map((_, index) => index).filter((symbol) => {
                    const makesHorizontalMatch = column >= 2 && board[row][column - 1] === symbol && board[row][column - 2] === symbol;
                    const makesVerticalMatch = row >= 2 && board[row - 1][column] === symbol && board[row - 2][column] === symbol;
                    return !makesHorizontalMatch && !makesVerticalMatch;
                });
                board[row][column] = choices[Math.floor(Math.random() * choices.length)];
            }
        }
        if (hasSwapperMove(board)) return board;
    }
    throw new Error("Unable to create a Swapper board with a valid move.");
}

function renderSwapper() {
    swapperBoardElement.innerHTML = "";
    swapperBoard.forEach((row, rowIndex) => {
        row.forEach((symbolIndex, columnIndex) => {
            const button = document.createElement("button");
            const index = rowIndex * swapperColumns + columnIndex;
            const selected = swapperSelected && swapperSelected.row === rowIndex && swapperSelected.column === columnIndex;
            button.type = "button";
            button.className = `swapper-tile${selected ? " selected" : ""}${swapperMatches.has(index) ? " matched" : ""}`;
            button.setAttribute("role", "gridcell");
            button.setAttribute("aria-label", `${swapperSymbols[symbolIndex]} tile, row ${rowIndex + 1}, column ${columnIndex + 1}${selected ? ", selected" : ""}`);
            button.setAttribute("aria-pressed", String(Boolean(selected)));
            button.textContent = swapperSymbols[symbolIndex];
            button.disabled = swapperBusy || swapperOver;
            button.addEventListener("click", () => selectSwapperTile(rowIndex, columnIndex));
            swapperBoardElement.append(button);
        });
    });
    swapperScoreElement.textContent = swapperScore.toLocaleString();
    swapperMovesElement.textContent = String(swapperMoves);
}

function startSwapperGame() {
    swapperRoundId += 1;
    swapperBoard = createSwapperBoard();
    swapperSelected = null;
    swapperMatches = new Set();
    swapperScore = 0;
    swapperMoves = 20;
    swapperBusy = false;
    swapperOver = false;
    swapperStatusElement.textContent = "Swap neighboring tiles to match three or more.";
    renderSwapper();
}

function selectSwapperTile(row, column) {
    if (swapperBusy || swapperOver) return;
    if (!swapperSelected) {
        swapperSelected = { row, column };
        renderSwapper();
        return;
    }
    if (swapperSelected.row === row && swapperSelected.column === column) {
        swapperSelected = null;
        renderSwapper();
        return;
    }
    const adjacent = Math.abs(swapperSelected.row - row) + Math.abs(swapperSelected.column - column) === 1;
    if (!adjacent) {
        swapperSelected = { row, column };
        renderSwapper();
        swapperStatusElement.textContent = "Choose a neighboring tile to swap.";
        return;
    }
    swapSwapperTiles(row, column);
}

async function swapSwapperTiles(row, column) {
    const first = swapperSelected;
    const roundId = swapperRoundId;
    swapperSelected = null;
    swapperBusy = true;
    [swapperBoard[first.row][first.column], swapperBoard[row][column]] = [swapperBoard[row][column], swapperBoard[first.row][first.column]];
    renderSwapper();
    await new Promise((resolve) => window.setTimeout(resolve, 130));
    if (roundId !== swapperRoundId) return;
    if (findSwapperMatches(swapperBoard).size === 0) {
        [swapperBoard[first.row][first.column], swapperBoard[row][column]] = [swapperBoard[row][column], swapperBoard[first.row][first.column]];
        swapperBusy = false;
        swapperStatusElement.textContent = "That swap didn't make a match. Try another!";
        renderSwapper();
        return;
    }

    swapperMoves -= 1;
    let cascade = 0;
    let matches = findSwapperMatches(swapperBoard);
    while (matches.size > 0) {
        cascade += 1;
        swapperMatches = matches;
        swapperScore += matches.size * 10 * cascade;
        swapperStatusElement.textContent = cascade > 1
            ? `Cascade x${cascade}! Keep it going!`
            : `Nice match! +${matches.size * 10} points.`;
        renderSwapper();
        await new Promise((resolve) => window.setTimeout(resolve, 240));
        if (roundId !== swapperRoundId) return;

        matches.forEach((index) => {
            swapperBoard[Math.floor(index / swapperColumns)][index % swapperColumns] = null;
        });
        for (let column = 0; column < swapperColumns; column += 1) {
            const remaining = [];
            for (let rowIndex = swapperRows - 1; rowIndex >= 0; rowIndex -= 1) {
                if (swapperBoard[rowIndex][column] !== null) remaining.push(swapperBoard[rowIndex][column]);
            }
            for (let rowIndex = swapperRows - 1; rowIndex >= 0; rowIndex -= 1) {
                swapperBoard[rowIndex][column] = remaining[swapperRows - 1 - rowIndex];
                if (swapperBoard[rowIndex][column] === undefined) {
                    swapperBoard[rowIndex][column] = Math.floor(Math.random() * swapperSymbols.length);
                }
            }
        }
        swapperMatches = new Set();
        renderSwapper();
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        if (roundId !== swapperRoundId) return;
        matches = findSwapperMatches(swapperBoard);
    }

    swapperBusy = false;
    if (swapperScore >= swapperGoal) {
        swapperOver = true;
        swapperStatusElement.innerHTML = "<strong>You did it! Goal reached — you're a gem!</strong>";
    } else if (swapperMoves === 0) {
        swapperOver = true;
        swapperStatusElement.textContent = `Game over! You scored ${swapperScore.toLocaleString()} points. Start a new game and try again.`;
    } else {
        if (!hasSwapperMove(swapperBoard)) {
            swapperBoard = createSwapperBoard();
            swapperStatusElement.textContent = "No swaps left — here's a fresh board!";
        }
        renderSwapper();
    }
}

function openSwapper(trigger) {
    lastSwapperTrigger = trigger;
    swapperModal.hidden = false;
    document.body.classList.add("game-open");
    startSwapperGame();
    swapperModal.querySelector("[data-close-swapper]").focus();
}

function closeSwapper() {
    if (gamePageMode) {
        returnFromGamePage();
        return;
    }
    swapperRoundId += 1;
    swapperBusy = false;
    swapperModal.hidden = true;
    if (gameModal.hidden && tongitsModal.hidden && fourplayModal.hidden && bubblyModal.hidden) document.body.classList.remove("game-open");
    if (lastSwapperTrigger) lastSwapperTrigger.focus();
}

function openBubbly(trigger) {
    lastBubblyTrigger = trigger;
    bubblyModal.hidden = false;
    document.body.classList.add("game-open");
    resetBubblyGame();
    bubblyModal.querySelector("[data-close-bubbly]").focus();
}

function closeBubbly() {
    if (gamePageMode) {
        returnFromGamePage();
        return;
    }
    clearBubblySpin();
    bubblyModal.hidden = true;
    if (gameModal.hidden && tongitsModal.hidden && fourplayModal.hidden && swapperModal.hidden) document.body.classList.remove("game-open");
    if (lastBubblyTrigger) lastBubblyTrigger.focus();
}

document.querySelectorAll("[data-game]:not([data-billiards-trigger]):not([data-tongits-trigger]):not([data-fourplay-trigger]):not([data-bubbly-trigger]):not([data-swapper-trigger])").forEach((game) => {
    game.addEventListener("click", (event) => {
        event.preventDefault();
        showToast(`${game.dataset.game} is getting ready — check back soon!`);
    });
});

document.querySelector("[data-close-game]").addEventListener("click", closeGame);
document.querySelector("#rack-balls").addEventListener("click", rackBalls);
document.querySelectorAll("[data-cue-mode]").forEach((button) => {
    button.addEventListener("click", () => selectCueMode(button.dataset.cueMode));
});
document.querySelectorAll("[data-cue-change-mode]").forEach((button) => {
    button.addEventListener("click", changeCueMode);
});
cueQueueButton.addEventListener("click", () => {
    performCueMatchAction("/api/cue/queue", "POST");
});
cueCancelQueueButton.addEventListener("click", () => {
    performCueMatchAction("/api/cue/queue", "DELETE");
});
cueFriendSelect.addEventListener("change", () => {
    cueInviteButton.disabled = !cueFriendSelect.value ||
        Boolean(cueMatchState && cueMatchState.state !== "idle");
});
cueInviteButton.addEventListener("click", () => {
    if (!cueFriendSelect.value) {
        setCueMatchStatus("Choose an accepted friend to challenge.", true);
        return;
    }
    performCueMatchAction(
        "/api/cue/invitations",
        "POST",
        { friendId: cueFriendSelect.value },
        "Friend challenge sent!"
    );
});
document.querySelector("#cue-leave-match").addEventListener("click", () => {
    performCueMatchAction("/api/cue/match/leave", "POST", undefined, "You left the match.");
});
cueEnterMatchButton.addEventListener("click", enterCueLiveGame);
document.querySelector("[data-close-tongits]").addEventListener("click", closeTongits);
document.querySelector("[data-close-fourplay]").addEventListener("click", closeFourPlay);
document.querySelector("[data-close-bubbly]").addEventListener("click", closeBubbly);
document.querySelector("[data-close-swapper]").addEventListener("click", closeSwapper);
document.querySelector("#fourplay-new-game").addEventListener("click", newFourPlayGame);
document.querySelector("#swapper-new-game").addEventListener("click", startSwapperGame);
bubblySpinButton.addEventListener("click", spinBubbly);
document.querySelector("#bubbly-reset").addEventListener("click", resetBubblyGame);
document.querySelector("#tongits-draw-stock").addEventListener("click", () => drawTongitsCard(false));
document.querySelector("#tongits-draw-discard").addEventListener("click", () => drawTongitsCard(true));
document.querySelector("#tongits-meld").addEventListener("click", layTongitsMeld);
document.querySelector("#tongits-discard").addEventListener("click", discardTongitsCard);
document.querySelector("#tongits-new-game").addEventListener("click", newTongitsHand);
gameModal.addEventListener("click", (event) => {
    if (event.target === gameModal) closeGame();
});
tongitsModal.addEventListener("click", (event) => {
    if (event.target === tongitsModal) closeTongits();
});
fourplayModal.addEventListener("click", (event) => {
    if (event.target === fourplayModal) closeFourPlay();
});
bubblyModal.addEventListener("click", (event) => {
    if (event.target === bubblyModal) closeBubbly();
});
swapperModal.addEventListener("click", (event) => {
    if (event.target === swapperModal) closeSwapper();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !swapperModal.hidden) closeSwapper();
    else if (event.key === "Escape" && !bubblyModal.hidden) closeBubbly();
    else if (event.key === "Escape" && !fourplayModal.hidden) closeFourPlay();
    else if (event.key === "Escape" && !tongitsModal.hidden) closeTongits();
    else if (event.key === "Escape" && !gameModal.hidden) closeGame();
});
document.querySelector("#login-password-toggle").addEventListener("click", (event) => {
    const toggle = event.currentTarget;
    const showingPassword = loginPassword.type === "password";
    loginPassword.type = showingPassword ? "text" : "password";
    toggle.textContent = showingPassword ? "Hide" : "Show";
    toggle.setAttribute("aria-label", `${showingPassword ? "Hide" : "Show"} password`);
    toggle.setAttribute("aria-pressed", String(showingPassword));
});
function setLoginStatus(message, isError = false) {
    loginStatus.textContent = message;
    loginStatus.classList.toggle("error", isError);
}

);
    if (!response.ok) throw new Error("Unable to start a secure sign-in request.");
    const result = await response.json();
    if (!result.token) throw new Error("Unable to start a secure sign-in request.");
    return result.token;
}

document.querySelector("#login-forgot").addEventListener("click", () => {
    const email = document.querySelector("#login-email");
    if (!email.value) {
        setLoginStatus("Enter your email address first.", true);
        email.focus();
        return;
    }
    setLoginStatus("Password reset isn’t set up yet. Contact the MIMIPOP team for help.", true);
});
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = document.querySelector("#login-submit");
    submitButton.disabled = true;
    setLoginStatus(loginIsRegister ? "Creating your account…" : "Signing you in…");
    try {
        const token = await getCsrfToken();
        const response = await fetch(loginIsRegister ? "/api/auth/register" : "/api/auth/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": token
            },
            body: JSON.stringify({
                name: loginIsRegister ? loginName.value : undefined,
                email: document.querySelector("#login-email").value,
                password: loginPassword.value,
                rememberMe: document.querySelector("[name='remember']").checked
            })
        });
        const result = await response.json();
        if (!response.ok) {
            setLoginStatus(result.title || "We couldn’t sign you in. Please try again.", true);
            return;
        }
        setLoginStatus(loginIsRegister ? "Your account is ready! Welcome to MIMIPOP." : "Welcome back! Opening MIMIPOP…");
        window.setTimeout(() => window.location.assign("index.html"), 450);
    } catch (error) {
        setLoginStatus(
            error instanceof TypeError
                ? "Can’t reach the account service. Start the MIMIPOP server and try again."
                : error.message,
            true
        );
    } finally {
        submitButton.disabled = false;
    }
});

async function refreshAccountActions() {
    const response = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (response.status === 401) return;
    if (!response.ok) throw new Error("Unable to check your sign-in status.");
    const account = await response.json();
    const profileLink = document.createElement("a");
    profileLink.className = "button button-quiet";
    profileLink.href = "index.html?page=profile";
    profileLink.textContent = `${account.avatar} ${account.name}`;
    const logout = document.createElement("button");
    logout.className = "button button-quiet";
    logout.type = "button";
    logout.textContent = "Log out";
    logout.addEventListener("click", async () => {
        logout.disabled = true;
        try {
            const token = await getCsrfToken();
            const logoutResponse = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "same-origin",
                headers: { "X-CSRF-TOKEN": token }
            });
            if (!logoutResponse.ok) throw new Error("Unable to log out. Please try again.");
            window.location.reload();
        } catch (error) {
            showToast(error instanceof TypeError ? "Account service is unavailable." : error.message);
            logout.disabled = false;
        }
    });
    document.querySelector("#account-actions").replaceChildren(profileLink, logout);
}


function setCueMatchStatus(message, isError = false) {
    cueMatchStatusElement.textContent = message;
    cueMatchStatusElement.classList.toggle("error", isError);
}

async function loadCueFriends() {
    const response = await fetch("/api/friends", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
    });
    if (!response.ok) {
        throw new Error(response.status === 401
            ? "Sign in to challenge friends."
            : "Couldn’t load your friends for a Cue The Fun challenge.");
    }

    const relations = await response.json();
    const friends = relations.filter((relation) => relation.relationship === "friends");
    cueFriendSelect.replaceChildren(new Option(
        friends.length ? "Choose a friend…" : "Add a friend to challenge",
        ""
    ));
    friends.forEach((relation) => {
        cueFriendSelect.add(new Option(`${relation.other.avatar} ${relation.other.name}`, relation.other.id));
    });
    cueMatchFriendsLoaded = true;
    cueFriendSelect.disabled = friends.length === 0;
    cueInviteButton.disabled = friends.length === 0;
}

function renderCueInvitationList(container, items, incoming) {
    container.replaceChildren();
    if (!items.length) return;

    const heading = document.createElement("strong");
    heading.className = "cue-invitation-title";
    heading.textContent = incoming ? "Challenges for you" : "Challenges sent";
    container.append(heading);
    items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "cue-invitation-card";
        const player = document.createElement("div");
        player.className = "cue-match-player";
        const avatar = document.createElement("span");
        avatar.className = "cue-match-avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = item.other.avatar;
        const name = document.createElement("strong");
        name.textContent = incoming
            ? `${item.other.name} challenged you`
            : `Waiting for ${item.other.name}`;
        player.append(avatar, name);
        card.append(player);

        const actions = document.createElement("div");
        actions.className = "cue-match-actions";
        const addButton = (label, action, primary = false) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = `button ${primary ? "button-primary" : "button-quiet"}`;
            button.textContent = label;
            button.addEventListener("click", async () => {
                button.disabled = true;
                try {
                    cueMatchState = await apiRequest(
                        `/api/cue/invitations/${encodeURIComponent(item.id)}/${action}`,
                        { method: "POST" }
                    );
                    renderCueMatchState(cueMatchState);
                } catch (error) {
                    setCueMatchStatus(error instanceof TypeError
                        ? "MIMIPOP couldn’t reach the match service."
                        : error.message, true);
                    button.disabled = false;
                }
            });
            actions.append(button);
        };
        if (incoming) {
            addButton("Accept", "accept", true);
            addButton("Decline", "decline");
        } else {
            addButton("Cancel", "cancel");
        }
        card.append(actions);
        container.append(card);
    });
}

function renderCueMatchState(state) {
    cueMatchState = state;
    const incoming = state.incomingInvitations || [];
    const outgoing = state.outgoingInvitations || [];
    const hasPendingChallenge = incoming.length > 0 || outgoing.length > 0;
    const busy = state.state !== "idle" || hasPendingChallenge;
    const match = state.match;

    cueMatchCard.hidden = !match;
    if (match) {
        document.querySelector("#cue-match-avatar").textContent = match.opponent.avatar;
        document.querySelector("#cue-match-name").textContent = match.opponent.name;
        document.querySelector("#cue-match-mode").textContent = match.mode === "friends"
            ? "Custom friend duel"
            : "Classic live match";
        cueEnterMatchButton.hidden = false;
        setCueMatchStatus(`Match found with ${match.opponent.name}. Enter the live table when you’re ready.`);
    } else if (state.state === "queued") {
        cueEnterMatchButton.hidden = true;
        setCueMatchStatus("Searching for another player… You can cancel any time.");
    } else {
        cueEnterMatchButton.hidden = true;
        setCueMatchStatus(hasPendingChallenge
            ? "Respond to your pending friend challenge before entering another match."
            : cueMode === "custom" ? "Choose a friend to send a duel challenge."
                : "Choose Practice or search for a Classic match.");
    }

    cueQueueButton.disabled = busy;
    cueQueueButton.textContent = match ? "Match found" : state.state === "queued" ? "Searching…" : "Find a match";
    cueCancelQueueButton.hidden = state.state !== "queued";
    cueFriendSelect.disabled = busy || cueFriendSelect.options.length <= 1;
    cueInviteButton.disabled = busy || !cueFriendSelect.value;
    document.querySelector("#cue-leave-match").hidden = !match;
    renderCueInvitationList(cueIncomingInvitations, incoming, true);
    renderCueInvitationList(cueOutgoingInvitations, outgoing, false);
}

async function refreshCueMatchStatus() {
    if (!cueMatchPollEnabled || cueMatchPollInFlight) return;
    cueMatchPollInFlight = true;
    try {
        const response = await fetch("/api/cue/status", {
            credentials: "same-origin",
            headers: { Accept: "application/json" }
        });
        if (response.status === 401) {
            cueMatchPollEnabled = false;
            document.querySelector("#cue-sign-in").hidden = false;
            cueQueueButton.disabled = true;
            cueFriendSelect.disabled = true;
            cueInviteButton.disabled = true;
            cueCancelQueueButton.hidden = true;
            setCueMatchStatus("Sign in to find a match or challenge friends.");
            return;
        }
        if (!response.ok) {
            if (response.headers.get("content-type")?.includes("json")) {
                const error = await response.json();
                throw new Error(error.title || "Couldn’t check your Cue The Fun match.");
            }
            throw new Error("Couldn’t check your Cue The Fun match.");
        }

        document.querySelector("#cue-sign-in").hidden = true;
        renderCueMatchState(await response.json());
        if (!cueMatchFriendsLoaded) {
            await loadCueFriends();
            renderCueMatchState(cueMatchState);
        }
    } catch (error) {
        setCueMatchStatus(error instanceof TypeError
            ? "MIMIPOP couldn’t reach the match service."
            : error.message, true);
    } finally {
        cueMatchPollInFlight = false;
        if (cueMatchPollEnabled && !gameModal.hidden) {
            cueMatchPollTimer = window.setTimeout(refreshCueMatchStatus, 3000);
        }
    }
}

async function performCueMatchAction(url, method, body, successMessage) {
    cueQueueButton.disabled = true;
    cueInviteButton.disabled = true;
    try {
        const status = await apiRequest(url, { method, body });
        renderCueMatchState(status);
        if (successMessage) setCueMatchStatus(successMessage);
    } catch (error) {
        setCueMatchStatus(error instanceof TypeError
            ? "MIMIPOP couldn’t reach the match service."
            : error.message, true);
        cueQueueButton.disabled = false;
        cueInviteButton.disabled = false;
    }
}

function setProfileMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
}

async function loadProfilePage() {
    document.body.classList.add("profile-page-mode");
    profilePage.hidden = false;
    document.title = "Your profile — MIMIPOP";
    try {
        const profile = await apiRequest("/api/profile");
        document.querySelector("#profile-name").value = profile.name;
        document.querySelector("#profile-avatar").value = profile.avatar;
        document.querySelector("#profile-bio").value = profile.bio;
        document.querySelector("#profile-favorite-game").value = profile.favoriteGame;
        document.querySelector("#profile-country").value = profile.country;
        document.querySelector("#profile-email").textContent = profile.email;
        document.querySelector("#profile-avatar-preview").textContent = profile.avatar;
        document.querySelector("#profile-member-since").textContent =
            `Member since ${new Date(profile.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`;
        await Promise.all([refreshAccountActions(), loadFriends()]);
    } catch (error) {
        if (!window.location.href.includes("page=login")) {
            setProfileMessage(profileMessage, error instanceof TypeError ? "MIMIPOP couldn’t reach the account service." : error.message, true);
        }
    }
}

async function loadFriends() {
    const relations = await apiRequest("/api/friends");
    const lists = {
        incoming: document.querySelector("#incoming-friends"),
        accepted: document.querySelector("#accepted-friends"),
        outgoing: document.querySelector("#outgoing-friends")
    };
    Object.values(lists).forEach((list) => list.replaceChildren());
    const grouped = { incoming: [], accepted: [], outgoing: [] };
    relations.forEach((relation) => {
        if (relation.relationship === "incoming") grouped.incoming.push(relation);
        else if (relation.relationship === "friends") grouped.accepted.push(relation);
        else if (relation.relationship === "outgoing") grouped.outgoing.push(relation);
    });

    for (const [kind, items] of Object.entries(grouped)) {
        if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "friend-empty";
            empty.textContent = kind === "incoming"
                ? "No new requests right now."
                : kind === "accepted" ? "Your friend list is ready for your first connection." : "No requests sent.";
            lists[kind].append(empty);
        } else {
            items.forEach((item) => lists[kind].append(createFriendCard(item, kind)));
        }
    }
}

function createFriendCard(item, kind, relationship = item.relationship, onRequest = null) {
    const card = document.createElement("article");
    card.className = "friend-card";
    const avatar = document.createElement("span");
    avatar.className = "friend-card-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = item.other.avatar;
    const copy = document.createElement("div");
    copy.className = "friend-card-copy";
    const name = document.createElement("strong");
    name.textContent = item.other.name;
    const details = document.createElement("span");
    details.textContent = [item.other.favoriteGame, item.other.country].filter(Boolean).join(" · ") || "MIMIPOP member";
    copy.append(name, details);
    if (item.other.bio) {
        const bio = document.createElement("span");
        bio.textContent = item.other.bio;
        copy.append(bio);
    }
    card.append(avatar, copy);

    const actions = document.createElement("div");
    actions.className = "friend-card-actions";
    const addAction = (label, action, isPrimary = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `button ${isPrimary ? "button-primary" : "button-quiet"}`;
        button.textContent = label;
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                if (action === "request") {
                    if (!onRequest) throw new Error("Friend request is unavailable.");
                    await onRequest();
                    button.disabled = false;
                    return;
                }
                if (action === "remove" && !window.confirm(`Remove ${item.other.name} from your friends?`)) {
                    button.disabled = false;
                    return;
                }
                const url = action === "remove"
                    ? `/api/friends/${encodeURIComponent(item.other.id)}`
                    : `/api/friends/requests/${encodeURIComponent(item.id)}/${action}`;
                await apiRequest(url, { method: action === "remove" ? "DELETE" : "POST" });
                friendSearchResult.replaceChildren();
                setProfileMessage(friendMessage, action === "accept" ? "You’re friends now!" : "Friend list updated.");
                await loadFriends();
            } catch (error) {
                setProfileMessage(friendMessage, error instanceof TypeError ? "MIMIPOP couldn’t reach the account service." : error.message, true);
                button.disabled = false;
            }
        });
        actions.append(button);
    };

    if (kind === "incoming") {
        addAction("Accept", "accept", true);
        addAction("Decline", "decline");
    } else if (kind === "outgoing") {
        addAction("Cancel", "cancel");
    } else if (kind === "accepted") {
        addAction("Remove", "remove");
    } else if (relationship === "none") {
        addAction("Add friend", "request", true);
    } else if (relationship === "incoming") {
        const incoming = document.createElement("span");
        incoming.className = "friend-card-copy";
        incoming.textContent = "They sent you a request";
        actions.append(incoming);
    } else {
        const state = document.createElement("span");
        state.className = "friend-card-copy";
        state.textContent = relationship === "friends" ? "Already friends" : "Request sent";
        actions.append(state);
    }
    if (actions.childElementCount) card.append(actions);
    return card;
}

async function sendFriendRequestFromSearch(email) {
    try {
        await apiRequest("/api/friends/requests", { method: "POST", body: { email } });
        setProfileMessage(friendMessage, "Friend request sent!");
        await loadFriends();
        await searchForFriend(email);
    } catch (error) {
        setProfileMessage(friendMessage, error instanceof TypeError ? "MIMIPOP couldn’t reach the account service." : error.message, true);
    }
}

async function searchForFriend(email) {
    friendSearchResult.replaceChildren();
    setProfileMessage(friendMessage, "Looking for that member…");
    try {
        const result = await apiRequest("/api/friends/search", {
            method: "POST",
            body: { email }
        });
        const card = createFriendCard(
            { id: "", other: result.target },
            "search",
            result.relationship,
            () => sendFriendRequestFromSearch(email)
        );
        friendSearchResult.append(card);
        setProfileMessage(friendMessage, "");
    } catch (error) {
        setProfileMessage(friendMessage, error instanceof TypeError ? "MIMIPOP couldn’t reach the account service." : error.message, true);
    }
}

profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const saveButton = document.querySelector("#profile-save");
    saveButton.disabled = true;
    setProfileMessage(profileMessage, "Saving your profile…");
    try {
        const profile = await apiRequest("/api/profile", {
            method: "PUT",
            body: {
                name: document.querySelector("#profile-name").value,
                avatar: document.querySelector("#profile-avatar").value,
                bio: document.querySelector("#profile-bio").value,
                favoriteGame: document.querySelector("#profile-favorite-game").value,
                country: document.querySelector("#profile-country").value
            }
        });
        document.querySelector("#profile-avatar-preview").textContent = profile.avatar;
        setProfileMessage(profileMessage, "Profile saved!");
        await refreshAccountActions();
    } catch (error) {
        setProfileMessage(profileMessage, error instanceof TypeError ? "MIMIPOP couldn’t reach the account service." : error.message, true);
    } finally {
        saveButton.disabled = false;
    }
});

document.querySelector("#profile-avatar").addEventListener("change", (event) => {
    document.querySelector("#profile-avatar-preview").textContent = event.currentTarget.value;
});

document.querySelector("#friend-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await searchForFriend(document.querySelector("#friend-search-email").value);
});

function configureLoginPage() {
    document.body.classList.add("login-page-mode");
    loginPage.hidden = false;
    loginNameField.hidden = !loginIsRegister;
    loginName.required = loginIsRegister;
    loginPassword.minLength = loginIsRegister ? 12 : 0;
    loginPassword.autocomplete = loginIsRegister ? "new-password" : "current-password";
    loginPage.querySelector(".section-kicker").textContent = loginIsRegister ? "JOIN THE CLUB" : "MEMBER SIGN-IN";
    loginPage.querySelector(".login-story-copy h1").innerHTML = loginIsRegister
        ? "GOOD VIBES.<br>COME ON IN."
        : "GOOD VIBES.<br>WELCOME BACK.";
    document.querySelector("#login-title").textContent = loginIsRegister ? "Let’s make it official!" : "Hey, cutie!";
    document.querySelector(".login-lede", loginPage).textContent = loginIsRegister
        ? "Create your account and save your seat at the table."
        : "Sign in to pick up where the fun left off.";
    document.querySelector("#login-submit").innerHTML = loginIsRegister
        ? "Create account <span aria-hidden=\"true\">→</span>"
        : "Log in <span aria-hidden=\"true\">→</span>";
    document.querySelector("#login-forgot").hidden = loginIsRegister;
    document.querySelector("#login-remember").hidden = loginIsRegister;
    document.querySelector("#login-form-section").setAttribute("aria-label", loginIsRegister ? "Create an account" : "Sign in");
    document.querySelector("#login-switch").innerHTML = loginIsRegister
        ? "Already a MIMIPOP member? <a href=\"index.html?page=login\">Log in</a>"
        : "New to MIMIPOP? <a href=\"index.html?page=register\">Join the club</a>";
    document.title = loginIsRegister ? "Join MIMIPOP" : "Log in — MIMIPOP";
}

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
    gamePageMode = true;
    document.body.classList.add("game-page-mode");
    document.title = `${selectedGamePage.title} — MIMIPOP`;
    selectedGamePage.modal.setAttribute("role", "main");
    selectedGamePage.modal.removeAttribute("aria-modal");
    selectedGamePage.open();
} else if (requestedPage === "login" || requestedPage === "register") {
    configureLoginPage();
} else if (requestedPage === "profile") {
    loadProfilePage();
}
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
