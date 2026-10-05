<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';

function sf_token_key(): string {
    $encoded = socialflow_env('TOKEN_ENCRYPTION_KEY');
    if ($encoded === '' && is_file(socialflow_data_dir() . '/.token-key')) $encoded = trim((string)file_get_contents(socialflow_data_dir() . '/.token-key'));
    $key = base64_decode($encoded, true);
    if ($key === false || strlen($key) !== 32) socialflow_fail(503, 'Der Verschlüsselungsschlüssel für Instagram fehlt.');
    return $key;
}
function sf_encrypt(string $plain): string {
    $iv = random_bytes(12); $tag = '';
    $cipher = openssl_encrypt($plain,'aes-256-gcm',sf_token_key(),OPENSSL_RAW_DATA,$iv,$tag);
    if ($cipher === false) socialflow_fail(500, 'Das Instagram-Token konnte nicht geschützt werden.');
    return 'v1.' . socialflow_b64url($iv) . '.' . socialflow_b64url($tag) . '.' . socialflow_b64url($cipher);
}
function sf_decrypt(string $value): string {
    $parts = explode('.',$value);
    if (count($parts) !== 4 || $parts[0] !== 'v1') socialflow_fail(503, 'Das Instagram-Token hat ein unbekanntes Format.');
    $plain = openssl_decrypt(socialflow_unb64url($parts[3]),'aes-256-gcm',sf_token_key(),OPENSSL_RAW_DATA,socialflow_unb64url($parts[1]),socialflow_unb64url($parts[2]));
    if ($plain === false) socialflow_fail(503, 'Das Instagram-Token kann nicht entschlüsselt werden.');
    return $plain;
}
function sf_connection(?array $row): ?array {
    if (!$row) return null;
    return ['tableId' => $row['table_id'], 'tableName' => $row['table_name'], 'instagramUserId' => $row['instagram_user_id'], 'username' => $row['username'], 'accountType' => $row['account_type'], 'tokenExpiresAt' => $row['token_expires_at'], 'connectedAt' => $row['connected_at'], 'updatedAt' => $row['updated_at']];
}
function sf_publication(?array $row): ?array {
    if (!$row) return null;
    return ['id' => $row['id'], 'tableId' => $row['table_id'], 'tableName' => $row['table_name'], 'calendarYear' => (int)$row['calendar_year'], 'weekNumber' => (int)$row['week_number'], 'itemIndex' => (int)$row['item_index'], 'contentType' => $row['content_type'], 'caption' => $row['caption'], 'media' => socialflow_json_decode($row['media_json'], []), 'scheduledAt' => $row['scheduled_at'], 'customerApproved' => (bool)$row['customer_approved'], 'mainAdminApproved' => (bool)$row['main_admin_approved'], 'status' => $row['status'], 'instagramMediaId' => $row['instagram_media_id'], 'lastError' => $row['last_error'], 'attempts' => (int)$row['attempts'], 'createdAt' => $row['created_at'], 'updatedAt' => $row['updated_at'], 'publishedAt' => $row['published_at']];
}
function sf_publication_event(string $id, string $kind, string $message): void { socialflow_run('INSERT INTO publication_events (publication_id,event_type,message,created_at) VALUES (?,?,?,?)', [$id,$kind,$message,socialflow_now()]); }
function sf_connection_row(string $tableId): ?array { return socialflow_one('SELECT * FROM instagram_connections WHERE table_id=?', [$tableId]); }
function sf_graph_url(string $path, array $query = []): string { return 'https://graph.instagram.com/' . sf_instagram_config()['apiVersion'] . $path . ($query ? '?' . http_build_query($query) : ''); }
function sf_graph_post(string $path, string $token, array $values): array { return sf_http_form(sf_graph_url($path),$values,['Authorization: Bearer ' . $token]); }
function sf_graph_get(string $path, string $token, array $values = []): array { return sf_http_json(sf_graph_url($path,$values),'GET',['Authorization: Bearer ' . $token]); }

