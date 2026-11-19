// Swapper match-three game.
import { bubblyModal, fourplayModal, gameModal, swapperModal, tongitsModal } from "./modals.js";
import { gamePageMode, returnFromGamePage } from "../page.js";

const swapperBoardElement = document.querySelector("#swapper-board");
const swapperScoreElement = document.querySelector("#swapper-score");
const swapperMovesElement = document.querySelector("#swapper-moves");
const swapperStatusElement = document.querySelector("#swapper-status");
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

export function openSwapper(trigger) {
    lastSwapperTrigger = trigger;
    swapperModal.hidden = false;
    document.body.classList.add("game-open");
    startSwapperGame();
    swapperModal.querySelector("[data-close-swapper]").focus();
}

export function closeSwapper() {
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

document.querySelector("[data-close-swapper]").addEventListener("click", closeSwapper);
document.querySelector("#swapper-new-game").addEventListener("click", startSwapperGame);
swapperModal.addEventListener("click", (event) => {
    if (event.target === swapperModal) closeSwapper();
});
