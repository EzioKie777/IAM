// Four Play (connect four) game.
import { bubblyModal, fourplayModal, gameModal, swapperModal, tongitsModal } from "./modals.js";
import { gamePageMode, returnFromGamePage } from "../page.js";

const fourplayBoardElement = document.querySelector("#fourplay-board");
const fourplayTurnElement = document.querySelector("#fourplay-turn");
const fourplayRows = 6;
const fourplayColumns = 7;
let fourplayBoard = [];
let fourplayFinished = false;
let fourplayThinking = false;
let fourplayWinningCells = [];
let lastFourplayTrigger;

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

export function openFourPlay(trigger) {
    lastFourplayTrigger = trigger;
    fourplayModal.hidden = false;
    document.body.classList.add("game-open");
    newFourPlayGame();
    fourplayModal.querySelector("[data-close-fourplay]").focus();
}

export function closeFourPlay() {
    if (gamePageMode) {
        returnFromGamePage();
        return;
    }
    fourplayModal.hidden = true;
    if (gameModal.hidden && tongitsModal.hidden && bubblyModal.hidden && swapperModal.hidden) document.body.classList.remove("game-open");
    if (lastFourplayTrigger) lastFourplayTrigger.focus();
}

document.querySelector("[data-close-fourplay]").addEventListener("click", closeFourPlay);
document.querySelector("#fourplay-new-game").addEventListener("click", newFourPlayGame);
fourplayModal.addEventListener("click", (event) => {
    if (event.target === fourplayModal) closeFourPlay();
});