function sf_usable_instagram_token(array $connection): string {
    $token = sf_decrypt($connection['encrypted_access_token']);
    if (!$connection['token_expires_at'] || strtotime($connection['token_expires_at']) - time() >= 7 * 86400) return $token;
    $refreshed = sf_http_json('https://graph.instagram.com/refresh_access_token?' . http_build_query(['grant_type' => 'ig_refresh_token', 'access_token' => $token]));
    $token = (string)($refreshed['access_token'] ?? '');
    if ($token === '') throw new RuntimeException('Instagram konnte das Zugriffstoken nicht erneuern.');
    $expiry = !empty($refreshed['expires_in']) ? socialflow_future((int)$refreshed['expires_in']) : $connection['token_expires_at'];
    socialflow_run('UPDATE instagram_connections SET encrypted_access_token=?,token_expires_at=?,updated_at=? WHERE table_id=?', [sf_encrypt($token),$expiry,socialflow_now(),$connection['table_id']]);
    return $token;
}
function sf_instagram_container(string $userId, string $token, array $media, string $type, string $caption, bool $carouselItem = false): string {
    $video = str_starts_with($media['mimeType'],'video/');
    $values = $carouselItem ? ['is_carousel_item' => 'true'] : ['caption' => $caption];
    if ($type === 'story') $values['media_type'] = 'STORIES';
    elseif ($type === 'reel' || ($video && !$carouselItem)) $values['media_type'] = 'REELS';
    elseif ($video) $values['media_type'] = 'VIDEO';
    $values[$video ? 'video_url' : 'image_url'] = $media['publicUrl'];
    $container = sf_graph_post('/' . rawurlencode($userId) . '/media',$token,$values);
    $id = (string)($container['id'] ?? ''); if ($id === '') throw new RuntimeException('Instagram hat keinen Mediencontainer erzeugt.');
    if ($video) {
        for ($attempt = 0; $attempt < 24; $attempt++) {
            $state = sf_graph_get('/' . rawurlencode($id),$token,['fields' => 'status_code,status']);
            if (($state['status_code'] ?? '') === 'FINISHED') break;
            if (in_array($state['status_code'] ?? '', ['ERROR','EXPIRED'],true)) throw new RuntimeException((string)($state['status'] ?? 'Instagram konnte das Video nicht verarbeiten.'));
            if ($attempt === 23) throw new RuntimeException('Instagram hat die Medienverarbeitung nicht rechtzeitig abgeschlossen.');
            sleep(5);
        }
    }
    return $id;
}
function sf_publish_to_instagram(array $connection, array $publication): string {
    if (sf_instagram_config()['dryRun']) return 'dry-run-' . time();
    $token = sf_usable_instagram_token($connection); $userId = $connection['instagram_user_id']; $media = socialflow_json_decode($publication['media_json'], []);
    if (!$media) throw new RuntimeException('Mindestens ein Medium ist erforderlich.');
    if (count($media) === 1) $container = sf_instagram_container($userId,$token,$media[0],$publication['content_type'],$publication['caption']);
    else {
        $children = []; foreach ($media as $item) $children[] = sf_instagram_container($userId,$token,$item,'post','',true);
        $parent = sf_graph_post('/' . rawurlencode($userId) . '/media',$token,['media_type' => 'CAROUSEL','children' => implode(',',$children),'caption' => $publication['caption']]);
        $container = (string)$parent['id'];
    }
    $result = sf_graph_post('/' . rawurlencode($userId) . '/media_publish',$token,['creation_id' => $container]);
    return (string)($result['id'] ?? '');
}
function sf_process_publication(string $id): void {
    $publication = socialflow_one('SELECT * FROM publications WHERE id=?', [$id]);
    if (!$publication || !in_array($publication['status'], ['queued','failed'],true)) return;
    $changed = socialflow_run("UPDATE publications SET status='publishing',attempts=attempts+1,last_error=NULL,updated_at=? WHERE id=? AND status IN ('queued','failed')", [socialflow_now(),$id]);
    if (!$changed) return;
    sf_publication_event($id,'publishing','Veröffentlichung an Instagram gestartet.');
    try {
        $connection = sf_connection_row($publication['table_id']);
        if (!$connection && !sf_instagram_config()['dryRun']) throw new RuntimeException('Für diese Kundentabelle ist kein Instagram-Konto verbunden.');
        $mediaId = sf_publish_to_instagram($connection ?? [],$publication);
        $now = socialflow_now();
        socialflow_run("UPDATE publications SET status='published',instagram_media_id=?,published_at=?,updated_at=? WHERE id=?", [$mediaId,$now,$now,$id]);
        sf_publication_event($id,'published','Instagram-Medien-ID: ' . $mediaId);
    } catch (Throwable $error) {
        socialflow_run("UPDATE publications SET status='failed',last_error=?,updated_at=? WHERE id=?", [$error->getMessage(),socialflow_now(),$id]);
        sf_publication_event($id,'failed',$error->getMessage());
    }
}
function sf_process_due_publications(): void {
    foreach (socialflow_all("SELECT id FROM publications WHERE status='queued' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 10", [socialflow_now()]) as $row) sf_process_publication($row['id']);
    socialflow_run('DELETE FROM oauth_states WHERE expires_at<?', [socialflow_now()]);
    socialflow_run('DELETE FROM sessions WHERE expires_at<?', [socialflow_now()]);
    socialflow_run('DELETE FROM password_reset_tokens WHERE expires_at<?', [socialflow_now()]);
    socialflow_run('DELETE FROM user_invitations WHERE expires_at<? OR accepted_at IS NOT NULL', [socialflow_now()]);
    socialflow_run('DELETE FROM auth_attempts WHERE expires_at<?', [socialflow_now()]);
}

