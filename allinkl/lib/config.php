<?php
declare(strict_types=1);

function sf_instagram_config(): array {
    return ['appId' => socialflow_env('INSTAGRAM_APP_ID'), 'appSecret' => socialflow_env('INSTAGRAM_APP_SECRET'),
        'redirectUri' => socialflow_env('INSTAGRAM_REDIRECT_URI', socialflow_public_base_url() . '/api/instagram/callback'),
        'apiVersion' => socialflow_env('INSTAGRAM_API_VERSION', 'v24.0'), 'dryRun' => socialflow_env('INSTAGRAM_DRY_RUN') === 'true'];
}

function sf_ai_runtime(): array { return ['configured' => socialflow_env('OPENAI_API_KEY') !== '' || socialflow_env('AI_AGENT_DRY_RUN') === 'true', 'dryRun' => socialflow_env('AI_AGENT_DRY_RUN') === 'true', 'model' => socialflow_env('OPENAI_MODEL', 'gpt-4.1-mini')]; }


function sf_local_instagram_config_editable(?array $user): bool {
    if (!$user || ($user['role'] ?? '') !== 'owner' || socialflow_env('NODE_ENV', 'development') === 'production') return false;
    $address = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return in_array($address, ['127.0.0.1', '::1', '::ffff:127.0.0.1'], true);
}

function sf_write_local_environment(array $values): void {
    $file = SOCIALFLOW_ROOT . '/.env';
    $contents = is_file($file) ? (string)file_get_contents($file) : '';
    $lines = $contents === '' ? [] : preg_split('/\R/', $contents);
    $remaining = $values;
    foreach ($lines as $index => $line) {
        foreach ($values as $key => $value) {
            if (preg_match('/^\s*' . preg_quote($key, '/') . '\s*=/', $line)) {
                $lines[$index] = $key . '=' . $value;
                unset($remaining[$key]);
                break;
            }
        }
    }
    foreach ($remaining as $key => $value) $lines[] = $key . '=' . $value;
    $output = implode(PHP_EOL, $lines) . PHP_EOL;
    if (file_put_contents($file, $output, LOCK_EX) === false) socialflow_fail(503, 'Die lokale .env-Datei konnte nicht gespeichert werden.');
}

function socialflow_config_route(string $path, string $method, ?array $user): bool {
    if ($path !== '/api/config' || $method !== 'GET') return false;
    socialflow_require_user($user);
    $instagram = sf_instagram_config();
    socialflow_json([
        'instagramConfigured' => $instagram['appId'] !== '' && $instagram['appSecret'] !== '',
        'instagramAppId' => $instagram['appId'], 'instagramAppSecretConfigured' => $instagram['appSecret'] !== '',
        'instagramRedirectUri' => $instagram['redirectUri'], 'localInstagramConfigurationEditable' => sf_local_instagram_config_editable($user),
        'publicMediaConfigured' => str_starts_with(socialflow_public_base_url(), 'https://') || $instagram['dryRun'],
        'dryRun' => $instagram['dryRun'], 'apiVersion' => $instagram['apiVersion'],
        'translationConfigured' => socialflow_env('DEEPL_API_KEY') !== '' || socialflow_env('TRANSLATION_DRY_RUN') === 'true',
        'aiAgentConfigured' => sf_ai_runtime()['configured'],
    ]);
}
