// Tongits Trio card game.
import { bubblyModal, fourplayModal, gameModal, swapperModal, tongitsModal } from "./modals.js";
import { gamePageMode, returnFromGamePage } from "../page.js";

const tongitsHand = document.querySelector("#tongits-hand");
const tongitsStatus = document.querySelector("#tongits-status");
const tongitsTurnLabel = document.querySelector("#tongits-turn");
const tongitsMelds = document.querySelector("#tongits-melds");
const tongitsStockCount = document.querySelector("#tongits-stock-count");
const tongitsDiscardTop = document.querySelector("#tongits-discard-top");
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

export function openTongits(trigger) {
    lastTongitsTrigger = trigger;
    tongitsModal.hidden = false;
    document.body.classList.add("game-open");
    newTongitsHand();
    tongitsModal.querySelector("[data-close-tongits]").focus();
}

export function closeTongits() {
    if (gamePageMode) {
        returnFromGamePage();
        return;
    }
    tongitsModal.hidden = true;
    if (gameModal.hidden && fourplayModal.hidden && bubblyModal.hidden && swapperModal.hidden) document.body.classList.remove("game-open");
    if (lastTongitsTrigger) lastTongitsTrigger.focus();
}

document.querySelector("[data-close-tongits]").addEventListener("click", closeTongits);
document.querySelector("#tongits-draw-stock").addEventListener("click", () => drawTongitsCard(false));
document.querySelector("#tongits-draw-discard").addEventListener("click", () => drawTongitsCard(true));
document.querySelector("#tongits-meld").addEventListener("click", layTongitsMeld);
document.querySelector("#tongits-discard").addEventListener("click", discardTongitsCard);
document.querySelector("#tongits-new-game").addEventListener("click", newTongitsHand);
tongitsModal.addEventListener("click", (event) => {
    if (event.target === tongitsModal) closeTongits();
});
