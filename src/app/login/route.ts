import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const styles = `
  *, *:before, *:after { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: #173bd1;
    font-family: var(--app-font);
    color: #17213c;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .wrap { width: min(460px, 100%); text-align: center; }
  .brand { color: white; margin-bottom: 28px; }
  .drop { font-size: 56px; line-height: 1; }
  .brand h1 { font-size: 24px; margin: 7px 0 3px; }
  .brand p { margin: 0; font-size: 13px; opacity: .9; }
  .card {
    background: #fff;
    border-radius: 28px;
    padding: 28px 30px;
    box-shadow: 0 20px 45px #102a9e55;
    text-align: right;
  }
  .title { font-weight: 300; font-size: 18px; margin-bottom: 20px; }
  .field { display: block; color: #77829a; font-size: 13px; margin: 15px 0 7px; }
  .input {
    width: 100%;
    height: 45px;
    border: 1px solid #d9deea;
    border-radius: 13px;
    padding: 0 14px;
    font-size: 14px;
    outline: 0;
    direction: ltr;
    text-align: left;
  }
  .input:focus { border-color: #173bd1; box-shadow: 0 0 0 3px #173bd118; }
  .remember {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    margin: 14px 0 8px;
    color: #4d5872;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
  }
  .remember input {
    width: 16px;
    height: 16px;
    accent-color: #173bd1;
    cursor: pointer;
  }
  .hint { font-size: 12px; color: #8791a6; text-align: center; margin: 22px 0; }
  .btn {
    width: 100%;
    height: 50px;
    border: 0;
    border-radius: 14px;
    background: #173bd1;
    color: #fff;
    font-size: 16px;
    font-weight: 300;
    cursor: pointer;
  }
  .btn:disabled { opacity: .65; cursor: wait; }
  .err { min-height: 18px; color: #c43232; font-size: 12px; text-align: center; margin: 10px 0 0; }
  .forgot { display: block; margin: 13px auto 0; border: 0; background: none; color: #173bd1; cursor: pointer; font-size: 13px; }
  @media (max-width: 480px) {
    body { padding: 16px; }
    .card { padding: 24px 20px; border-radius: 22px; }
  }
`;

const script = `
  document.getElementById('login').addEventListener('submit', async (event) => {
    event.preventDefault();

    const button = document.getElementById('submit');
    const error = document.getElementById('error');
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'جارٍ الدخول...';

    try {
      const response = await fetch('/api/app/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: document.getElementById('email').value.trim(),
          password: document.getElementById('password').value,
          remember: document.getElementById('remember').checked,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'INVALID_CREDENTIALS');
      }

      location.replace('/');
    } catch (loginError) {
      error.textContent = loginError.message === 'RATE_LIMITED'
        ? 'محاولات كثيرة، حاول بعد 15 دقيقة'
        : 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
      button.disabled = false;
      button.textContent = 'دخول';
    }
  });
`;

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>تقييم أداء الموظفين</title>
  <link rel="icon" href="/favicon.png?v=20260924" type="image/png" sizes="192x192">
  <link rel="apple-touch-icon" href="/apple-icon.png?v=20260924">
  <link rel="stylesheet" href="/unified-font.css?v=20260924-original">
  <style>${styles}</style>
</head>
<body>
  <main class="wrap">
    <div class="brand">
      <div class="drop">◔</div>
      <h1>تقييم أداء الموظفين</h1>
      <p>شركة السويد التجارية</p>
    </div>

    <form class="card" id="login">
      <div class="title">تسجيل الدخول</div>
      <label class="field" for="email">البريد الإلكتروني</label>
      <input class="input" id="email" type="email" autocomplete="email" required placeholder="name@company.com">
      <label class="field" for="password">كلمة المرور</label>
      <input class="input" id="password" type="password" autocomplete="current-password" required placeholder="••••••••">
      <label class="remember" for="remember">
        <input id="remember" type="checkbox">
        <span>تذكرني</span>
      </label>
      <p class="hint">استخدم البريد الإلكتروني وكلمة المرور الخاصة بحسابك</p>
      <button class="btn" id="submit" type="submit">دخول</button>
      <div class="err" id="error" role="alert"></div>
      <button class="forgot" type="button" onclick="location.href='/login?reset=1'">نسيت كلمة المرور؟</button>
    </form>
  </main>

  <script>${script}</script>
</body>
</html>`;

export function GET() {
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
