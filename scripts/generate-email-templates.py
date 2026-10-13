# -*- coding: utf-8 -*-
"""Generate Supabase auth email templates (Magic Link + Confirm signup) in 10 languages."""
import sys, html

OUT = sys.argv[1]
LANGS = ["en", "de", "fr", "it", "es", "pt", "zh", "ja", "hi", "ar"]

S = {
"en": dict(ml_subject="Your Prompt Battle login link", ml_heading="Your login link", ml_intro="Click the button below to sign in to Prompt Battle.", ml_button="Sign in to Prompt Battle",
           cs_subject="Confirm your Prompt Battle account", cs_heading="Welcome to Prompt Battle!", cs_intro="Confirm your email address to activate your host account.", cs_button="Confirm my email",
           code_label="Or enter this code on the login page:", ml_note="The link and code are valid for 1 hour and work only once. If you didn't request this, you can ignore this email.",
           cs_note="The link and code are valid for 1 hour. If you didn't sign up for Prompt Battle, you can ignore this email.", fallback="Button not working? Copy this link into your browser:",
           tagline="The live AI prompting game for teams, workshops and classrooms."),
"de": dict(ml_subject="Dein Login-Link für Prompt Battle", ml_heading="Dein Login-Link", ml_intro="Klicke auf den Button, um dich bei Prompt Battle anzumelden.", ml_button="Bei Prompt Battle anmelden",
           cs_subject="Bestätige dein Prompt-Battle-Konto", cs_heading="Willkommen bei Prompt Battle!", cs_intro="Bestätige deine E-Mail-Adresse, um dein Host-Konto zu aktivieren.", cs_button="E-Mail-Adresse bestätigen",
           code_label="Oder gib diesen Code auf der Login-Seite ein:", ml_note="Link und Code sind 1 Stunde gültig und funktionieren nur einmal. Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.",
           cs_note="Link und Code sind 1 Stunde gültig. Falls du dich nicht bei Prompt Battle registriert hast, kannst du diese E-Mail ignorieren.", fallback="Button funktioniert nicht? Kopiere diesen Link in deinen Browser:",
           tagline="Das Live-Spiel fürs KI-Prompten – für Teams, Workshops und Schulklassen."),
"fr": dict(ml_subject="Ton lien de connexion Prompt Battle", ml_heading="Ton lien de connexion", ml_intro="Clique sur le bouton ci-dessous pour te connecter à Prompt Battle.", ml_button="Me connecter à Prompt Battle",
           cs_subject="Confirme ton compte Prompt Battle", cs_heading="Bienvenue sur Prompt Battle !", cs_intro="Confirme ton adresse e-mail pour activer ton compte d'hôte.", cs_button="Confirmer mon e-mail",
           code_label="Ou saisis ce code sur la page de connexion :", ml_note="Le lien et le code sont valables 1 heure et ne fonctionnent qu'une fois. Si tu n'as rien demandé, ignore cet e-mail.",
           cs_note="Le lien et le code sont valables 1 heure. Si tu ne t'es pas inscrit·e sur Prompt Battle, ignore cet e-mail.", fallback="Le bouton ne fonctionne pas ? Copie ce lien dans ton navigateur :",
           tagline="Le jeu de prompting IA en direct pour les équipes, les ateliers et les classes."),
"it": dict(ml_subject="Il tuo link di accesso a Prompt Battle", ml_heading="Il tuo link di accesso", ml_intro="Clicca il pulsante qui sotto per accedere a Prompt Battle.", ml_button="Accedi a Prompt Battle",
           cs_subject="Conferma il tuo account Prompt Battle", cs_heading="Benvenuto su Prompt Battle!", cs_intro="Conferma il tuo indirizzo e-mail per attivare il tuo account host.", cs_button="Conferma la mia e-mail",
           code_label="Oppure inserisci questo codice nella pagina di accesso:", ml_note="Link e codice sono validi per 1 ora e funzionano una sola volta. Se non l'hai richiesto, puoi ignorare questa e-mail.",
           cs_note="Link e codice sono validi per 1 ora. Se non ti sei registrato a Prompt Battle, puoi ignorare questa e-mail.", fallback="Il pulsante non funziona? Copia questo link nel browser:",
           tagline="Il gioco di prompting IA dal vivo per team, workshop e classi."),
"es": dict(ml_subject="Tu enlace de acceso a Prompt Battle", ml_heading="Tu enlace de acceso", ml_intro="Haz clic en el botón para iniciar sesión en Prompt Battle.", ml_button="Entrar en Prompt Battle",
           cs_subject="Confirma tu cuenta de Prompt Battle", cs_heading="¡Te damos la bienvenida a Prompt Battle!", cs_intro="Confirma tu correo electrónico para activar tu cuenta de anfitrión.", cs_button="Confirmar mi correo",
           code_label="O introduce este código en la página de inicio de sesión:", ml_note="El enlace y el código son válidos durante 1 hora y solo funcionan una vez. Si no lo has solicitado, puedes ignorar este correo.",
           cs_note="El enlace y el código son válidos durante 1 hora. Si no te has registrado en Prompt Battle, puedes ignorar este correo.", fallback="¿No funciona el botón? Copia este enlace en tu navegador:",
           tagline="El juego de prompting con IA en directo para equipos, talleres y aulas."),
"pt": dict(ml_subject="O teu link de acesso ao Prompt Battle", ml_heading="O teu link de acesso", ml_intro="Clica no botão abaixo para entrares no Prompt Battle.", ml_button="Entrar no Prompt Battle",
           cs_subject="Confirma a tua conta Prompt Battle", cs_heading="Bem-vindo ao Prompt Battle!", cs_intro="Confirma o teu e-mail para ativares a tua conta de anfitrião.", cs_button="Confirmar o meu e-mail",
           code_label="Ou introduz este código na página de acesso:", ml_note="O link e o código são válidos durante 1 hora e só funcionam uma vez. Se não pediste isto, podes ignorar este e-mail.",
           cs_note="O link e o código são válidos durante 1 hora. Se não te registaste no Prompt Battle, podes ignorar este e-mail.", fallback="O botão não funciona? Copia este link para o teu browser:",
           tagline="O jogo de prompting com IA ao vivo para equipas, workshops e salas de aula."),
"zh": dict(ml_subject="你的 Prompt Battle 登录链接", ml_heading="你的登录链接", ml_intro="点击下方按钮登录 Prompt Battle。", ml_button="登录 Prompt Battle",
           cs_subject="确认你的 Prompt Battle 账户", cs_heading="欢迎来到 Prompt Battle！", cs_intro="请确认你的邮箱地址以激活主持人账户。", cs_button="确认我的邮箱",
           code_label="或在登录页面输入此验证码：", ml_note="链接和验证码 1 小时内有效，且只能使用一次。如果这不是你本人的操作，请忽略此邮件。",
           cs_note="链接和验证码 1 小时内有效。如果你没有注册 Prompt Battle，请忽略此邮件。", fallback="按钮无法使用？请将此链接复制到浏览器中：",
           tagline="面向团队、工作坊和课堂的现场 AI 提示词对战游戏。"),
"ja": dict(ml_subject="Prompt Battle のログインリンク", ml_heading="ログインリンク", ml_intro="下のボタンをクリックして Prompt Battle にログインしてください。", ml_button="Prompt Battle にログイン",
           cs_subject="Prompt Battle アカウントの確認", cs_heading="Prompt Battle へようこそ！", cs_intro="メールアドレスを確認して、ホストアカウントを有効にしてください。", cs_button="メールアドレスを確認",
           code_label="またはログインページでこのコードを入力してください：", ml_note="リンクとコードの有効期限は1時間で、1回のみ使用できます。心当たりがない場合は、このメールを無視してください。",
           cs_note="リンクとコードの有効期限は1時間です。Prompt Battle に登録していない場合は、このメールを無視してください。", fallback="ボタンが使えない場合は、このリンクをブラウザにコピーしてください：",
           tagline="チーム、ワークショップ、教室のためのライブ AI プロンプトゲーム。"),
"hi": dict(ml_subject="आपका Prompt Battle लॉगिन लिंक", ml_heading="आपका लॉगिन लिंक", ml_intro="Prompt Battle में साइन इन करने के लिए नीचे दिए बटन पर क्लिक करें।", ml_button="Prompt Battle में साइन इन करें",
           cs_subject="अपने Prompt Battle खाते की पुष्टि करें", cs_heading="Prompt Battle में आपका स्वागत है!", cs_intro="अपना होस्ट खाता सक्रिय करने के लिए अपने ईमेल पते की पुष्टि करें।", cs_button="मेरे ईमेल की पुष्टि करें",
           code_label="या लॉगिन पेज पर यह कोड दर्ज करें:", ml_note="लिंक और कोड 1 घंटे तक मान्य हैं और केवल एक बार काम करते हैं। अगर आपने इसका अनुरोध नहीं किया, तो इस ईमेल को अनदेखा करें।",
           cs_note="लिंक और कोड 1 घंटे तक मान्य हैं। अगर आपने Prompt Battle पर साइन अप नहीं किया, तो इस ईमेल को अनदेखा करें।", fallback="बटन काम नहीं कर रहा? यह लिंक अपने ब्राउज़र में कॉपी करें:",
           tagline="टीमों, वर्कशॉप और कक्षाओं के लिए लाइव AI प्रॉम्प्टिंग गेम।"),
"ar": dict(ml_subject="رابط تسجيل الدخول إلى Prompt Battle", ml_heading="رابط تسجيل الدخول", ml_intro="انقر على الزر أدناه لتسجيل الدخول إلى Prompt Battle.", ml_button="تسجيل الدخول إلى Prompt Battle",
           cs_subject="أكّد حسابك في Prompt Battle", cs_heading="مرحبًا بك في Prompt Battle!", cs_intro="أكّد بريدك الإلكتروني لتفعيل حساب المضيف الخاص بك.", cs_button="تأكيد بريدي الإلكتروني",
           code_label="أو أدخل هذا الرمز في صفحة تسجيل الدخول:", ml_note="الرابط والرمز صالحان لمدة ساعة واحدة ويعملان مرة واحدة فقط. إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.",
           cs_note="الرابط والرمز صالحان لمدة ساعة واحدة. إذا لم تسجّل في Prompt Battle، يمكنك تجاهل هذه الرسالة.", fallback="الزر لا يعمل؟ انسخ هذا الرابط في متصفحك:",
           tagline="لعبة كتابة الأوامر المباشرة للذكاء الاصطناعي للفرق والورش والفصول الدراسية."),
}