function sf_instagram_callback_page(bool $ok, string $message): never {
    http_response_code($ok ? 200 : 400);
    header('Content-Type: text/html; charset=utf-8');
    $safe = htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    $json = json_encode($message, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE);
    $kind = $ok ? 'socialflow-instagram-connected' : 'socialflow-instagram-error';
    echo '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Instagram-Verbindung</title><style>body{font-family:system-ui;display:grid;min-height:100vh;place-items:center;margin:0;background:#f5f7fb;color:#172033}.card{max-width:480px;border:1px solid #e2e6ed;border-radius:16px;padding:28px;background:#fff}p{color:#657084}</style></head><body><div class="card"><h1>Instagram-Verbindung</h1><p>' . $safe . '</p><p>Dieses Fenster kann geschlossen werden.</p></div><script>window.opener?.postMessage({type:' . json_encode($kind) . ',message:' . $json . '},window.location.origin);setTimeout(()=>window.close(),1200);</script></body></html>';
    exit;
}
function sf_publication_files(): array {
    $file = $_FILES['media'] ?? null;
    if (!$file) socialflow_fail(400, 'Mindestens ein Bild oder Video ist erforderlich.');
    $names = is_array($file['name']) ? $file['name'] : [$file['name']];
    $errors = is_array($file['error']) ? $file['error'] : [$file['error']];
    $sizes = is_array($file['size']) ? $file['size'] : [$file['size']];
    $temps = is_array($file['tmp_name']) ? $file['tmp_name'] : [$file['tmp_name']];
    $allowed = ['image/jpeg' => '.jpg','image/png' => '.png','image/webp' => '.webp','image/gif' => '.gif','video/mp4' => '.mp4','video/quicktime' => '.mov','video/webm' => '.webm'];
    $result = [];
    foreach ($names as $i => $name) {
        if ($errors[$i] !== UPLOAD_ERR_OK || $sizes[$i] <= 0 || $sizes[$i] > 250 * 1024 * 1024) socialflow_fail(413, 'Ein Medium ist zu groß oder konnte nicht hochgeladen werden.');
        $mime = socialflow_mime($temps[$i]);
        if (!isset($allowed[$mime])) socialflow_fail(415, 'Ein Medienformat wird nicht unterstützt.');
        $result[] = ['name' => basename((string)$name), 'tmp' => $temps[$i], 'size' => $sizes[$i], 'mime' => $mime, 'extension' => $allowed[$mime]];
    }
    return $result;
}

