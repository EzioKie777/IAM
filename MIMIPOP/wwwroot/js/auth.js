// Sign-in / registration page, password toggle and the signed-in account header.
import { getCsrfToken } from "./api.js";
import { requestedPage } from "./page.js";
import { showToast } from "./ui.js";

const loginPage = document.querySelector("#login-page");
const loginForm = document.querySelector("#login-form");
const forgotPasswordForm = document.querySelector("#forgot-password-form");
const resetPasswordForm = document.querySelector("#reset-password-form");
const verifyEmailForm = document.querySelector("#verify-email-form");
const loginStatus = document.querySelector("#login-status");
const loginPassword = document.querySelector("#login-password");
const loginName = document.querySelector("#login-name");
const loginNameField = document.querySelector("#login-name-field");
const loginEmail = document.querySelector("#login-email");
const resendVerificationButton = document.querySelector("#login-resend-verification");
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

async function postAuthRequest(url, body) {
    const token = await getCsrfToken();
    const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-TOKEN": token
        },
        body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.title || "That request couldn’t be completed.");
        error.status = response.status;
        throw error;
    }
    return result;
}

document.querySelector("#login-forgot").addEventListener("click", () => {
    document.querySelector("#forgot-email").value = loginEmail.value;
    loginForm.hidden = true;
    forgotPasswordForm.hidden = false;
    document.querySelector("#login-switch").hidden = true;
    document.querySelector(".login-divider").hidden = true;
    document.querySelector("#login-title").textContent = "Forgot your password?";
    document.querySelector(".login-lede", loginPage).textContent =
        "We’ll email you a secure link if an account matches that address.";
    resendVerificationButton.hidden = true;
    setLoginStatus("");
});

resendVerificationButton.addEventListener("click", async () => {
    if (!loginEmail.value) {
        setLoginStatus("Enter your email address first.", true);
        loginEmail.focus();
        return;
    }

    resendVerificationButton.disabled = true;
    try {
        const result = await postAuthRequest(
            "/api/auth/email/verification/resend",
            { email: loginEmail.value }
        );
        setLoginStatus(result.title);
    } catch (error) {
        setLoginStatus(error.message, true);
    } finally {
        resendVerificationButton.disabled = false;
    }
});
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = document.querySelector("#login-submit");
    submitButton.disabled = true;
    resendVerificationButton.hidden = true;
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
                email: loginEmail.value,
                password: loginPassword.value,
                rememberMe: document.querySelector("[name='remember']").checked
            })
        });
        const result = await response.json();
        if (!response.ok) {
            setLoginStatus(result.title || "We couldn’t sign you in. Please try again.", true);
            resendVerificationButton.hidden = !(
                (!loginIsRegister && response.status === 403) ||
                (loginIsRegister && response.status === 503 &&
                    result.title?.startsWith("Your account was created"))
            );
            return;
        }
        if (loginIsRegister) {
            setLoginStatus(result.title);
            loginPassword.value = "";
            return;
        }
        setLoginStatus("Welcome back! Opening MIMIPOP…");
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

forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = forgotPasswordForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    setLoginStatus("Sending your request…");
    try {
        const result = await postAuthRequest(
            "/api/auth/password/forgot",
            { email: document.querySelector("#forgot-email").value }
        );
        setLoginStatus(result.title);
    } catch (error) {
        setLoginStatus(error.message, true);
    } finally {
        submitButton.disabled = false;
    }
});

resetPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#reset-password").value;
    const confirmation = document.querySelector("#reset-password-confirm").value;
    if (password !== confirmation) {
        setLoginStatus("Those passwords don’t match.", true);
        return;
    }

    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
        setLoginStatus("This password reset link is invalid or has expired. Request a new one and try again.", true);
        return;
    }

    const submitButton = document.querySelector("#reset-password-submit");
    submitButton.disabled = true;
    try {
        const result = await postAuthRequest("/api/auth/password/reset", { token, password });
        setLoginStatus(result.title);
        resetPasswordForm.reset();
        window.setTimeout(() => window.location.assign("index.html?page=login"), 1200);
    } catch (error) {
        setLoginStatus(error.message, true);
        submitButton.disabled = false;
    }
});

verifyEmailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) {
        setLoginStatus("This verification link is invalid or has expired. Request a new one and try again.", true);
        return;
    }

    const submitButton = document.querySelector("#verify-email-submit");
    submitButton.disabled = true;
    try {
        const result = await postAuthRequest("/api/auth/email/verify", { token });
        setLoginStatus(result.title);
        window.setTimeout(() => window.location.assign("index.html?page=login"), 1200);
    } catch (error) {
        setLoginStatus(error.message, true);
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
    const authMode = requestedPage || "login";
    const isLoginOrRegister = authMode === "login" || authMode === "register";
    const isLogin = authMode === "login";
    document.body.classList.add("login-page-mode");
    loginPage.hidden = false;
    loginForm.hidden = !isLoginOrRegister;
    forgotPasswordForm.hidden = authMode !== "forgot-password";
    resetPasswordForm.hidden = authMode !== "reset-password";
    verifyEmailForm.hidden = authMode !== "verify-email";
    loginNameField.hidden = !loginIsRegister;
    loginName.required = loginIsRegister;
    loginPassword.minLength = loginIsRegister ? 12 : 0;
    loginPassword.autocomplete = loginIsRegister ? "new-password" : "current-password";
    document.querySelector("#login-switch").hidden = !isLoginOrRegister;
    document.querySelector(".login-divider").hidden = !isLoginOrRegister;
    resendVerificationButton.hidden = true;
    loginPage.querySelector(".section-kicker").textContent = loginIsRegister
        ? "JOIN THE CLUB"
        : isLogin ? "MEMBER SIGN-IN" : "ACCOUNT SUPPORT";
    loginPage.querySelector(".login-story-copy h1").innerHTML = loginIsRegister
        ? "GOOD VIBES.<br>COME ON IN."
        : "GOOD VIBES.<br>WELCOME BACK.";
    const pageCopy = {
        login: ["Hey, cutie!", "Sign in to pick up where the fun left off."],
        register: ["Let’s make it official!", "Create your account and save your seat at the table."],
        "forgot-password": ["Forgot your password?", "We’ll email you a secure link if an account matches that address."],
        "reset-password": ["Choose a new password", "Use a password you haven’t used on MIMIPOP before."],
        "verify-email": ["Verify your email", "Confirm your address to activate your MIMIPOP account."]
    };
    const [title, lede] = pageCopy[authMode] || pageCopy.login;
    document.querySelector("#login-title").textContent = title;
    document.querySelector(".login-lede", loginPage).textContent = lede;
    document.querySelector("#login-submit").innerHTML = loginIsRegister
        ? "Create account <span aria-hidden=\"true\">→</span>"
        : "Log in <span aria-hidden=\"true\">→</span>";
    document.querySelector("#login-forgot").hidden = !isLogin;
    document.querySelector("#login-remember").hidden = !isLogin;
    document.querySelector("#login-form-section").setAttribute(
        "aria-label",
        loginIsRegister ? "Create an account" : isLogin ? "Sign in" : "Account support"
    );
    document.querySelector("#login-switch").innerHTML = loginIsRegister
        ? "Already a MIMIPOP member? <a href=\"index.html?page=login\">Log in</a>"
        : "New to MIMIPOP? <a href=\"index.html?page=register\">Join the club</a>";
    document.title = loginIsRegister ? "Join MIMIPOP" : isLogin ? "Log in — MIMIPOP" : `${title} — MIMIPOP`;
    setLoginStatus("");

    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (authMode === "verify-email" && !token) {
        setLoginStatus("This verification link is missing or invalid.", true);
        document.querySelector("#verify-email-submit").disabled = true;
    } else if (authMode === "reset-password" && !token) {
        setLoginStatus("This password reset link is missing or invalid.", true);
        document.querySelector("#reset-password-submit").disabled = true;
    }
}
