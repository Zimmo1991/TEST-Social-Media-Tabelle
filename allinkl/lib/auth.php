<?php
declare(strict_types=1);
require_once __DIR__ . '/mail.php';

function socialflow_bootstrap_owner(): void {
    if ((int)(socialflow_one("SELECT COUNT(*) AS count FROM users WHERE role='owner' AND active=1")['count'] ?? 0) > 0) return;
    $name = trim(socialflow_env('MAIN_ADMIN_NAME'));
    $email = socialflow_normalize_email(socialflow_env('MAIN_ADMIN_EMAIL'));
    $password = socialflow_env('MAIN_ADMIN_PASSWORD');
    if ($name === '' && $email === '' && $password === '') return;
    if (strlen($name) < 2 || !socialflow_valid_email($email) || socialflow_password_error($password)) {
        socialflow_fail(503, 'MAIN_ADMIN_NAME, MAIN_ADMIN_EMAIL und MAIN_ADMIN_PASSWORD müssen vollständig und gültig gesetzt sein.');
    }
    $now = socialflow_now();
    socialflow_run("INSERT OR IGNORE INTO users (id,email,name,role,password_hash,table_ids_json,active,created_at,updated_at) VALUES (?,?,?,'owner',?,'[\"*\"]',1,?,?)",
        [socialflow_uuid(), $email, $name, socialflow_password_hash($password), $now, $now]);
}

function socialflow_auth_throttle(string $scope, int $limit, bool $record): void {
    $key = hash('sha256', $scope);
    $row = socialflow_one('SELECT attempts,expires_at FROM auth_attempts WHERE scope=?', [$key]);
    if ($row && $row['expires_at'] > socialflow_now() && (int)$row['attempts'] >= $limit)
        socialflow_fail(429, 'Zu viele Versuche. Bitte warte 15 Minuten.');
    if (!$record) return;
    if (!$row || $row['expires_at'] <= socialflow_now())
        socialflow_run('INSERT INTO auth_attempts (scope,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(scope) DO UPDATE SET attempts=1,expires_at=excluded.expires_at', [$key,socialflow_future(900)]);
    else socialflow_run('UPDATE auth_attempts SET attempts=attempts+1 WHERE scope=?', [$key]);
}

