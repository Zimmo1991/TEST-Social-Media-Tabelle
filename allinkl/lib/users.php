<?php
declare(strict_types=1);

function sf_user_table_ids(mixed $value): array { return array_values(array_unique(array_filter(array_map('strval', is_array($value) ? $value : [])))); }

function socialflow_users_route(string $path, string $method, ?array $user): bool {
    if ($path === '/api/users/participants' && $method === 'GET') {
        socialflow_require_user($user);
        $members = [];
        foreach (socialflow_all('SELECT * FROM users WHERE active=1 ORDER BY role,name COLLATE NOCASE') as $row) {
            $person = socialflow_public_user($row);
            if ($person['role'] === 'owner' || $person['id'] === $user['id'] || array_intersect($person['tableIds'], $user['tableIds'])) $members[] = ['id' => $person['id'], 'name' => $person['name'], 'role' => $person['role'], 'tableIds' => $person['tableIds']];
        }
        socialflow_json(['users' => $members]);
    }
    if ($path === '/api/users' && $method === 'GET') {
        socialflow_require_owner($user);
        socialflow_json(['users' => array_map('socialflow_public_user', socialflow_all('SELECT * FROM users WHERE active=1 ORDER BY role,name COLLATE NOCASE'))]);
    }
    if ($path === '/api/users/invitations' && $method === 'POST') {
        socialflow_require_owner($user);
        $body = socialflow_body(); $email = socialflow_normalize_email($body['email'] ?? ''); $tableIds = sf_user_table_ids($body['tableIds'] ?? []);
        $delivery = ($body['delivery'] ?? 'link') === 'email' ? 'email' : 'link';
        $baseUrl = socialflow_public_base_url();
        if ($baseUrl === '' && in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1', '::1'], true)) {
            $localPort = (string)(int)($_SERVER['SERVER_PORT'] ?? socialflow_env('PORT', '8765'));
            $baseUrl = 'http://127.0.0.1:' . $localPort;
        }
        if ($baseUrl === '') socialflow_fail(503, 'Trage zuerst PUBLIC_BASE_URL in der .env-Datei ein.');
        if ($delivery === 'email' && !socialflow_mail_configured()) socialflow_fail(503, 'Für den direkten E-Mail-Versand fehlen die SMTP-Daten. Du kannst stattdessen einen Link erstellen.');
        if (($email !== '' || $delivery === 'email') && !socialflow_valid_email($email)) socialflow_fail(400, 'Bitte gib eine gültige E-Mail-Adresse ein.');
        if (!$tableIds) socialflow_fail(400, 'Wähle mindestens eine Kundentabelle aus.');
        if ($email !== '' && socialflow_one('SELECT 1 FROM users WHERE email=? COLLATE NOCASE AND active=1', [$email])) socialflow_fail(409, 'Für diese E-Mail-Adresse besteht bereits ein Konto.');
        $token = socialflow_token(); $id = socialflow_uuid(); $now = socialflow_now(); $expires = socialflow_future(7 * 86400);
        if ($email !== '') socialflow_run('DELETE FROM user_invitations WHERE email=? COLLATE NOCASE AND accepted_at IS NULL', [$email]);
        socialflow_run('INSERT INTO user_invitations (id,token_hash,email,table_ids_json,expires_at,created_by,created_at) VALUES (?,?,?,?,?,?,?)', [$id,socialflow_hash_token($token),$email,json_encode($tableIds),$expires,$user['id'] ?? 'admin-key',$now]);
        $url = $baseUrl . '/?invite=' . rawurlencode($token);
        if ($delivery === 'link') socialflow_json(['message' => 'Der einmalige Einladungslink wurde erstellt und ist 7 Tage gültig.', 'inviteUrl' => $url, 'expiresAt' => $expires], 201);
        try { socialflow_send_email($email, 'Einladung zu Planyoursocials', "Du wurdest zu Planyoursocials eingeladen.\n\nÜber diesen Link kannst du deinen Namen und dein Passwort festlegen:\n{$url}\n\nDer Link ist sieben Tage gültig.", '<p>Du wurdest zu Planyoursocials eingeladen.</p><p><a href="' . htmlspecialchars($url, ENT_QUOTES, 'UTF-8') . '">Einladung annehmen und registrieren</a></p><p>Der Link ist sieben Tage gültig.</p>'); }
        catch (Throwable $error) { socialflow_run('DELETE FROM user_invitations WHERE id=?', [$id]); socialflow_fail(502, 'Die Einladung konnte nicht versendet werden: ' . $error->getMessage()); }
        socialflow_json(['message' => 'Die Einladung wurde an ' . $email . ' gesendet und ist 7 Tage gültig.', 'expiresAt' => $expires], 201);
    }
    if ($path === '/api/users' && $method === 'POST') {
        socialflow_require_owner($user); $body = socialflow_body(); $name = trim((string)($body['name'] ?? '')); $email = socialflow_normalize_email($body['email'] ?? ''); $tableIds = sf_user_table_ids($body['tableIds'] ?? []); $role = ($body['role'] ?? '') === 'customer' ? 'customer' : 'subadmin';
        if (strlen($name) < 2 || !socialflow_valid_email($email) || !$tableIds) socialflow_fail(400, 'Name, E-Mail-Adresse und mindestens eine Kundentabelle sind erforderlich.');
        if ($role === 'customer' && count($tableIds) !== 1) socialflow_fail(400, 'Wähle für den Kunden genau eine Kundentabelle aus.');
        if ($error = socialflow_password_error($body['password'] ?? null)) socialflow_fail(400, $error);
        $id = socialflow_uuid(); $now = socialflow_now();
        try { socialflow_run("INSERT INTO users (id,email,name,role,password_hash,table_ids_json,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)", [$id,$email,$name,$role,socialflow_password_hash($body['password']),json_encode($tableIds),$now,$now]); }
        catch (PDOException) { socialflow_fail(409, 'Diese E-Mail-Adresse wird bereits verwendet.'); }
        socialflow_json(['user' => socialflow_public_user(socialflow_one('SELECT * FROM users WHERE id=?', [$id]))], 201);
    }
    if (preg_match('~^/api/users/([a-zA-Z0-9_-]+)$~', $path, $match) && $method === 'PATCH') {
        socialflow_require_owner($user); $id = $match[1]; $existing = socialflow_one("SELECT * FROM users WHERE id=? AND role IN ('subadmin','customer') AND active=1", [$id]);
        if (!$existing) socialflow_fail(404, 'Benutzerkonto nicht gefunden.');
        $body = socialflow_body(); $name = trim((string)($body['name'] ?? '')); $email = socialflow_normalize_email($body['email'] ?? ''); $tableIds = sf_user_table_ids($body['tableIds'] ?? []); $password = (string)($body['password'] ?? '');
        if (strlen($name) < 2 || !socialflow_valid_email($email) || !$tableIds) socialflow_fail(400, 'Name, E-Mail-Adresse und mindestens eine Kundentabelle sind erforderlich.');
        if ($password !== '' && ($error = socialflow_password_error($password))) socialflow_fail(400, $error);
        try {
            if ($password !== '') { socialflow_run('UPDATE users SET name=?,email=?,table_ids_json=?,password_hash=?,updated_at=? WHERE id=?', [$name,$email,json_encode($tableIds),socialflow_password_hash($password),socialflow_now(),$id]); socialflow_run('DELETE FROM sessions WHERE user_id=?', [$id]); }
            else socialflow_run('UPDATE users SET name=?,email=?,table_ids_json=?,updated_at=? WHERE id=?', [$name,$email,json_encode($tableIds),socialflow_now(),$id]);
        } catch (PDOException) { socialflow_fail(409, 'Diese E-Mail-Adresse wird bereits verwendet.'); }
        socialflow_json(['user' => socialflow_public_user(socialflow_one('SELECT * FROM users WHERE id=?', [$id]))]);
    }
    return false;
}