FONT = "Arial,Helvetica,sans-serif"
INK = "#1c1950"
SOFT = "#4a4775"
MUTED = "#7a77a0"


def block(lang, kind):
    s = {k: html.escape(v, quote=False) for k, v in S[lang].items()}
    p = "ml" if kind == "magic" else "cs"
    rtl = lang == "ar"
    d = 'dir="rtl" ' if rtl else ""
    align = "right" if rtl else "left"
    return f"""
          <tr>
            <td {d}style="padding:32px 32px 8px 32px;font-family:{FONT};color:{INK};text-align:{align};">
              <h1 style="margin:0 0 12px 0;font-size:24px;line-height:1.3;font-weight:bold;color:{INK};">{s[p + '_heading']}</h1>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:{SOFT};">{s[p + '_intro']}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="{align}">
                <tr>
                  <td style="border-radius:12px;background:#7b5cff;">
                    <a href="{{{{ .ConfirmationURL }}}}" style="display:inline-block;padding:14px 28px;font-family:{FONT};font-size:15px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px;">{s[p + '_button']}</a>
                  </td>
                </tr>
              </table>
              <div style="clear:both;height:28px;line-height:28px;font-size:0;">&nbsp;</div>
              <p style="margin:0 0 8px 0;font-size:14px;line-height:1.5;color:{SOFT};">{s['code_label']}</p>
              <p dir="ltr" style="margin:0 0 24px 0;display:inline-block;padding:12px 18px;border-radius:10px;background:#f3f2fb;font-family:'Courier New',Courier,monospace;font-size:28px;font-weight:bold;letter-spacing:6px;color:{INK};">{{{{ .Token }}}}</p>
              <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:{MUTED};">{s[p + '_note']}</p>
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:{MUTED};">{s['fallback']}<br><a dir="ltr" href="{{{{ .ConfirmationURL }}}}" style="color:#5a3df0;word-break:break-all;">{{{{ .ConfirmationURL }}}}</a></p>
            </td>
          </tr>
          <tr>
            <td {d}style="padding:20px 32px 28px 32px;border-top:1px solid #ecebf7;font-family:{FONT};font-size:12px;line-height:1.6;color:{MUTED};text-align:{align};">
              {s['tagline']}<br>
              <a href="https://promptbattle.io" style="color:#5a3df0;text-decoration:none;">promptbattle.io</a> &middot; <a href="mailto:hello@promptbattle.io" style="color:#5a3df0;text-decoration:none;">hello@promptbattle.io</a>
            </td>
          </tr>"""


