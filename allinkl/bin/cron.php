<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require_once dirname(__DIR__) . '/lib/bootstrap.php';
require_once dirname(__DIR__) . '/lib/config.php';
require_once dirname(__DIR__) . '/lib/instagram.php';
socialflow_db();
$lock = fopen(socialflow_data_dir() . '/.publication-cron.lock','c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(0);
try { sf_process_due_publications(); }
finally { flock($lock, LOCK_UN); fclose($lock); }
