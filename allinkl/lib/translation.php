<?php
declare(strict_types=1);
require_once __DIR__ . '/http.php';

function socialflow_translate_route(string $path, string $method, ?array $user): bool {
    if ($path !== '/api/translate' || $method !== 'POST') return false;
    socialflow_require_user($user);
    $body = socialflow_body(); $text = trim((string)($body['text'] ?? '')); $target = (string)($body['targetLanguage'] ?? '');
    if ($text === '' || strlen($text) > 20000) socialflow_fail(400, 'Gib zuerst einen deutschen Beitragstext ein.');
    if (!in_array($target, ['IT','EN-GB'], true)) socialflow_fail(400, 'Als Zielsprache sind Italienisch oder Englisch möglich.');
    if (socialflow_env('TRANSLATION_DRY_RUN') === 'true') socialflow_json(['translation' => '[' . $target . '] ' . $text, 'provider' => 'test']);
    $key = socialflow_env('DEEPL_API_KEY');
    if ($key === '') socialflow_fail(503, 'Die automatische Übersetzung ist noch nicht eingerichtet.');
    $url = socialflow_env('DEEPL_API_URL', str_ends_with($key, ':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate');
    try { $result = sf_http_json($url, 'POST', ['Authorization: DeepL-Auth-Key ' . $key, 'Accept: application/json'], ['text' => [$text], 'source_lang' => 'DE', 'target_lang' => $target]); }
    catch (Throwable $error) { socialflow_fail(502, 'Die Übersetzung konnte nicht erstellt werden: ' . $error->getMessage()); }
    $translated = $result['translations'][0]['text'] ?? '';
    if ($translated === '') socialflow_fail(502, 'Der Übersetzungsdienst hat keinen Text zurückgegeben.');
    socialflow_json(['translation' => $translated, 'provider' => 'DeepL']);
}
