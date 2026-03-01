const bcrypt = require("bcrypt");
const express = require("express");

module.exports = function registerLoginRoutes(app, { auth }) {
  const { users, verifySessionToken, createSessionToken } = auth;

  // --- Login Page ---
  app.get("/login", (req, res) => {
    // If already logged in, redirect to home
    const token = req.cookies.__session;
    if (token) {
      const session = verifySessionToken(token);
      if (session) return res.redirect("/");
    }

    const error = req.query.error || "";
    const nonce = res.locals.cspNonce;
    const loginHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In - Secure File Server</title>
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="X-Frame-Options" content="DENY">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
            overflow: hidden;
            position: relative;
        }

        /* Animated background orbs */
        .bg-orbs {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
            z-index: 0;
            overflow: hidden;
        }

        .orb {
            position: absolute;
            border-radius: 50%;
            filter: blur(80px);
            opacity: 0.5;
            animation: floatOrb 20s infinite ease-in-out;
        }

        .orb-1 {
            width: 400px; height: 400px;
            background: radial-gradient(circle, #667eea, transparent);
            top: -100px; left: -100px;
            animation-duration: 18s;
        }

        .orb-2 {
            width: 500px; height: 500px;
            background: radial-gradient(circle, #764ba2, transparent);
            bottom: -150px; right: -100px;
            animation-duration: 22s;
            animation-delay: -5s;
        }

        .orb-3 {
            width: 350px; height: 350px;
            background: radial-gradient(circle, #f093fb, transparent);
            top: 50%; left: 60%;
            animation-duration: 25s;
            animation-delay: -10s;
        }

        .orb-4 {
            width: 300px; height: 300px;
            background: radial-gradient(circle, #4facfe, transparent);
            top: 20%; right: 20%;
            animation-duration: 20s;
            animation-delay: -3s;
        }

        @keyframes floatOrb {
            0%, 100% { transform: translate(0, 0) scale(1); }
            25% { transform: translate(60px, -40px) scale(1.1); }
            50% { transform: translate(-30px, 60px) scale(0.95); }
            75% { transform: translate(40px, 30px) scale(1.05); }
        }

        /* Glassmorphism login card */
        .login-container {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 420px;
            padding: 20px;
        }

        .login-card {
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 24px;
            padding: 48px 40px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.37);
            animation: cardAppear 0.6s ease-out;
        }

        @keyframes cardAppear {
            0% { opacity: 0; transform: translateY(20px) scale(0.97); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* Logo / branding */
        .login-logo {
            text-align: center;
            margin-bottom: 32px;
        }

        .login-logo .icon {
            width: 64px; height: 64px;
            margin: 0 auto 16px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
        }

        .login-logo h1 {
            color: #fff;
            font-size: 1.6rem;
            font-weight: 700;
            letter-spacing: -0.3px;
        }

        .login-logo p {
            color: rgba(255, 255, 255, 0.5);
            font-size: 0.9rem;
            margin-top: 6px;
        }

        /* Form inputs */
        .form-group {
            position: relative;
            margin-bottom: 24px;
        }

        .form-group input {
            width: 100%;
            padding: 16px 16px 16px 48px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            color: #fff;
            font-size: 0.95rem;
            font-family: inherit;
            outline: none;
            transition: all 0.3s ease;
        }

        .form-group input::placeholder {
            color: rgba(255, 255, 255, 0.35);
        }

        .form-group input:focus {
            border-color: rgba(102, 126, 234, 0.6);
            background: rgba(255, 255, 255, 0.1);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.15);
        }

        .form-group .input-icon {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 1.1rem;
            opacity: 0.5;
            transition: opacity 0.3s;
            pointer-events: none;
        }

        .form-group input:focus ~ .input-icon {
            opacity: 0.9;
        }

        .form-group .toggle-password {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.4);
            cursor: pointer;
            font-size: 1.1rem;
            padding: 4px;
            transition: color 0.3s;
        }

        .form-group .toggle-password:hover {
            color: rgba(255, 255, 255, 0.8);
        }

        /* Error message */
        .error-message {
            background: rgba(244, 67, 54, 0.15);
            border: 1px solid rgba(244, 67, 54, 0.3);
            color: #ff8a80;
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 0.88rem;
            margin-bottom: 20px;
            text-align: center;
            animation: shake 0.4s ease;
        }

        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-6px); }
            75% { transform: translateX(6px); }
        }

        /* Submit button */
        .login-btn {
            width: 100%;
            padding: 16px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none;
            border-radius: 14px;
            color: #fff;
            font-size: 1rem;
            font-weight: 600;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
        }

        .login-btn:active {
            transform: translateY(0);
        }

        .login-btn::after {
            content: '';
            position: absolute;
            top: 0; left: -100%; width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
            transition: left 0.5s;
        }

        .login-btn:hover::after {
            left: 100%;
        }

        /* Footer */
        .login-footer {
            text-align: center;
            margin-top: 28px;
            color: rgba(255, 255, 255, 0.3);
            font-size: 0.8rem;
        }

        .login-footer span {
            color: rgba(255, 255, 255, 0.5);
        }

        /* Responsive */
        @media (max-width: 480px) {
            .login-card {
                padding: 36px 24px;
                border-radius: 18px;
            }
            .login-logo h1 {
                font-size: 1.35rem;
            }
        }
    </style>
</head>
<body>
    <div class="bg-orbs">
        <div class="orb orb-1"></div>
        <div class="orb orb-2"></div>
        <div class="orb orb-3"></div>
        <div class="orb orb-4"></div>
    </div>

    <div class="login-container">
        <div class="login-card">
            <div class="login-logo">
                <div class="icon">🔐</div>
                <h1>Secure File Server</h1>
                <p>Sign in to access your files</p>
            </div>

            ${error ? `<div class="error-message">Invalid username or password</div>` : ""}

            <form method="POST" action="/login" autocomplete="on">
                <div class="form-group">
                    <input type="text" name="username" placeholder="Username" required autocomplete="username" autofocus>
                    <span class="input-icon">👤</span>
                </div>

                <div class="form-group">
                    <input type="password" name="password" id="passwordInput" placeholder="Password" required autocomplete="current-password">
                    <span class="input-icon">🔒</span>
                    <button type="button" class="toggle-password" id="togglePass" aria-label="Toggle password visibility">👁️</button>
                </div>

                <button type="submit" class="login-btn">Sign In</button>
            </form>

            <div class="login-footer">
                Protected by <span>Secure File Server</span>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        document.getElementById('togglePass').addEventListener('click', function() {
            var inp = document.getElementById('passwordInput');
            if (inp.type === 'password') {
                inp.type = 'text';
                this.textContent = '🙈';
            } else {
                inp.type = 'password';
                this.textContent = '👁️';
            }
        });
    </script>
</body>
</html>`;
    res.send(loginHtml);
  });

  // --- Login POST ---
  app.post(
    "/login",
    express.urlencoded({ extended: false, limit: "1kb" }),
    async (req, res) => {
      const { username, password } = req.body;
      if (
        !username ||
        !password ||
        typeof username !== "string" ||
        typeof password !== "string"
      ) {
        return res.redirect("/login?error=1");
      }

      const user = users[username];
      if (!user) {
        return res.redirect("/login?error=1");
      }

      try {
        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
          return res.redirect("/login?error=1");
        }

        const token = createSessionToken(username, user.role);
        res.cookie("__session", token, {
          httpOnly: true,
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
          maxAge: 24 * 60 * 60 * 1000,
          path: "/",
        });
        res.redirect("/");
      } catch {
        res.redirect("/login?error=1");
      }
    },
  );

  // --- Logout ---
  app.get("/logout", (req, res) => {
    res.clearCookie("__session", {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    res.redirect("/login");
  });
};
