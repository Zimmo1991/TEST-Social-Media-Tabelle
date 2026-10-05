<?php
declare(strict_types=1);

function sf_clean_state(mixed $state): array {
    if (!is_array($state) || !is_array($state['tables'] ?? null) || count($state['tables']) > 500) socialflow_fail(400, 'Die Tabellendaten sind ungültig.');
    $ids = [];
    foreach ($state['tables'] as $table) {
        $id = $table['id'] ?? null;
        if (!is_string($id) || !preg_match('/^[a-zA-Z0-9_-]{1,100}$/', $id) || isset($ids[$id])) socialflow_fail(400, 'Mindestens eine Kundentabelle hat eine ungültige Kennung.');
        $ids[$id] = true;
    }
    return ['tables' => $state['tables'], 'sharedTableLayoutEnabled' => !empty($state['sharedTableLayoutEnabled']), 'tableTemplateSourceId' => is_string($state['tableTemplateSourceId'] ?? null) ? $state['tableTemplateSourceId'] : 'bergwerk', 'tableTemplateSchema' => is_array($state['tableTemplateSchema'] ?? null) ? $state['tableTemplateSchema'] : null];
}

function sf_stored_state(): array {
    $row = socialflow_one('SELECT * FROM planner_state WHERE id=1');
    return $row ? ['state' => sf_clean_state(socialflow_json_decode($row['state_json'], ['tables' => []])), 'revision' => (int)$row['revision'], 'updatedAt' => $row['updated_at']] : ['state' => null, 'revision' => 0, 'updatedAt' => null];
}

function sf_public_media(array $row): array {
    return ['id' => $row['id'], 'tableId' => $row['table_id'], 'name' => $row['original_name'], 'type' => $row['mime_type'], 'size' => (int)$row['byte_size'], 'url' => '/api/planner-media/' . rawurlencode($row['id'])];
}

