<?php
declare(strict_types=1);

function sf_http(string $url, string $method = 'GET', array $headers = [], string $payload = '', int $timeout = 20, array $resolve = []): array {
    if (!extension_loaded('curl')) socialflow_fail(503, 'PHP benötigt die Erweiterung curl.');
    $handle = curl_init($url);
    curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => $timeout, CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0,
        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_HEADER => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS]);
    if ($resolve) curl_setopt($handle, CURLOPT_RESOLVE, $resolve);
    if ($method !== 'GET') curl_setopt($handle, CURLOPT_POSTFIELDS, $payload);
    $body = curl_exec($handle); $status = (int)curl_getinfo($handle, CURLINFO_RESPONSE_CODE); $error = curl_error($handle);
    curl_close($handle);
    if ($body === false) throw new RuntimeException($error ?: 'Der externe Dienst ist nicht erreichbar.');
    return [$status, (string)$body];
}

function sf_http_json(string $url, string $method = 'GET', array $headers = [], array $payload = []): array {
    if ($method !== 'GET') $headers[] = 'Content-Type: application/json';
    [$status, $text] = sf_http($url, $method, $headers, $method === 'GET' ? '' : json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $data = socialflow_json_decode($text, []);
    if ($status < 200 || $status >= 300 || isset($data['error'])) throw new RuntimeException((string)($data['error']['message'] ?? $data['message'] ?? 'HTTP ' . $status));
    return $data;
}

function sf_http_form(string $url, array $data, array $headers = []): array {
    $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    [$status, $text] = sf_http($url, 'POST', $headers, http_build_query($data));
    $body = socialflow_json_decode($text, []);
    if ($status < 200 || $status >= 300 || isset($body['error'])) throw new RuntimeException((string)($body['error']['message'] ?? $body['error_description'] ?? $body['message'] ?? 'HTTP ' . $status));
    return $body;
}
