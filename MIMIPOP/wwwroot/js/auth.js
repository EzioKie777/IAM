// Sign-in / registration page, password toggle and the signed-in account header.
import { getCsrfToken } from "./api.js";
import { requestedPage } from "./page.js";
import { showToast } from "./ui.js";

const loginPage = document.querySelector("#login-page");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const loginPassword = document.querySelector("#login-password");
const loginName = document.querySelector("#login-name");
const loginNameField = document.querySelector("#login-name-field");
const loginIsRegister = requestedPage === "register";

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

export async function refreshAccountActions() {
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

export function configureLoginPage() {
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
