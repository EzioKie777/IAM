// Cue The Fun matchmaking: public queue, friend challenges and match status polling.
import { apiRequest } from "../api.js";
import { cueEnterMatchButton, cueMode } from "./cue.js";
import { gameModal } from "./modals.js";

const cueMatchStatusElement = document.querySelector("#cue-match-status");
const cueQueueButton = document.querySelector("#cue-queue-button");
const cueCancelQueueButton = document.querySelector("#cue-cancel-queue");
const cueInviteButton = document.querySelector("#cue-invite-button");
const cueFriendSelect = document.querySelector("#cue-friend-select");
const cueMatchCard = document.querySelector("#cue-match-card");
const cueIncomingInvitations = document.querySelector("#cue-incoming-invitations");
const cueOutgoingInvitations = document.querySelector("#cue-outgoing-invitations");
export let cueMatchPollTimer;
let cueMatchPollInFlight = false;
export let cueMatchPollEnabled = false;
let cueMatchFriendsLoaded = false;
export let cueMatchState;

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

export function setCueMatchStatus(message, isError = false) {
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

export async function refreshCueMatchStatus() {
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

export async function performCueMatchAction(url, method, body, successMessage) {
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

export function setCueMatchState(value) {
    cueMatchState = value;
}

export function setCueMatchPollEnabled(value) {
    cueMatchPollEnabled = value;
}
