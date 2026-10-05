import { connect as connectNet } from "node:net";
import { connect as connectTls } from "node:tls";
import { once } from "node:events";
import { randomUUID } from "node:crypto";

function booleanSetting(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export function emailConfiguration() {
  const secure = booleanSetting(process.env.SMTP_SECURE, true);
  return {
    host: String(process.env.SMTP_HOST || "").trim(),
    port: Number(process.env.SMTP_PORT) || (secure ? 465 : 587),
    secure,
    user: String(process.env.SMTP_USER || "").trim(),
    password: String(process.env.SMTP_PASSWORD || ""),
    from: String(process.env.MAIL_FROM || process.env.SMTP_USER || "").trim(),
    rejectUnauthorized: !booleanSetting(process.env.SMTP_ALLOW_SELF_SIGNED, false),
    dryRun: booleanSetting(process.env.MAIL_DRY_RUN, false)
  };
}

export function emailIsConfigured(configuration = emailConfiguration()) {
  return configuration.dryRun || Boolean(configuration.host && configuration.user && configuration.password && configuration.from);
}

function extractAddress(value) {
  const match = String(value).match(/<([^<>]+)>/);
  return (match ? match[1] : value).trim();
}

function encodedHeader(value) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function createReplyReader(socket) {
  let buffer = "";
  let responseLines = [];
  const waiters = [];
  const completedReplies = [];

  const flush = () => {
    while (buffer.includes("\r\n")) {
      const separator = buffer.indexOf("\r\n");
      const line = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      responseLines.push(line);
      if (!/^\d{3} /.test(line)) continue;
      const reply = responseLines.join("\n");
      responseLines = [];
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(reply);
      else completedReplies.push(reply);
    }
  };

  socket.on("data", chunk => {
    buffer += chunk.toString("utf8");
    flush();
  });
  socket.on("error", error => {
    while (waiters.length) waiters.shift().reject(error);
  });
  socket.on("close", () => {
    const error = new Error("Die Verbindung zum Mailserver wurde unerwartet beendet.");
    while (waiters.length) waiters.shift().reject(error);
  });

  return () => new Promise((resolve, reject) => {
    if (completedReplies.length) {
      resolve(completedReplies.shift());
      return;
    }
    waiters.push({ resolve, reject });
    flush();
  });
}

function replyCode(reply) {
  return Number(String(reply).split("\n").at(-1)?.slice(0, 3));
}

async function expectReply(readReply, acceptedCodes) {
  const reply = await readReply();
  if (!acceptedCodes.includes(replyCode(reply))) throw new Error(`Der Mailserver hat die Anfrage abgelehnt (${replyCode(reply) || "unbekannt"}).`);
  return reply;
}

async function smtpCommand(socket, readReply, command, acceptedCodes = [250]) {
  socket.write(`${command}\r\n`);
  return expectReply(readReply, acceptedCodes);
}

async function connectedSocket(configuration) {
  const socket = configuration.secure
    ? connectTls({ host: configuration.host, port: configuration.port, servername: configuration.host, rejectUnauthorized: configuration.rejectUnauthorized })
    : connectNet({ host: configuration.host, port: configuration.port });
  socket.setTimeout(20_000, () => socket.destroy(new Error("Zeitüberschreitung beim Mailserver.")));
  await once(socket, configuration.secure ? "secureConnect" : "connect");
  return socket;
}

function emailMessage({ from, to, subject, text, html }) {
  const safeText = String(text).replace(/^\./gm, "..");
  const safeHtml = String(html).replace(/^\./gm, "..");
  const boundary = `socialflow-${randomUUID()}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@socialflow.local>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    safeText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    safeHtml,
    `--${boundary}--`,
    ""
  ].join("\r\n");
}

export async function sendEmail({ to, subject, text, html }) {
  const configuration = emailConfiguration();
  if (!emailIsConfigured(configuration)) throw new Error("Der E-Mail-Versand ist noch nicht eingerichtet.");
  if (configuration.dryRun) return { dryRun: true };

  let socket = await connectedSocket(configuration);
  let readReply = createReplyReader(socket);
  try {
    await expectReply(readReply, [220]);
    let capabilities = await smtpCommand(socket, readReply, "EHLO socialflow.local");
    if (!configuration.secure) {
      if (!/STARTTLS/i.test(capabilities)) throw new Error("Der Mailserver bietet keine verschlüsselte STARTTLS-Verbindung an.");
      await smtpCommand(socket, readReply, "STARTTLS", [220]);
      const plainSocket = socket;
      socket = connectTls({ socket: plainSocket, servername: configuration.host, rejectUnauthorized: configuration.rejectUnauthorized });
      await once(socket, "secureConnect");
      socket.setTimeout(20_000, () => socket.destroy(new Error("Zeitüberschreitung beim Mailserver.")));
      readReply = createReplyReader(socket);
      capabilities = await smtpCommand(socket, readReply, "EHLO socialflow.local");
    }
    if (!/AUTH/i.test(capabilities)) throw new Error("Der Mailserver bietet keine unterstützte Anmeldung an.");
    await smtpCommand(socket, readReply, "AUTH LOGIN", [334]);
    await smtpCommand(socket, readReply, Buffer.from(configuration.user).toString("base64"), [334]);
    await smtpCommand(socket, readReply, Buffer.from(configuration.password).toString("base64"), [235]);
    await smtpCommand(socket, readReply, `MAIL FROM:<${extractAddress(configuration.from)}>`, [250]);
    await smtpCommand(socket, readReply, `RCPT TO:<${extractAddress(to)}>`, [250, 251]);
    await smtpCommand(socket, readReply, "DATA", [354]);
    socket.write(`${emailMessage({ from: configuration.from, to, subject, text, html })}\r\n.\r\n`);
    await expectReply(readReply, [250]);
    await smtpCommand(socket, readReply, "QUIT", [221]);
    return { dryRun: false };
  } finally {
    socket.destroy();
  }
}

export function passwordResetEmail({ name, resetUrl, expiresMinutes }) {
  const safeName = String(name || "").replace(/[<>]/g, "");
  const safeUrl = String(resetUrl).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return {
    subject: "Planyoursocials: Passwort zurücksetzen",
    text: `Hallo ${safeName},\n\nüber diesen Link kannst du dein Planyoursocials-Passwort zurücksetzen:\n${resetUrl}\n\nDer Link ist ${expiresMinutes} Minuten gültig und kann nur einmal verwendet werden. Wenn du die Änderung nicht angefordert hast, kannst du diese E-Mail ignorieren.`,
    html: `<p>Hallo ${safeName},</p><p>über diesen Link kannst du dein Planyoursocials-Passwort zurücksetzen:</p><p><a href="${safeUrl}">Neues Passwort festlegen</a></p><p>Der Link ist ${expiresMinutes} Minuten gültig und kann nur einmal verwendet werden. Wenn du die Änderung nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>`
  };
}

export function subadminInvitationEmail({ inviteUrl, expiresDays }) {
  const safeUrl = String(inviteUrl).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return {
    subject: "Einladung zu Planyoursocials",
    text: `Du wurdest zu Planyoursocials eingeladen.\n\nÜber diesen Link kannst du deinen Namen und dein persönliches Passwort festlegen:\n${inviteUrl}\n\nDer Link ist ${expiresDays} Tage gültig und kann nur einmal verwendet werden. Wenn du diese Einladung nicht erwartest, kannst du die E-Mail ignorieren.`,
    html: `<p>Du wurdest zu <strong>Planyoursocials</strong> eingeladen.</p><p>Über diesen Link kannst du deinen Namen und dein persönliches Passwort festlegen:</p><p><a href="${safeUrl}">Einladung annehmen und registrieren</a></p><p>Der Link ist ${expiresDays} Tage gültig und kann nur einmal verwendet werden. Wenn du diese Einladung nicht erwartest, kannst du die E-Mail ignorieren.</p>`
  };
}