function socialflow_instagram_route(string $path, string $method, ?array $user): bool {
    if ($path === '/api/admin/instagram-config' && $method === 'POST') {
        socialflow_require_owner($user);
        if (!sf_local_instagram_config_editable($user)) socialflow_fail(403, 'Die Meta-Zugangsdaten können nur vom Hauptadmin direkt am lokalen Computer gespeichert werden.');
        $body = socialflow_body();
        $appId = trim((string)($body['appId'] ?? ''));
        $appSecret = trim((string)($body['appSecret'] ?? ''));
        $current = sf_instagram_config();
        if (!preg_match('/^\d{5,40}$/', $appId)) socialflow_fail(400, 'Bitte gib eine gültige numerische Instagram App-ID ein.');
        if ($appSecret === '' && $current['appSecret'] === '') socialflow_fail(400, 'Bitte gib auch das Instagram App-Secret ein.');
        if ($appSecret !== '' && !preg_match('/^[^\s]{16,200}$/', $appSecret)) socialflow_fail(400, 'Das App-Secret ist ungültig. Es darf keine Leerzeichen enthalten.');
        $values = ['INSTAGRAM_APP_ID' => $appId];
        if ($appSecret !== '') $values['INSTAGRAM_APP_SECRET'] = $appSecret;
        sf_write_local_environment($values);
        socialflow_json(['ok' => true, 'instagramConfigured' => $appSecret !== '' || $current['appSecret'] !== '', 'instagramAppId' => $appId,
            'instagramAppSecretConfigured' => $appSecret !== '' || $current['appSecret'] !== '', 'message' => 'Instagram-Login-Zugang gespeichert. Prüfe zusätzlich die OAuth-Rückrufadresse und die Freigabe in Meta.']);
    }
    if ($path === '/api/admin/overview' && $method === 'GET') {
        socialflow_require_owner($user); $instagram = sf_instagram_config();
        $statuses = []; foreach (socialflow_all('SELECT status,COUNT(*) AS count FROM publications GROUP BY status') as $row) $statuses[$row['status']] = (int)$row['count'];
        $connections = array_map('sf_connection',socialflow_all('SELECT * FROM instagram_connections ORDER BY table_name COLLATE NOCASE'));
        socialflow_json(['server' => ['online' => true, 'time' => socialflow_now(), 'uptimeSeconds' => 0, 'mode' => 'production'],
            'instagram' => ['configured' => $instagram['appId'] !== '' && $instagram['appSecret'] !== '', 'publicMediaConfigured' => str_starts_with(socialflow_public_base_url(),'https://') || $instagram['dryRun'], 'dryRun' => $instagram['dryRun'], 'apiVersion' => $instagram['apiVersion'], 'connectionCount' => count($connections)],
            'publications' => ['total' => (int)(socialflow_one('SELECT COUNT(*) AS count FROM publications')['count'] ?? 0), 'statuses' => $statuses, 'recent' => array_map('sf_publication',socialflow_all('SELECT * FROM publications ORDER BY created_at DESC LIMIT 20'))], 'connections' => $connections]);
    }
    if ($path === '/api/instagram/status' && $method === 'GET') { socialflow_require_owner($user); socialflow_json(['connection' => sf_connection(sf_connection_row((string)($_GET['tableId'] ?? '')))]); }
    if ($path === '/api/instagram/connect' && $method === 'POST') {
        socialflow_require_owner($user); $body = socialflow_body(); $id = trim((string)($body['tableId'] ?? '')); $name = trim((string)($body['tableName'] ?? ''));
        if ($id === '' || $name === '') socialflow_fail(400, 'Kundentabelle fehlt.');
        $config = sf_instagram_config(); if ($config['appId'] === '' || $config['appSecret'] === '' || $config['redirectUri'] === '') socialflow_fail(503, 'Die Meta-App-Zugangsdaten fehlen.');
        $state = socialflow_token();
        socialflow_run('INSERT INTO oauth_states (state,table_id,table_name,expires_at) VALUES (?,?,?,?)', [$state,$id,$name,socialflow_future(600)]);
        $url = 'https://www.instagram.com/oauth/authorize?' . http_build_query(['client_id' => $config['appId'], 'redirect_uri' => $config['redirectUri'], 'response_type' => 'code', 'scope' => 'instagram_business_basic,instagram_business_content_publish', 'state' => $state, 'enable_fb_login' => '0', 'force_authentication' => '1']);
        socialflow_json(['authorizationUrl' => $url]);
    }
    if ($path === '/api/instagram/callback' && $method === 'GET') {
        $state = (string)($_GET['state'] ?? ''); $code = rtrim((string)($_GET['code'] ?? ''),'#_');
        $row = socialflow_one('SELECT * FROM oauth_states WHERE state=? AND expires_at>?', [$state,socialflow_now()]);
        if (!$row) sf_instagram_callback_page(false,'Die Anmeldung ist abgelaufen. Bitte starte sie erneut.');
        socialflow_run('DELETE FROM oauth_states WHERE state=?', [$state]);
        if ($code === '') sf_instagram_callback_page(false,(string)($_GET['error_description'] ?? 'Instagram hat keinen Anmeldecode zurückgegeben.'));
        try {
            $config = sf_instagram_config();
            $short = sf_http_form('https://api.instagram.com/oauth/access_token',['client_id' => $config['appId'],'client_secret' => $config['appSecret'],'grant_type' => 'authorization_code','redirect_uri' => $config['redirectUri'],'code' => $code]);
            $long = sf_http_json('https://graph.instagram.com/access_token?' . http_build_query(['grant_type' => 'ig_exchange_token','client_secret' => $config['appSecret'],'access_token' => $short['access_token']]));
            $token = (string)$long['access_token'];
            $profile = sf_http_json(sf_graph_url('/me',['fields' => 'id,username,account_type','access_token' => $token]));
            $now = socialflow_now(); $expires = !empty($long['expires_in']) ? socialflow_future((int)$long['expires_in']) : null;
            socialflow_run('INSERT INTO instagram_connections (table_id,table_name,instagram_user_id,username,account_type,encrypted_access_token,token_expires_at,connected_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(table_id) DO UPDATE SET table_name=excluded.table_name,instagram_user_id=excluded.instagram_user_id,username=excluded.username,account_type=excluded.account_type,encrypted_access_token=excluded.encrypted_access_token,token_expires_at=excluded.token_expires_at,updated_at=excluded.updated_at', [$row['table_id'],$row['table_name'],(string)($profile['id'] ?? $short['user_id']),$profile['username'] ?? null,$profile['account_type'] ?? null,sf_encrypt($token),$expires,$now,$now]);
            sf_instagram_callback_page(true,'@' . ($profile['username'] ?? 'Instagram') . ' wurde mit ' . $row['table_name'] . ' verbunden.');
        } catch (Throwable $error) { sf_instagram_callback_page(false,$error->getMessage()); }
    }
    if ($path === '/api/instagram/connection' && $method === 'DELETE') { socialflow_require_owner($user); socialflow_run('DELETE FROM instagram_connections WHERE table_id=?', [(string)($_GET['tableId'] ?? '')]); socialflow_json(['ok' => true]); }
    if ($path === '/api/customer-data' && $method === 'DELETE') {
        socialflow_require_owner($user); $id = (string)($_GET['tableId'] ?? '');
        if ($id === '') socialflow_fail(400,'Kundentabelle fehlt.');
        $files = [];
        foreach (socialflow_all('SELECT stored_name FROM planner_media WHERE table_id=?', [$id]) as $row) $files[] = $row['stored_name'];
        foreach (socialflow_all('SELECT media_json FROM publications WHERE table_id=?', [$id]) as $row) foreach (socialflow_json_decode($row['media_json'],[]) as $media) $files[] = $media['storedName'] ?? '';
        $db = socialflow_db(); $db->beginTransaction();
        try { foreach (['instagram_connections','publications','ai_drafts','ai_customer_configs','planner_media'] as $table) socialflow_run('DELETE FROM ' . $table . ' WHERE table_id=?', [$id]); $db->commit(); }
        catch (Throwable $error) { $db->rollBack(); throw $error; }
        foreach ($files as $file) { $pathName = socialflow_upload_dir() . '/' . basename($file); if ($file !== '' && is_file($pathName)) unlink($pathName); }
        socialflow_json(['ok' => true]);
    }
    if ($path === '/api/publications' && $method === 'GET') { socialflow_require_owner($user); socialflow_json(['publications' => array_map('sf_publication',socialflow_all('SELECT * FROM publications WHERE table_id=? ORDER BY created_at DESC LIMIT 200', [(string)($_GET['tableId'] ?? '')]))]); }
    if ($path === '/api/publications' && $method === 'POST') {
        socialflow_require_owner($user);
        $tableId = trim((string)($_POST['tableId'] ?? '')); $tableName = trim((string)($_POST['tableName'] ?? ''));
        $year = (int)($_POST['calendarYear'] ?? 2026); $week = (int)($_POST['weekNumber'] ?? 0); $item = (int)($_POST['itemIndex'] ?? -1);
        if ($tableId === '' || $tableName === '' || $year < 2026 || $year > 2031 || $week < 1 || $week > 53 || $item < 0) socialflow_fail(400, 'Die Tabellenzuordnung ist unvollständig.');
        $files = sf_publication_files(); $video = (bool)array_filter($files,fn($file) => str_starts_with($file['mime'],'video/'));
        $type = ($_POST['contentType'] ?? '') === 'story' ? 'story' : ($video ? 'reel' : 'post');
        if ($type === 'story' && count($files) !== 1) socialflow_fail(400, 'Eine Story benötigt genau ein Bild oder Video.');
        if ($type === 'reel' && (count($files) !== 1 || !$video)) socialflow_fail(400, 'Ein Reel benötigt genau eine Videodatei.');
        $config = sf_instagram_config();
        if (!sf_connection_row($tableId) && !$config['dryRun']) socialflow_fail(409, 'Verbinde zuerst das Instagram-Konto dieser Kundentabelle.');
        if (!$config['dryRun']) foreach ($files as $file) if ((str_starts_with($file['mime'],'image/') && $file['mime'] !== 'image/jpeg') || (str_starts_with($file['mime'],'video/') && !in_array($file['mime'],['video/mp4','video/quicktime'],true))) socialflow_fail(400, 'Für Instagram sind JPG-Bilder sowie MP4- oder MOV-Videos erforderlich.');
        $approved = ($_POST['customerApproved'] ?? '') === 'true'; $final = ($_POST['mainAdminApproved'] ?? '') === 'true';
        if ($final && !$approved) socialflow_fail(400, 'Vor der finalen Freigabe muss der Kunde bestätigt haben.');
        if ($final && !str_starts_with(socialflow_public_base_url(),'https://') && !$config['dryRun']) socialflow_fail(409, 'PUBLIC_BASE_URL muss eine öffentliche HTTPS-Adresse sein.');
        $scheduled = (string)($_POST['scheduledAt'] ?? '');
        try { $scheduledAt = $scheduled !== '' ? (new DateTimeImmutable($scheduled,new DateTimeZone('Europe/Berlin')))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.000\Z') : socialflow_now(); }
        catch (Throwable) { socialflow_fail(400, 'Das Veröffentlichungsdatum ist ungültig.'); }
        $crops = socialflow_json_decode((string)($_POST['cropSelections'] ?? '[]'), []);
        $media = []; $saved = [];
        try {
            foreach ($files as $i => $file) {
                $stored = socialflow_uuid() . $file['extension']; $pathName = socialflow_upload_dir() . '/' . $stored;
                if (!move_uploaded_file($file['tmp'],$pathName)) throw new RuntimeException('Ein Medium konnte nicht gespeichert werden.');
                $saved[] = $pathName;
                $media[] = ['originalName' => $file['name'],'storedName' => $stored,'mimeType' => $file['mime'],'publicUrl' => socialflow_public_base_url() . '/media/' . $stored,'instagramCrop' => $crops[$i] ?? null];
            }
            $id = socialflow_uuid(); $now = socialflow_now(); $status = $approved && $final ? 'queued' : 'draft';
            socialflow_run('INSERT INTO publications (id,table_id,table_name,calendar_year,week_number,item_index,content_type,caption,media_json,scheduled_at,customer_approved,main_admin_approved,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$id,$tableId,$tableName,$year,$week,$item,$type,(string)($_POST['caption'] ?? ''),json_encode($media),$scheduledAt,$approved ? 1 : 0,$final ? 1 : 0,$status,$now,$now]);
        } catch (Throwable $error) { foreach ($saved as $file) if (is_file($file)) unlink($file); throw $error; }
        sf_publication_event($id,'created',$status === 'queued' ? 'Zur Veröffentlichung eingeplant.' : 'Als Entwurf gespeichert.');
        if ($status === 'queued' && $scheduledAt <= socialflow_now()) sf_process_publication($id);
        socialflow_json(['publication' => sf_publication(socialflow_one('SELECT * FROM publications WHERE id=?', [$id]))], 201);
    }
    if (preg_match('~^/api/publications/([a-zA-Z0-9_-]+)/(publish|retry|cancel)$~',$path,$match) && $method === 'POST') {
        socialflow_require_owner($user); $id = $match[1]; $row = socialflow_one('SELECT * FROM publications WHERE id=?', [$id]);
        if (!$row) socialflow_fail(404, 'Veröffentlichungsauftrag nicht gefunden.');
        if ($match[2] === 'cancel') { socialflow_run("UPDATE publications SET status='cancelled',updated_at=? WHERE id=? AND status NOT IN ('published','publishing')", [socialflow_now(),$id]); sf_publication_event($id,'cancelled','Vom Hauptadmin abgebrochen.'); }
        else { socialflow_run("UPDATE publications SET status='queued',scheduled_at=?,main_admin_approved=1,customer_approved=1,last_error=NULL,updated_at=? WHERE id=?", [socialflow_now(),socialflow_now(),$id]); sf_process_publication($id); }
        socialflow_json(['publication' => sf_publication(socialflow_one('SELECT * FROM publications WHERE id=?', [$id]))]);
    }
    return false;
}