function socialflow_auth_route(string $path, string $method): bool {
    if (!str_starts_with($path, '/api/auth/')) return false;
    socialflow_bootstrap_owner();
    $ownerCount = (int)(socialflow_one("SELECT COUNT(*) AS count FROM users WHERE role = 'owner' AND active = 1")['count'] ?? 0);
    if ($path === '/api/auth/status' && $method === 'GET') {
        $user = socialflow_user();
        if ($user && isset($_COOKIE['socialflow_session'])) socialflow_set_cookie($_COOKIE['socialflow_session']);
        socialflow_json(['authenticated' => (bool)$user, 'user' => $user, 'needsSetup' => $ownerCount === 0, 'canSetup' => $ownerCount === 0 && socialflow_env('NODE_ENV') !== 'production' && socialflow_env('MAIN_ADMIN_EMAIL') === '']);
    }
    if ($path === '/api/auth/setup' && $method === 'POST') {
        if ($ownerCount !== 0) socialflow_fail(409, 'Der Hauptadmin wurde bereits eingerichtet.');
        $body = socialflow_body();
        $name = trim((string)($body['name'] ?? ''));
        $email = socialflow_normalize_email($body['email'] ?? '');
        if (strlen($name) < 2 || !socialflow_valid_email($email)) socialflow_fail(400, 'Name oder E-Mail-Adresse ist ungültig.');
        if ($error = socialflow_password_error($body['password'] ?? null)) socialflow_fail(400, $error);
        $setupKey = socialflow_env('APP_ADMIN_KEY');
        if (socialflow_env('NODE_ENV') === 'production' && ($setupKey === '' || !hash_equals($setupKey, (string)($body['setupKey'] ?? '')))) socialflow_fail(403, 'Die Online-Ersteinrichtung ist gesperrt.');
        $id = socialflow_uuid(); $now = socialflow_now();
        socialflow_run("INSERT INTO users (id,email,name,role,password_hash,table_ids_json,active,created_at,updated_at) VALUES (?,?,?,'owner',?,'[\"*\"]',1,?,?)", [$id,$email,$name,socialflow_password_hash($body['password']),$now,$now]);
        $session = socialflow_login_session($id);
        socialflow_json(['authenticated' => true, 'user' => socialflow_public_user(socialflow_one('SELECT * FROM users WHERE id = ?', [$id])), ...$session], 201);
    }
    if ($path === '/api/auth/invitation' && $method === 'GET') {
        $token = (string)($_GET['token'] ?? '');
        if (strlen($token) < 32 || strlen($token) > 200) socialflow_fail(400, 'Der Einladungslink ist ungültig oder abgelaufen.');
        $row = socialflow_one('SELECT email,expires_at FROM user_invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?', [socialflow_hash_token($token), socialflow_now()]);
        if (!$row) socialflow_fail(400, 'Der Einladungslink ist ungültig oder abgelaufen.');
        socialflow_json(['email' => $row['email'], 'expiresAt' => $row['expires_at']]);
    }
    if ($path === '/api/auth/register' && $method === 'POST') {
        if ($ownerCount === 0) socialflow_fail(503, 'Die Registrierung ist erst nach Einrichtung des Hauptadmins möglich.');
        $body = socialflow_body();
        $name = trim((string)($body['name'] ?? ''));
        $email = socialflow_normalize_email($body['email'] ?? '');
        if (strlen($name) < 2 || strlen($name) > 100 || !socialflow_valid_email($email)) socialflow_fail(400, 'Name oder E-Mail-Adresse ist ungültig.');
        if ($error = socialflow_password_error($body['password'] ?? null)) socialflow_fail(400, $error);
        $token = (string)($body['invitationToken'] ?? '');
        if (strlen($token) < 32 || strlen($token) > 200) socialflow_fail(400, 'Zur Registrierung benötigst du einen gültigen Einladungslink des Hauptadmins.');
        $invitation = socialflow_one('SELECT * FROM user_invitations WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > ?', [socialflow_hash_token($token), socialflow_now()]);
        if (!$invitation || ($invitation['email'] !== '' && socialflow_normalize_email($invitation['email']) !== $email)) socialflow_fail(400, 'Der Einladungslink ist ungültig oder abgelaufen.');
        $db = socialflow_db(); $db->beginTransaction();
        try {
            $now = socialflow_now();
            socialflow_run("INSERT INTO users (id,email,name,role,password_hash,table_ids_json,active,created_at,updated_at) VALUES (?,?,?,'subadmin',?,?,1,?,?)", [socialflow_uuid(),$email,$name,socialflow_password_hash($body['password']),$invitation['table_ids_json'],$now,$now]);
            $accepted = socialflow_run('UPDATE user_invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL', [$now,$invitation['id']]);
            if ($accepted !== 1) throw new RuntimeException('Einladung wurde bereits verwendet.');
            $db->commit();
        } catch (Throwable) { $db->rollBack(); socialflow_fail(409, 'Für diese E-Mail-Adresse besteht bereits ein Konto.'); }
        socialflow_json(['message' => 'Dein Konto wurde erstellt und die freigegebenen Kundentabellen wurden übernommen. Du kannst dich jetzt anmelden.'], 201);
    }
    if ($path === '/api/auth/login' && $method === 'POST') {
        $body = socialflow_body();
        $email = socialflow_normalize_email($body['email'] ?? '');
        $source = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        socialflow_auth_throttle('login-ip:' . $source, 40, false);
        socialflow_auth_throttle('login-pair:' . $source . ':' . $email, 5, false);
        $row = socialflow_one('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1', [$email]);
        if (!$row || !socialflow_password_verify((string)($body['password'] ?? ''), $row['password_hash'])) {
            socialflow_auth_throttle('login-ip:' . $source, 40, true);
            socialflow_auth_throttle('login-pair:' . $source . ':' . $email, 5, true);
            socialflow_fail(401, 'E-Mail-Adresse oder Passwort ist nicht korrekt.');
        }
        socialflow_run('DELETE FROM auth_attempts WHERE scope=?', [hash('sha256','login-pair:' . $source . ':' . $email)]);
        if (str_starts_with($row['password_hash'], 'scrypt.')) socialflow_run('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', [socialflow_password_hash((string)$body['password']),socialflow_now(),$row['id']]);
        $user = socialflow_public_user($row);
        if ($user['role'] !== 'owner' && !$user['tableIds']) socialflow_fail(403, 'Dein Konto wartet noch auf die Freigabe einer Kundentabelle durch den Hauptadmin.');
        $session = socialflow_login_session($row['id']);
        socialflow_json(['authenticated' => true, 'user' => $user, ...$session]);
    }
    if ($path === '/api/auth/password-reset/request' && $method === 'POST') {
        if (!socialflow_mail_configured() || socialflow_public_base_url() === '') socialflow_fail(503, 'Der E-Mail-Versand für die Passwort-Wiederherstellung ist noch nicht eingerichtet.');
        $generic = 'Falls für diese E-Mail-Adresse ein aktives Konto besteht, wurde ein Link zum Zurücksetzen versendet.';
        $body = socialflow_body(); $email = socialflow_normalize_email($body['email'] ?? '');
        if (!socialflow_valid_email($email)) socialflow_json(['message' => $generic], 202);
        $row = socialflow_one('SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1', [$email]);
        if (!$row) socialflow_json(['message' => $generic], 202);
        $token = socialflow_token(); $now = socialflow_now();
        socialflow_run('DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL', [$row['id']]);
        socialflow_run('INSERT INTO password_reset_tokens (token_hash,user_id,expires_at,created_at,requested_ip) VALUES (?,?,?,?,?)', [socialflow_hash_token($token),$row['id'],socialflow_future(1800),$now,$_SERVER['REMOTE_ADDR'] ?? null]);
        $url = socialflow_public_base_url() . '/?resetToken=' . rawurlencode($token);
        $name = htmlspecialchars($row['name'], ENT_QUOTES, 'UTF-8');
        try {
            socialflow_send_email($email, 'Planyoursocials: Passwort zurücksetzen', "Hallo {$row['name']},\n\nÜber diesen Link kannst du dein Passwort zurücksetzen:\n{$url}\n\nDer Link ist 30 Minuten gültig.", '<p>Hallo ' . $name . ',</p><p>Über diesen Link kannst du dein Passwort zurücksetzen:</p><p><a href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '">Neues Passwort festlegen</a></p><p>Der Link ist 30 Minuten gültig.</p>');
        } catch (Throwable $error) { socialflow_run('DELETE FROM password_reset_tokens WHERE token_hash = ?', [socialflow_hash_token($token)]); error_log('SocialFlow mail: ' . $error->getMessage()); }
        socialflow_json(['message' => $generic], 202);
    }
    if ($path === '/api/auth/password-reset/confirm' && $method === 'POST') {
        $body = socialflow_body(); $token = (string)($body['token'] ?? '');
        if ($error = socialflow_password_error($body['password'] ?? null)) socialflow_fail(400, $error);
        if (strlen($token) < 32 || strlen($token) > 200) socialflow_fail(400, 'Der Link ist ungültig oder abgelaufen.');
        $row = socialflow_one('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', [socialflow_hash_token($token),socialflow_now()]);
        if (!$row) socialflow_fail(400, 'Der Link ist ungültig oder abgelaufen.');
        $db = socialflow_db(); $db->beginTransaction();
        try {
            socialflow_run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [socialflow_password_hash($body['password']),socialflow_now(),$row['user_id']]);
            socialflow_run('UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?', [socialflow_now(),socialflow_hash_token($token)]);
            socialflow_run('DELETE FROM sessions WHERE user_id = ?', [$row['user_id']]);
            $db->commit();
        } catch (Throwable $error) { $db->rollBack(); throw $error; }
        socialflow_json(['message' => 'Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.']);
    }
    if ($path === '/api/auth/logout' && $method === 'POST') {
        $token = $_COOKIE['socialflow_session'] ?? '';
        if (is_string($token) && $token !== '') socialflow_run('DELETE FROM sessions WHERE token_hash = ?', [socialflow_hash_token($token)]);
        setcookie('socialflow_session', '', ['expires' => time() - 3600, 'path' => '/', 'secure' => str_starts_with(socialflow_public_base_url(), 'https://') || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'), 'httponly' => true, 'samesite' => 'Lax']);
        socialflow_json(['ok' => true]);
    }
    socialflow_fail(404, 'API-Endpunkt nicht gefunden.');
}
