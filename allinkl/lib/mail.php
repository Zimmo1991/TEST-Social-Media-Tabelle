<?php
declare(strict_types=1);

function socialflow_mail_configured(): bool {
    return socialflow_env('SMTP_HOST') !== '' && socialflow_env('SMTP_USER') !== '' && socialflow_env('SMTP_PASSWORD') !== '' && socialflow_env('MAIL_FROM') !== '';
}

function socialflow_smtp_reply($stream, array $codes): string {
    $reply = '';
    do {
        $line = fgets($stream, 4096);
        if ($line === false) throw new RuntimeException('Der Mailserver hat die Verbindung beendet.');
        $reply .= $line;
    } while (isset($line[3]) && $line[3] === '-');
    if (!in_array((int)substr($line, 0, 3), $codes, true)) throw new RuntimeException('Der Mailserver hat die Anfrage abgelehnt (' . (int)substr($line, 0, 3) . ').');
    return $reply;
}

function socialflow_smtp_command($stream, string $command, array $codes = [250]): string {
    fwrite($stream, $command . "\r\n");
    return socialflow_smtp_reply($stream, $codes);
}

function socialflow_send_email(string $to, string $subject, string $text, string $html): void {
    if (!socialflow_mail_configured()) throw new RuntimeException('Der E-Mail-Versand ist noch nicht eingerichtet.');
    if (!socialflow_valid_email($to)) throw new RuntimeException('Ungültiger E-Mail-Empfänger.');
    $host = socialflow_env('SMTP_HOST');
    $secure = filter_var(socialflow_env('SMTP_SECURE', 'true'), FILTER_VALIDATE_BOOLEAN);
    $port = (int)socialflow_env('SMTP_PORT', $secure ? '465' : '587');
    $stream = stream_socket_client(($secure ? 'ssl://' : 'tcp://') . $host . ':' . $port, $errno, $error, 20);
    if (!$stream) throw new RuntimeException('Der Mailserver ist nicht erreichbar.');
    stream_set_timeout($stream, 20);
    try {
        socialflow_smtp_reply($stream, [220]);
        $capabilities = socialflow_smtp_command($stream, 'EHLO socialflow.local');
        if (!$secure) {
            if (!str_contains(strtoupper($capabilities), 'STARTTLS')) throw new RuntimeException('Der Mailserver bietet keine verschlüsselte Verbindung an.');
            socialflow_smtp_command($stream, 'STARTTLS', [220]);
            if (!stream_socket_enable_crypto($stream, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('Die E-Mail-Verschlüsselung ist fehlgeschlagen.');
            $capabilities = socialflow_smtp_command($stream, 'EHLO socialflow.local');
        }
        if (!str_contains(strtoupper($capabilities), 'AUTH')) throw new RuntimeException('Der Mailserver unterstützt keine Anmeldung.');
        socialflow_smtp_command($stream, 'AUTH LOGIN', [334]);
        socialflow_smtp_command($stream, base64_encode(socialflow_env('SMTP_USER')), [334]);
        socialflow_smtp_command($stream, base64_encode(socialflow_env('SMTP_PASSWORD')), [235]);
        $from = socialflow_env('MAIL_FROM');
        preg_match('/<([^<>]+)>/', $from, $match);
        $fromAddress = $match[1] ?? $from;
        if (!socialflow_valid_email($fromAddress)) throw new RuntimeException('Die Absenderadresse ist ungültig.');
        socialflow_smtp_command($stream, 'MAIL FROM:<' . $fromAddress . '>');
        socialflow_smtp_command($stream, 'RCPT TO:<' . $to . '>', [250, 251]);
        socialflow_smtp_command($stream, 'DATA', [354]);
        $boundary = 'socialflow-' . bin2hex(random_bytes(12));
        $safeSubject = preg_match('/^[\x20-\x7e]+$/', $subject) ? $subject : '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $message = "From: {$from}\r\nTo: {$to}\r\nSubject: {$safeSubject}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n\r\n";
        $message .= "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" . preg_replace('/^\./m', '..', $text) . "\r\n";
        $message .= "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n" . preg_replace('/^\./m', '..', $html) . "\r\n--{$boundary}--\r\n";
        fwrite($stream, $message . "\r\n.\r\n");
        socialflow_smtp_reply($stream, [250]);
        socialflow_smtp_command($stream, 'QUIT', [221]);
    } finally { fclose($stream); }
}
