const toast = document.querySelector(".toast");
let toastTimer;

export function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

export async function getCsrfToken() {
    const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Unable to start a secure sign-in request.");
    const result = await response.json();
    if (!result.token) throw new Error("Unable to start a secure sign-in request.");
    return result.token;
}

export async function apiRequest(url, { method = "GET", body } = {}) {
    const headers = { Accept: "application/json" };
    const options = { method, credentials: "same-origin", headers };
    if (method !== "GET") headers["X-CSRF-TOKEN"] = await getCsrfToken();
    if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    if (response.status === 401) {
        window.location.assign("index.html?page=login");
        throw new Error("Please sign in to continue.");
    }
    if (response.status === 204) return null;

    const result = await response.json();
    if (!response.ok) throw new Error(result.title || "That request couldn’t be completed.");
    return result;
}
