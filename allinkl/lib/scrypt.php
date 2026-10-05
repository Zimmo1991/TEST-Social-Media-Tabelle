<?php
declare(strict_types=1);

// Kompatibilität zu Node.js crypto.scryptSync (N=16384, r=8, p=1).
function sf_rotl32(int $value, int $count): int { return (($value << $count) | ($value >> (32 - $count))) & 0xffffffff; }

function sf_salsa208(string $block): string {
    $original = array_values(unpack('V16', $block));
    $x = $original;
    for ($round = 0; $round < 4; $round++) {
        $x[4] ^= sf_rotl32(($x[0] + $x[12]) & 0xffffffff, 7);
        $x[8] ^= sf_rotl32(($x[4] + $x[0]) & 0xffffffff, 9);
        $x[12] ^= sf_rotl32(($x[8] + $x[4]) & 0xffffffff, 13);
        $x[0] ^= sf_rotl32(($x[12] + $x[8]) & 0xffffffff, 18);
        $x[9] ^= sf_rotl32(($x[5] + $x[1]) & 0xffffffff, 7);
        $x[13] ^= sf_rotl32(($x[9] + $x[5]) & 0xffffffff, 9);
        $x[1] ^= sf_rotl32(($x[13] + $x[9]) & 0xffffffff, 13);
        $x[5] ^= sf_rotl32(($x[1] + $x[13]) & 0xffffffff, 18);
        $x[14] ^= sf_rotl32(($x[10] + $x[6]) & 0xffffffff, 7);
        $x[2] ^= sf_rotl32(($x[14] + $x[10]) & 0xffffffff, 9);
        $x[6] ^= sf_rotl32(($x[2] + $x[14]) & 0xffffffff, 13);
        $x[10] ^= sf_rotl32(($x[6] + $x[2]) & 0xffffffff, 18);
        $x[3] ^= sf_rotl32(($x[15] + $x[11]) & 0xffffffff, 7);
        $x[7] ^= sf_rotl32(($x[3] + $x[15]) & 0xffffffff, 9);
        $x[11] ^= sf_rotl32(($x[7] + $x[3]) & 0xffffffff, 13);
        $x[15] ^= sf_rotl32(($x[11] + $x[7]) & 0xffffffff, 18);

        $x[1] ^= sf_rotl32(($x[0] + $x[3]) & 0xffffffff, 7);
        $x[2] ^= sf_rotl32(($x[1] + $x[0]) & 0xffffffff, 9);
        $x[3] ^= sf_rotl32(($x[2] + $x[1]) & 0xffffffff, 13);
        $x[0] ^= sf_rotl32(($x[3] + $x[2]) & 0xffffffff, 18);
        $x[6] ^= sf_rotl32(($x[5] + $x[4]) & 0xffffffff, 7);
        $x[7] ^= sf_rotl32(($x[6] + $x[5]) & 0xffffffff, 9);
        $x[4] ^= sf_rotl32(($x[7] + $x[6]) & 0xffffffff, 13);
        $x[5] ^= sf_rotl32(($x[4] + $x[7]) & 0xffffffff, 18);
        $x[11] ^= sf_rotl32(($x[10] + $x[9]) & 0xffffffff, 7);
        $x[8] ^= sf_rotl32(($x[11] + $x[10]) & 0xffffffff, 9);
        $x[9] ^= sf_rotl32(($x[8] + $x[11]) & 0xffffffff, 13);
        $x[10] ^= sf_rotl32(($x[9] + $x[8]) & 0xffffffff, 18);
        $x[12] ^= sf_rotl32(($x[15] + $x[14]) & 0xffffffff, 7);
        $x[13] ^= sf_rotl32(($x[12] + $x[15]) & 0xffffffff, 9);
        $x[14] ^= sf_rotl32(($x[13] + $x[12]) & 0xffffffff, 13);
        $x[15] ^= sf_rotl32(($x[14] + $x[13]) & 0xffffffff, 18);
    }
    $sum = [];
    for ($i = 0; $i < 16; $i++) $sum[] = ($x[$i] + $original[$i]) & 0xffffffff;
    return pack('V*', ...$sum);
}

function sf_blockmix(string $block): string {
    $x = substr($block, 960, 64);
    $even = ''; $odd = '';
    for ($i = 0; $i < 16; $i++) {
        $x = sf_salsa208($x ^ substr($block, $i * 64, 64));
        if (($i & 1) === 0) $even .= $x; else $odd .= $x;
    }
    return $even . $odd;
}

function sf_node_scrypt(string $password, string $salt, int $length = 64): string {
    $x = hash_pbkdf2('sha256', $password, $salt, 1, 1024, true);
    $memory = [];
    for ($i = 0; $i < 16384; $i++) { $memory[] = $x; $x = sf_blockmix($x); }
    for ($i = 0; $i < 16384; $i++) {
        $index = unpack('V', substr($x, 960, 4))[1] & 16383;
        $x = sf_blockmix($x ^ $memory[$index]);
    }
    return hash_pbkdf2('sha256', $password, $x, 1, $length, true);
}

function sf_verify_node_scrypt(string $password, string $stored): bool {
    $parts = explode('.', $stored);
    if (count($parts) !== 3 || $parts[0] !== 'scrypt') return false;
    $salt = socialflow_unb64url($parts[1]); $expected = socialflow_unb64url($parts[2]);
    if ($salt === false || $expected === false || strlen($salt) !== 16 || strlen($expected) !== 64) return false;
    return hash_equals($expected, sf_node_scrypt($password, $salt, strlen($expected)));
}
