<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/api.php';

try {
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    if (str_starts_with($path, '/api/')) {
        socialflow_api($path, $_SERVER['REQUEST_METHOD'] ?? 'GET');
    } elseif (preg_match('~^/media/([a-zA-Z0-9._-]+)$~', $path, $matches)) {
        socialflow_publication_media($matches[1]);
    } else {
        $files = ['/' => 'index.html', '/index.html' => 'index.html', '/script.js' => 'script.js', '/styles.css' => 'styles.css'];
        if (!isset($files[$path])) socialflow_fail(404, 'Datei nicht gefunden.');
        socialflow_file(SOCIALFLOW_ROOT . '/' . $files[$path], false);
    }
} catch (SocialFlowHttpError $error) {
    socialflow_json(['error' => $error->getMessage()], $error->status);
} catch (Throwable $error) {
    error_log('SocialFlow: ' . $error);
    socialflow_json(['error' => 'Interner Serverfehler.'], 500);
}
