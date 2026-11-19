// Profile page: edit profile, friend search, friend requests and friend cards.
import { apiRequest } from "./api.js";
import { refreshAccountActions } from "./auth.js";

const profilePage = document.querySelector("#profile-page");
const profileForm = document.querySelector("#profile-form");
const profileMessage = document.querySelector("#profile-message");
const friendMessage = document.querySelector("#friend-message");
const friendSearchResult = document.querySelector("#friend-search-result");

function setProfileMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("error", isError);
}

export async function loadProfilePage() {
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