def template(kind):
    branches = []
    for i, lang in enumerate(LANGS[1:]):
        kw = "if" if i == 0 else "else if"
        branches.append(f'{{{{ {kw} eq $l "{lang}" }}}}{block(lang, kind)}')
    switch = "".join(branches) + "{{ else }}" + block("en", kind) + "\n          {{ end }}"
    return f"""{{{{ $l := printf "%v" .Data.locale }}}}<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Prompt Battle</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f2fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f2fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#0e0b33;padding:22px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td width="16" height="16" style="width:16px;height:16px;background:#35ed7e;border-radius:5px;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="5" style="width:5px;font-size:0;line-height:0;">&nbsp;</td>
                    <td width="16" height="16" style="width:16px;height:16px;background:#ec48bd;border-radius:5px;font-size:0;line-height:0;">&nbsp;</td>
                    <td style="padding-left:12px;font-family:{FONT};font-size:16px;font-weight:900;letter-spacing:1.5px;color:#ffffff;">PROMPT BATTLE</td>
                  </tr>
                </table>
              </td>
            </tr>
          {switch}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def subject(kind):
    # Supabase caps subjects at 255 characters, too short for a 10-language
    # switch. The code works in every language and shows in notifications.
    return "{{ .Token }} · Prompt Battle"


for kind, name in [("magic", "magic-link"), ("confirm", "confirm-signup")]:
    with open(f"{OUT}/{name}.html", "w", encoding="utf-8") as f:
        f.write(template(kind))
    with open(f"{OUT}/{name}.subject.txt", "w", encoding="utf-8") as f:
        f.write(subject(kind) + "\n")
print("ok")
