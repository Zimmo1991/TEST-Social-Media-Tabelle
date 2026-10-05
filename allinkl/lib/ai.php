<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';

function sf_ai_default(string $tableId): array {
    return ['tableId' => $tableId, 'tableName' => '', 'enabled' => false, 'imageFolder' => '', 'allowedWebsites' => [], 'pdfFiles' => [], 'tone' => '', 'forbiddenTerms' => [], 'notes' => '', 'fieldMapping' => ['german' => 'text', 'italian' => 'textItalian'], 'updatedAt' => null];
}
function sf_ai_config(string $tableId): array {
    $row = socialflow_one('SELECT * FROM ai_customer_configs WHERE table_id=?', [$tableId]);
    if (!$row) return sf_ai_default($tableId);
    return ['tableId' => $row['table_id'], 'tableName' => $row['table_name'], 'enabled' => (bool)$row['enabled'], 'imageFolder' => $row['image_folder'], 'allowedWebsites' => socialflow_json_decode($row['allowed_websites_json'], []), 'pdfFiles' => socialflow_json_decode($row['pdf_files_json'], []), 'tone' => $row['tone'], 'forbiddenTerms' => socialflow_json_decode($row['forbidden_terms_json'], []), 'notes' => $row['notes'], 'fieldMapping' => socialflow_json_decode($row['field_mapping_json'], ['german' => 'text', 'italian' => 'textItalian']), 'updatedAt' => $row['updated_at']];
}
function sf_ai_strings(mixed $value, int $max): array {
    $items = is_array($value) ? $value : preg_split('/\r?\n/', (string)$value);
    return array_slice(array_values(array_unique(array_filter(array_map(fn($item) => trim((string)$item), $items)))), 0, $max);
}
function sf_ai_public_ip(string $ip): bool {
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
}
function sf_ai_public_url(string $url): bool {
    $parts = parse_url($url);
    if (!$parts || !in_array($parts['scheme'] ?? '', ['http','https'], true) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) return false;
    $records = dns_get_record($parts['host'], DNS_A + DNS_AAAA);
    return (bool)$records && !array_filter($records, fn($record) => !sf_ai_public_ip($record['ip'] ?? $record['ipv6'] ?? ''));
}
function sf_ai_validate(array $body): array {
    $id = trim((string)($body['tableId'] ?? '')); $name = trim((string)($body['tableName'] ?? ''));
    if ($id === '' || strlen($id) > 150 || $name === '' || strlen($name) > 250) socialflow_fail(400, 'Die Kundentabelle ist ungültig.');
    $enabled = !empty($body['enabled']); $folder = trim((string)($body['imageFolder'] ?? ''));
    if ($enabled && $folder === '') socialflow_fail(400, 'Wähle zuerst genau einen Bildordner für diesen Kunden aus.');
    if ($folder !== '' && !preg_match('~^(?:/|[A-Za-z]:[\\\\/])~', $folder)) socialflow_fail(400, 'Der Bildordner muss als vollständiger Pfad angegeben werden.');
    $imageRoot = socialflow_env('AI_IMAGE_ROOT');
    if ($folder !== '' && $imageRoot !== '') {
        $root = realpath($imageRoot); $selected = realpath($folder);
        if (!$root || !$selected || is_link($folder) || dirname($selected) !== $root || !is_dir($selected))
            socialflow_fail(400, 'Der Bildordner muss direkt im freigegebenen Serverordner liegen.');
        $folder = $selected;
    }
    $sites = sf_ai_strings($body['allowedWebsites'] ?? [], 12);
    foreach ($sites as $url) if (!sf_ai_public_url($url)) socialflow_fail(400, 'Eine freigegebene Website ist nicht öffentlich erreichbar oder ungültig.');
    $pdfs = sf_ai_strings($body['pdfFiles'] ?? [], 12);
    foreach ($pdfs as $pdf) if (!preg_match('/\.pdf$/i', $pdf) || !preg_match('~^(?:/|[A-Za-z]:[\\\\/])~', $pdf)) socialflow_fail(400, 'PDF-Quellen müssen vollständige Dateipfade sein.');
    $mapping = $body['fieldMapping'] ?? []; $german = trim((string)($mapping['german'] ?? 'text')); $italian = trim((string)($mapping['italian'] ?? 'textItalian'));
    foreach ([$german,$italian] as $key) if (!preg_match('/^(?:text|textItalian|custom-[a-zA-Z0-9_-]{1,80})$/', $key)) socialflow_fail(400, 'Die Feldzuordnung enthält eine ungültige Zielspalte.');
    return ['tableId' => $id, 'tableName' => $name, 'enabled' => $enabled, 'imageFolder' => $folder, 'allowedWebsites' => $sites, 'pdfFiles' => $pdfs, 'tone' => substr(trim((string)($body['tone'] ?? '')),0,1000), 'forbiddenTerms' => sf_ai_strings($body['forbiddenTerms'] ?? [],100), 'notes' => substr(trim((string)($body['notes'] ?? '')),0,4000), 'fieldMapping' => ['german' => $german, 'italian' => $italian]];
}
function sf_ai_images(string $folder, string $tableId): array {
    if (!is_dir($folder) || is_link($folder)) socialflow_fail(409, 'Der freigegebene Bildordner existiert nicht oder ist nicht zugänglich.');
    $directory = realpath($folder);
    if ($directory === false) socialflow_fail(409, 'Der Bildordner ist nicht zugänglich.');
    $used = array_column(socialflow_all('SELECT image_hash FROM ai_drafts WHERE table_id=?', [$tableId]), 'image_hash');
    $images = [];
    foreach (scandir($directory) ?: [] as $name) {
        $path = $directory . DIRECTORY_SEPARATOR . $name;
        if (!is_file($path) || is_link($path) || !preg_match('/\.(?:jpe?g|png|webp)$/i', $name) || filesize($path) > 20 * 1024 * 1024 || dirname(realpath($path) ?: '') !== $directory) continue;
        $data = file_get_contents($path); if ($data === false) continue;
        $hash = hash('sha256', $data); if (in_array($hash, $used, true)) continue;
        $mime = socialflow_mime($path); if (!in_array($mime, ['image/jpeg','image/png','image/webp'], true)) continue;
        $images[] = ['name' => $name, 'path' => $path, 'hash' => $hash, 'mime' => $mime, 'data' => $data];
    }
    usort($images, fn($a,$b) => strnatcasecmp($a['name'], $b['name']));
    return array_slice($images, 0, 6);
}
function sf_ai_pdfs(array $paths): array {
    $pdfs = [];
    foreach ($paths as $path) {
        if (!is_file($path) || is_link($path) || filesize($path) > 15 * 1024 * 1024 || !preg_match('/\.pdf$/i', $path)) socialflow_fail(409, 'Eine freigegebene PDF-Datei ist nicht erreichbar oder zu groß.');
        $pdfs[] = ['name' => basename($path), 'data' => file_get_contents($path)];
    }
    return $pdfs;
}
function sf_ai_websites(array $urls): array {
    $sources = [];
    foreach ($urls as $url) {
        if (!sf_ai_public_url($url)) socialflow_fail(409, 'Eine freigegebene Website ist nicht erreichbar.');
        $parts = parse_url($url);
        $addresses = dns_get_record($parts['host'], DNS_A + DNS_AAAA);
        if (!$addresses || array_filter($addresses, fn($record) => !sf_ai_public_ip($record['ip'] ?? $record['ipv6'] ?? ''))) socialflow_fail(409, 'Eine freigegebene Website ist nicht öffentlich erreichbar.');
        $address = $addresses[0]['ip'] ?? '[' . $addresses[0]['ipv6'] . ']';
        $port = $parts['scheme'] === 'https' ? 443 : 80;
        try { [$status,$html] = sf_http($url, 'GET', ['User-Agent: SocialFlow/1.0'], '', 8, [$parts['host'] . ':' . $port . ':' . $address]); }
        catch (Throwable) { socialflow_fail(409, 'Eine freigegebene Website konnte nicht gelesen werden.'); }
        if ($status !== 200 || strlen($html) > 1000000) socialflow_fail(409, 'Eine freigegebene Website konnte nicht gelesen werden.');
        $text = trim(preg_replace('/\s+/u', ' ', strip_tags(preg_replace('~<(script|style)\b[^>]*>.*?</\1>~is', ' ', $html))));
        $sources[] = ['url' => $url, 'text' => mb_substr($text, 0, 12000)];
    }
    return $sources;
}
function sf_ai_text(string $value, string $label, array $forbidden): string {
    $value = trim($value);
    if ($value === '' || preg_match_all('/./us', $value) > 250 || preg_match('/(?:^|\s)#[\pL\pN_]+/u', $value)) socialflow_fail(502, 'Der KI-Text ist leer, zu lang oder enthält Hashtags. Es wurden keine Tabellendaten verändert.');
    foreach ($forbidden as $term) if (mb_stripos($value, $term) !== false) socialflow_fail(502, 'Der ' . $label . ' enthält einen verbotenen Begriff.');
    return $value;
}
function sf_ai_generate(array $images, array $websites, array $pdfs, array $config, string $period): array {
    if (socialflow_env('AI_AGENT_DRY_RUN') === 'true') return ['selectedImageName' => $images[0]['name'], 'imageDescription' => 'Testbild für einen Social-Media-Entwurf', 'germanText' => 'Ein passender Einblick für ' . $period . '. Frisch vorbereitet und bereit zur gemeinsamen Abstimmung.', 'italianText' => 'Uno sguardo adatto per ' . $period . '. Preparato con cura e pronto per essere rivisto insieme.'];
    $key = socialflow_env('OPENAI_API_KEY'); if ($key === '') socialflow_fail(409, 'Der KI-Agent ist noch nicht eingerichtet.');
    $instruction = implode("\n\n", array_filter([
        'Bereite genau einen unveröffentlichten Social-Media-Entwurf vor. Wähle genau eines der beigefügten Kundenbilder anhand seines Dateinamens: ' . implode(', ', array_column($images,'name')) . '.',
        'Analysiere den sichtbaren Bildinhalt. Erfinde keine Fakten. Für Fakten sind ausschließlich die folgenden Websites und PDFs erlaubt.',
        'Schreibe einen deutschen und einen italienischen Beitragstext mit jeweils höchstens 250 Unicode-Zeichen. Keine Hashtags. Keine Planung oder Veröffentlichung.',
        'Zeitraum: ' . $period . '. Tonalität: ' . ($config['tone'] ?: 'professionell, freundlich und klar') . '.',
        $config['forbiddenTerms'] ? 'Verbotene Begriffe: ' . implode(', ', $config['forbiddenTerms']) : '',
        $config['notes'] ?: '',
        $websites ? implode("\n\n", array_map(fn($source) => $source['url'] . ': ' . $source['text'], $websites)) : 'Keine Website-Fakten freigegeben.',
    ]));
    $content = [['type' => 'input_text', 'text' => $instruction]];
    foreach ($images as $image) $content[] = ['type' => 'input_image', 'image_url' => 'data:' . $image['mime'] . ';base64,' . base64_encode($image['data']), 'detail' => 'low'];
    foreach ($pdfs as $pdf) $content[] = ['type' => 'input_file', 'filename' => $pdf['name'], 'file_data' => 'data:application/pdf;base64,' . base64_encode($pdf['data'])];
    $schema = ['type' => 'object', 'additionalProperties' => false, 'properties' => ['selectedImageName' => ['type' => 'string', 'enum' => array_column($images,'name')], 'imageDescription' => ['type' => 'string'], 'germanText' => ['type' => 'string', 'maxLength' => 250], 'italianText' => ['type' => 'string', 'maxLength' => 250]], 'required' => ['selectedImageName','imageDescription','germanText','italianText']];
    try { $result = sf_http_json('https://api.openai.com/v1/responses', 'POST', ['Authorization: Bearer ' . $key], ['model' => sf_ai_runtime()['model'], 'store' => false, 'input' => [['role' => 'user', 'content' => $content]], 'text' => ['format' => ['type' => 'json_schema', 'name' => 'socialflow_ai_draft', 'strict' => true, 'schema' => $schema]]]); }
    catch (Throwable $error) { socialflow_fail(502, 'Die KI-Bildanalyse konnte nicht abgeschlossen werden: ' . $error->getMessage()); }
    $output = $result['output_text'] ?? null;
    if (!is_string($output)) foreach ($result['output'] ?? [] as $item) foreach ($item['content'] ?? [] as $part) if (($part['type'] ?? '') === 'output_text') $output = $part['text'];
    $draft = socialflow_json_decode($output, null);
    if (!is_array($draft)) socialflow_fail(502, 'Die KI hat keine gültige Entwurfsantwort geliefert.');
    return $draft;
}
function sf_ai_public_draft(array $row): array {
    return ['id' => $row['id'], 'tableId' => $row['table_id'], 'calendarYear' => (int)$row['calendar_year'], 'weekNumber' => (int)$row['week_number'], 'itemIndex' => (int)$row['item_index'], 'contentType' => $row['content_type'], 'imageName' => $row['image_name'], 'imageMimeType' => $row['image_mime_type'], 'imageDescription' => $row['image_description'], 'germanText' => $row['german_text'], 'italianText' => $row['italian_text'], 'assignments' => socialflow_json_decode($row['assignments_json'], []), 'sources' => socialflow_json_decode($row['sources_json'], []), 'status' => $row['status'], 'createdAt' => $row['created_at'], 'imageUrl' => '/api/ai/drafts/' . rawurlencode($row['id']) . '/image'];
}
function socialflow_ai_route(string $path, string $method, ?array $user): bool {
    if (!str_starts_with($path, '/api/ai/')) return false;
    socialflow_require_owner($user);
    if ($path === '/api/ai/config' && $method === 'GET') { $id = trim((string)($_GET['tableId'] ?? '')); if ($id === '') socialflow_fail(400, 'Kundentabelle fehlt.'); socialflow_json(['configuration' => sf_ai_config($id), 'runtime' => sf_ai_runtime()]); }
    if ($path === '/api/ai/config' && $method === 'PUT') {
        $config = sf_ai_validate(socialflow_body()); $now = socialflow_now();
        socialflow_run('INSERT INTO ai_customer_configs (table_id,table_name,enabled,image_folder,allowed_websites_json,pdf_files_json,tone,forbidden_terms_json,notes,field_mapping_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(table_id) DO UPDATE SET table_name=excluded.table_name,enabled=excluded.enabled,image_folder=excluded.image_folder,allowed_websites_json=excluded.allowed_websites_json,pdf_files_json=excluded.pdf_files_json,tone=excluded.tone,forbidden_terms_json=excluded.forbidden_terms_json,notes=excluded.notes,field_mapping_json=excluded.field_mapping_json,updated_at=excluded.updated_at', [$config['tableId'],$config['tableName'],$config['enabled'] ? 1 : 0,$config['imageFolder'],json_encode($config['allowedWebsites']),json_encode($config['pdfFiles']),$config['tone'],json_encode($config['forbiddenTerms']),$config['notes'],json_encode($config['fieldMapping']),$now,$now]);
        socialflow_json(['configuration' => sf_ai_config($config['tableId']), 'runtime' => sf_ai_runtime()]);
    }
    if ($path === '/api/ai/select-folder' && $method === 'POST') {
        $root = realpath(socialflow_env('AI_IMAGE_ROOT'));
        if (!$root || !is_dir($root)) socialflow_fail(409, 'Richte zuerst AI_IMAGE_ROOT als geschützten Serverordner ein.');
        $choices = [];
        foreach (scandir($root) ?: [] as $name) {
            $candidate = $root . DIRECTORY_SEPARATOR . $name;
            if ($name === '.' || $name === '..' || is_link($candidate) || !is_dir($candidate) || dirname(realpath($candidate) ?: '') !== $root) continue;
            $choices[] = ['name' => $name, 'path' => $candidate];
        }
        usort($choices, fn($a,$b) => strnatcasecmp($a['name'],$b['name']));
        socialflow_json(['choices' => $choices]);
    }
    if (preg_match('~^/api/ai/drafts/([a-zA-Z0-9_-]+)/image$~', $path, $match) && $method === 'GET') {
        $row = socialflow_one('SELECT * FROM ai_drafts WHERE id=?', [$match[1]]);
        if (!$row) socialflow_fail(404, 'Das Entwurfsbild ist nicht mehr verfügbar.');
        $config = sf_ai_config($row['table_id']); $folder = realpath($config['imageFolder']); $image = realpath($row['image_path']);
        if (!$folder || !$image || dirname($image) !== $folder || is_link($image)) socialflow_fail(404, 'Das Entwurfsbild ist nicht mehr verfügbar.');
        socialflow_file($image, false);
    }
    if ($path === '/api/ai/prepare-draft' && $method === 'POST') {
        $body = socialflow_body(); $tableId = trim((string)($body['tableId'] ?? '')); $year = (int)($body['calendarYear'] ?? 0); $week = (int)($body['weekNumber'] ?? 0); $item = (int)($body['itemIndex'] ?? -1);
        if ($tableId === '' || ($body['tableName'] ?? '') === '' || $year < 2026 || $year > 2031 || $week < 1 || $week > 53 || $item < 0) socialflow_fail(400, 'Die ausgewählte Beitragszeile ist unvollständig.');
        if (($body['contentType'] ?? '') !== 'post') socialflow_fail(400, 'Der KI-Agent ist nur für Post-Zeilen verfügbar.');
        if (!empty($body['approved']) || !empty($body['published']) || !empty($body['instagramPublicationId'])) socialflow_fail(409, 'Diese Beitragszeile ist nicht mehr offen.');
        $config = sf_ai_config($tableId);
        if (!$config['enabled']) socialflow_fail(409, 'Der KI-Agent ist für diese Kundentabelle ausgeschaltet.');
        $images = sf_ai_images($config['imageFolder'], $tableId);
        if (!$images) socialflow_fail(409, 'Im freigegebenen Kundenordner wurde kein unverwendetes Bild gefunden.');
        $pdfs = sf_ai_pdfs($config['pdfFiles']); $websites = sf_ai_websites($config['allowedWebsites']);
        $generated = sf_ai_generate($images,$websites,$pdfs,$config,$year . ', KW ' . str_pad((string)$week,2,'0',STR_PAD_LEFT));
        $selected = null; foreach ($images as $image) if ($image['name'] === ($generated['selectedImageName'] ?? '')) { $selected = $image; break; }
        if (!$selected) socialflow_fail(502, 'Die KI hat kein Bild aus dem freigegebenen Kundenordner ausgewählt.');
        $german = sf_ai_text((string)($generated['germanText'] ?? ''),'deutsche Text',$config['forbiddenTerms']);
        $italian = sf_ai_text((string)($generated['italianText'] ?? ''),'italienische Text',$config['forbiddenTerms']);
        $mapping = $config['fieldMapping'];
        $assignments = $mapping['german'] === $mapping['italian'] ? [$mapping['german'] => $german . "\n\n" . $italian] : [$mapping['german'] => $german, $mapping['italian'] => $italian];
        $id = socialflow_uuid(); $now = socialflow_now();
        try { socialflow_run("INSERT INTO ai_drafts (id,table_id,table_name,calendar_year,week_number,item_index,content_type,image_name,image_path,image_hash,image_mime_type,image_description,german_text,italian_text,assignments_json,config_snapshot_json,sources_json,status,created_by,created_at) VALUES (?,?,?,?,?,?,'post',?,?,?,?,?,?,?,?,?,?,'draft',?,?)", [$id,$tableId,(string)$body['tableName'],$year,$week,$item,$selected['name'],$selected['path'],$selected['hash'],$selected['mime'],trim((string)($generated['imageDescription'] ?? '')),$german,$italian,json_encode($assignments),json_encode($config),json_encode(['websites' => $config['allowedWebsites'], 'pdfNames' => array_column($pdfs,'name')]),$user['id'] ?? 'admin-key',$now]); }
        catch (PDOException) { socialflow_fail(409, 'Dieses Bild wurde für den Kunden bereits verwendet.'); }
        socialflow_json(['draft' => sf_ai_public_draft(socialflow_one('SELECT * FROM ai_drafts WHERE id=?', [$id]))], 201);
    }
    socialflow_fail(404, 'API-Endpunkt nicht gefunden.');
}