function socialflow_planner_route(string $path, string $method, ?array $user): bool {
    if ($path === '/api/planner-state' && $method === 'GET') {
        socialflow_require_user($user); $stored = sf_stored_state();
        if ($stored['state'] !== null && $user['role'] !== 'owner') $stored['state']['tables'] = array_values(array_filter($stored['state']['tables'], fn($table) => in_array($table['id'], $user['tableIds'], true)));
        socialflow_json($stored);
    }
    if ($path === '/api/planner-state' && $method === 'PUT') {
        socialflow_require_user($user); $incoming = sf_clean_state(socialflow_body(25 * 1024 * 1024)['state'] ?? null); $stored = sf_stored_state(); $next = $incoming;
        if ($user['role'] !== 'owner') {
            if (!$stored['state']) socialflow_fail(409, 'Der Hauptadmin muss die Tabellen zuerst zentral speichern.');
            $incomingById = [];
            foreach ($incoming['tables'] as $table) if (in_array($table['id'], $user['tableIds'], true)) $incomingById[$table['id']] = $table;
            $next = $stored['state'];
            foreach ($next['tables'] as &$table) if (isset($incomingById[$table['id']]) && is_array($incomingById[$table['id']]['weeks'] ?? null)) $table['weeks'] = $incomingById[$table['id']]['weeks'];
            unset($table);
        }
        $json = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > 24 * 1024 * 1024) socialflow_fail(413, 'Der Tabellenstand ist zu groß.');
        $revision = $stored['revision'] + 1; $now = socialflow_now();
        socialflow_run('INSERT INTO planner_state (id,state_json,revision,updated_by,updated_at) VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at', [$json,$revision,$user['id'],$now]);
        socialflow_json(['ok' => true, 'revision' => $revision, 'updatedAt' => $now]);
    }
    if ($path === '/api/planner-media' && $method === 'POST') {
        socialflow_require_user($user); $tableId = (string)($_POST['tableId'] ?? '');
        if (!socialflow_access($user, $tableId)) socialflow_fail(403, 'Du hast keinen Zugriff auf diese Kundentabelle.');
        $allowed = ['image/jpeg' => '.jpg', 'image/png' => '.png', 'image/webp' => '.webp', 'image/gif' => '.gif', 'video/mp4' => '.mp4', 'video/quicktime' => '.mov', 'video/webm' => '.webm'];
        $upload = socialflow_upload('media', $allowed, 250 * 1024 * 1024); $id = socialflow_uuid(); $name = 'planner-' . $id . $upload['extension'];
        if (!move_uploaded_file($upload['tmp'], socialflow_upload_dir() . '/' . $name)) socialflow_fail(500, 'Das Medium konnte nicht gespeichert werden.');
        try { socialflow_run('INSERT INTO planner_media (id,table_id,stored_name,original_name,mime_type,byte_size,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)', [$id,$tableId,$name,$upload['name'],$upload['mime'],$upload['size'],$user['id'],socialflow_now()]); }
        catch (Throwable $error) { unlink(socialflow_upload_dir() . '/' . $name); throw $error; }
        socialflow_json(['media' => sf_public_media(socialflow_one('SELECT * FROM planner_media WHERE id=?', [$id]))], 201);
    }
    if (preg_match('~^/api/planner-media/([a-zA-Z0-9_-]+)$~', $path, $match)) {
        socialflow_require_user($user); $row = socialflow_one('SELECT * FROM planner_media WHERE id=?', [$match[1]]);
        if (!$row && $method === 'DELETE') socialflow_json(['ok' => true]);
        if (!$row) socialflow_fail(404, 'Medium nicht gefunden.');
        if (!socialflow_access($user, $row['table_id'])) socialflow_fail(403, 'Du hast keinen Zugriff auf dieses Medium.');
        $file = socialflow_upload_dir() . '/' . basename($row['stored_name']);
        if ($method === 'GET') socialflow_file($file, false);
        if ($method === 'DELETE') { socialflow_run('DELETE FROM planner_media WHERE id=?', [$row['id']]); if (is_file($file)) unlink($file); socialflow_json(['ok' => true]); }
    }
    if ($path === '/api/planner-history' && $method === 'GET') {
        socialflow_require_owner($user);
        $entries = array_map(fn($row) => ['id' => (int)$row['id'], 'timestamp' => strtotime($row['created_at']) * 1000, 'tableId' => $row['table_id'], 'tableName' => $row['table_name'], 'userId' => $row['user_id'], 'userName' => $row['user_name'], 'description' => $row['description'], 'byteSize' => (int)$row['byte_size'], 'snapshot' => socialflow_json_decode($row['snapshot_json'], [])], socialflow_all('SELECT * FROM planner_history ORDER BY id DESC LIMIT 1000'));
        socialflow_json(['entries' => $entries]);
    }
    if ($path === '/api/planner-history' && $method === 'POST') {
        socialflow_require_user($user); $body = socialflow_body(25 * 1024 * 1024); $tableId = (string)($body['tableId'] ?? '');
        if (!socialflow_access($user, $tableId)) socialflow_fail(403, 'Du hast keinen Zugriff auf diese Kundentabelle.');
        if (!is_array($body['snapshot'] ?? null)) socialflow_fail(400, 'Der Tabellenstand ist ungültig.');
        $snapshot = json_encode($body['snapshot'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($snapshot === false || strlen($snapshot) > 24 * 1024 * 1024) socialflow_fail(413, 'Der historische Tabellenstand ist zu groß.');
        socialflow_run('INSERT INTO planner_history (table_id,table_name,user_id,user_name,description,byte_size,snapshot_json,created_at) VALUES (?,?,?,?,?,?,?,?)', [$tableId,substr((string)($body['tableName'] ?? 'Kundentabelle'),0,200),$user['id'],$user['name'],substr((string)($body['description'] ?? 'Tabelleninhalt geändert'),0,500),strlen($snapshot),$snapshot,socialflow_now()]);
        socialflow_run('DELETE FROM planner_history WHERE id IN (SELECT id FROM planner_history ORDER BY id DESC LIMIT -1 OFFSET 1000)');
        socialflow_json(['ok' => true], 201);
    }
    return false;
}
