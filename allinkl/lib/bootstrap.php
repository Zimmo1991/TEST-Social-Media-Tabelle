<?php
declare(strict_types=1);

const SOCIALFLOW_ROOT = __DIR__ . '/../..';
const SOCIALFLOW_SESSION_SECONDS = 400 * 24 * 60 * 60;

final class SocialFlowHttpError extends RuntimeException {
    public function __construct(public readonly int $status, string $message) { parent::__construct($message); }
}

function socialflow_fail(int $status, string $message): never { throw new SocialFlowHttpError($status, $message); }

function socialflow_environment(): array {
    static $values = null;
    if ($values !== null) return $values;
    $values = [];
    $file = SOCIALFLOW_ROOT . '/.env';
    if (!is_file($file)) return $values;
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        if (preg_match('/^[A-Z][A-Z0-9_]*$/', $key)) $values[$key] = trim($value, " \t\r\n\"'");
    }
    return $values;
}

function socialflow_env(string $key, string $default = ''): string {
    $runtime = getenv($key);
    return $runtime !== false ? (string)$runtime : (socialflow_environment()[$key] ?? $default);
}

function socialflow_data_dir(): string { return socialflow_env('DATA_DIR', SOCIALFLOW_ROOT . '/data'); }

function socialflow_db(): PDO {
    static $connection = null;
    if ($connection) return $connection;
    if (!extension_loaded('pdo_sqlite')) socialflow_fail(503, 'PHP benötigt die Erweiterung pdo_sqlite.');
    $directory = socialflow_data_dir();
    if (!is_dir($directory) && !mkdir($directory, 0700, true)) socialflow_fail(503, 'Der Datenordner ist nicht beschreibbar.');
    $connection = new PDO('sqlite:' . $directory . '/socialflow.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $connection->exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
    $schema = file_get_contents(__DIR__ . '/../schema.sql');
    if ($schema === false) socialflow_fail(503, 'Das Datenbankschema fehlt.');
    $connection->exec($schema);
    return $connection;
}

function socialflow_one(string $sql, array $values = []): ?array {
    $query = socialflow_db()->prepare($sql);
    $query->execute($values);
    return $query->fetch() ?: null;
}

function socialflow_all(string $sql, array $values = []): array {
    $query = socialflow_db()->prepare($sql);
    $query->execute($values);
    return $query->fetchAll();
}

function socialflow_run(string $sql, array $values = []): int {
    $query = socialflow_db()->prepare($sql);
    $query->execute($values);
    return $query->rowCount();
}

function socialflow_now(): string { return gmdate('Y-m-d\TH:i:s.') . sprintf('%03dZ', ((int)floor(microtime(true) * 1000)) % 1000); }
function socialflow_future(int $seconds): string { return gmdate('Y-m-d\TH:i:s.000\Z', time() + $seconds); }
function socialflow_uuid(): string {
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
}
function socialflow_b64url(string $bytes): string { return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '='); }
function socialflow_unb64url(string $value): string|false { return base64_decode(strtr($value, '-_', '+/'), true); }
function socialflow_token(): string { return socialflow_b64url(random_bytes(32)); }
function socialflow_hash_token(string $token): string { return hash('sha256', $token); }
function socialflow_json_decode(?string $value, mixed $fallback = []): mixed {
    try { return json_decode($value ?? '', true, 512, JSON_THROW_ON_ERROR); }
    catch (Throwable) { return $fallback; }
}
function socialflow_json(array $value, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
function socialflow_body(int $limit = 1000000): array {
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) socialflow_fail(413, 'Die Anfrage ist zu groß.');
    $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
    if ($raw === false || strlen($raw) > $limit) socialflow_fail(413, 'Die Anfrage ist zu groß.');
    if ($raw === '') return [];
    try { $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR); }
    catch (Throwable) { socialflow_fail(400, 'Ungültige JSON-Anfrage.'); }
    if (!is_array($data)) socialflow_fail(400, 'Ungültige JSON-Anfrage.');
    return $data;
}
function socialflow_file(string $path, bool $cache): never {
    if (!is_file($path)) socialflow_fail(404, 'Datei nicht gefunden.');
    $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $types = ['html' => 'text/html; charset=utf-8', 'css' => 'text/css; charset=utf-8', 'js' => 'text/javascript; charset=utf-8',
        'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif',
        'svg' => 'image/svg+xml', 'mp4' => 'video/mp4', 'mov' => 'video/quicktime', 'webm' => 'video/webm'];
    header('Content-Type: ' . ($types[$extension] ?? 'application/octet-stream'));
    header('Content-Length: ' . filesize($path));
    header('Cache-Control: ' . ($cache ? 'public, max-age=86400' : 'no-store'));
    readfile($path);
    exit;
}
function socialflow_normalize_email(mixed $email): string { return strtolower(trim((string)$email)); }
function socialflow_valid_email(string $email): bool { return filter_var($email, FILTER_VALIDATE_EMAIL) !== false && strlen($email) <= 254; }
function socialflow_password_error(mixed $password): ?string {
    if (!is_string($password) || strlen($password) < 10) return 'Das Passwort muss mindestens 10 Zeichen lang sein.';
    if (strlen($password) > 200) return 'Das Passwort ist zu lang.';
    return null;
}
function socialflow_password_hash(string $password): string { return password_hash($password, PASSWORD_ARGON2ID); }
function socialflow_password_verify(string $password, string $hash): bool {
    if (str_starts_with($hash, 'scrypt.')) { require_once __DIR__ . '/scrypt.php'; return sf_verify_node_scrypt($password, $hash); }
    return password_verify($password, $hash);
}
function socialflow_public_user(?array $row): ?array {
    if (!$row) return null;
    return ['id' => $row['id'], 'email' => $row['email'], 'name' => $row['name'], 'role' => $row['role'],
        'tableIds' => $row['role'] === 'owner' ? ['*'] : socialflow_json_decode($row['table_ids_json'], []),
        'active' => (bool)$row['active'], 'createdAt' => $row['created_at'], 'updatedAt' => $row['updated_at']];
}
function socialflow_user(): ?array {
    $token = $_COOKIE['socialflow_session'] ?? '';
    if (!is_string($token) || $token === '') return null;
    $row = socialflow_one('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1', [socialflow_hash_token($token), socialflow_now()]);
    if (!$row) return null;
    socialflow_run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?', [socialflow_now(), socialflow_future(SOCIALFLOW_SESSION_SECONDS), socialflow_hash_token($token)]);
    return socialflow_public_user($row);
}
function socialflow_owner(?array $user = null): bool {
    $candidate = $user ?? socialflow_user();
    if (($candidate['role'] ?? null) === 'owner') return true;
    $key = socialflow_env('APP_ADMIN_KEY');
    return $key !== '' && hash_equals('Bearer ' . $key, $_SERVER['HTTP_AUTHORIZATION'] ?? '');
}
function socialflow_access(?array $user, string $tableId): bool { return $user && $tableId !== '' && ($user['role'] === 'owner' || in_array($tableId, $user['tableIds'], true)); }
function socialflow_require_owner(?array $user = null): void { if (!socialflow_owner($user)) socialflow_fail(403, 'Nur der Hauptadmin darf diese Funktion verwenden.'); }
function socialflow_require_user(?array $user): void { if (!$user) socialflow_fail(401, 'Bitte melde dich an.'); }
function socialflow_set_cookie(string $token): void {
    $secure = str_starts_with(socialflow_public_base_url(), 'https://') || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    setcookie('socialflow_session', $token, ['expires' => time() + SOCIALFLOW_SESSION_SECONDS, 'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
}
function socialflow_login_session(string $userId): array {
    $token = socialflow_token();
    $expires = socialflow_future(SOCIALFLOW_SESSION_SECONDS);
    $now = socialflow_now();
    socialflow_run('INSERT INTO sessions (token_hash,user_id,remember_me,expires_at,created_at,last_seen_at) VALUES (?,?,1,?,?,?)', [socialflow_hash_token($token), $userId, $expires, $now, $now]);
    socialflow_set_cookie($token);
    return ['expiresAt' => $expires];
}
function socialflow_public_base_url(): string { return rtrim(socialflow_env('PUBLIC_BASE_URL'), '/'); }
function socialflow_mime(string $file): string { return (new finfo(FILEINFO_MIME_TYPE))->file($file) ?: 'application/octet-stream'; }
function socialflow_upload(string $input, array $allowed, int $maxSize): array {
    $file = $_FILES[$input] ?? null;
    if ($file && in_array($file['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) socialflow_fail(413, 'Das Medium überschreitet das Upload-Limit des Servers.');
    if (!$file || is_array($file['error']) || $file['error'] !== UPLOAD_ERR_OK) socialflow_fail(400, 'Bitte wähle ein Bild oder Video aus.');
    if ($file['size'] <= 0 || $file['size'] > $maxSize) socialflow_fail(413, 'Das Medium ist zu groß oder leer.');
    $mime = socialflow_mime($file['tmp_name']);
    if (!isset($allowed[$mime])) socialflow_fail(415, 'Dieses Medienformat wird nicht unterstützt.');
    return ['tmp' => $file['tmp_name'], 'name' => basename((string)$file['name']), 'size' => (int)$file['size'], 'mime' => $mime, 'extension' => $allowed[$mime]];
}
function socialflow_upload_dir(): string {
    $directory = socialflow_env('UPLOADS_DIR', SOCIALFLOW_ROOT . '/uploads');
    if (!is_dir($directory) && !mkdir($directory, 0700, true)) socialflow_fail(503, 'Der Medienordner ist nicht beschreibbar.');
    return $directory;
}
function socialflow_publication_media(string $filename): never {
    if (!preg_match('/^[a-zA-Z0-9._-]+$/', $filename)) socialflow_fail(404, 'Medium nicht gefunden.');
    $row = socialflow_one('SELECT * FROM publications WHERE media_json LIKE ?', ['%' . $filename . '%']);
    if (!$row || $row['status'] !== 'publishing') socialflow_fail(404, 'Medium nicht verfügbar.');
    socialflow_file(socialflow_upload_dir() . '/' . $filename, false);
}
