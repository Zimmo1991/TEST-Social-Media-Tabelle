<?php
declare(strict_types=1);
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/planner.php';
require_once __DIR__ . '/users.php';
require_once __DIR__ . '/translation.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/ai.php';
require_once __DIR__ . '/instagram.php';

function socialflow_api(string $path, string $method): never {
    if ($path === '/api/health' && $method === 'GET') { socialflow_db(); socialflow_json(['ok' => true, 'time' => socialflow_now()]); }
    if ($path === '/api/cron' && $method === 'GET') {
        $secret = socialflow_env('CRON_SECRET');
        if (strlen($secret) < 32 || !hash_equals($secret, (string)($_GET['key'] ?? ''))) socialflow_fail(404, 'API-Endpunkt nicht gefunden.');
        socialflow_db();
        $lock = fopen(socialflow_data_dir() . '/.publication-cron.lock', 'c');
        if (!$lock) socialflow_fail(503, 'Der Aufgabenplaner ist nicht verfügbar.');
        if (!flock($lock, LOCK_EX | LOCK_NB)) { fclose($lock); socialflow_json(['ok' => true, 'busy' => true]); }
        try { sf_process_due_publications(); }
        finally { flock($lock, LOCK_UN); fclose($lock); }
        socialflow_json(['ok' => true]);
    }
    socialflow_auth_route($path, $method);
    $user = socialflow_user();
    if (!$user && !socialflow_owner()) socialflow_fail(401, 'Bitte melde dich an, um Planyoursocials zu verwenden.');
    socialflow_planner_route($path, $method, $user);
    socialflow_users_route($path, $method, $user);
    socialflow_translate_route($path, $method, $user);
    socialflow_config_route($path, $method, $user);
    socialflow_ai_route($path, $method, $user);
    socialflow_instagram_route($path, $method, $user);
    socialflow_fail(404, 'API-Endpunkt nicht gefunden.');
}
