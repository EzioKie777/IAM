// Shared UI helpers: the toast notification and generic [data-message] buttons.

const toast = document.querySelector(".toast");
let toastTimer;

export function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

document.querySelectorAll("[data-message]").forEach((button) => {
    button.addEventListener("click", () => showToast(button.dataset.message));
});
