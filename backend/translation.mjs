function configurationError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function translationConfiguration() {
  const apiKey = process.env.DEEPL_API_KEY || "";
  const apiUrl = process.env.DEEPL_API_URL || (apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate");
  return {
    apiKey,
    apiUrl,
    dryRun: process.env.TRANSLATION_DRY_RUN === "true"
  };
}

export async function translateFromGerman(text, targetLanguage) {
  const sourceText = String(text || "").trim();
  const target = targetLanguage === "IT" ? "IT" : targetLanguage === "EN-GB" ? "EN-GB" : "";
  if (!sourceText) throw configurationError("Gib zuerst einen deutschen Beitragstext ein.", 400);
  if (sourceText.length > 20_000) throw configurationError("Der Beitragstext ist für eine einzelne Übersetzung zu lang.", 400);
  if (!target) throw configurationError("Als Zielsprache sind Italienisch oder Englisch möglich.", 400);

  const config = translationConfiguration();
  if (config.dryRun) return { text: `[${target}] ${sourceText}`, provider: "test" };
  if (!config.apiKey) {
    throw configurationError("Die automatische Übersetzung ist noch nicht eingerichtet. Hinterlege dafür DEEPL_API_KEY in der .env-Datei.");
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ text: [sourceText], source_lang: "DE", target_lang: target })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.message || body.error?.message || `HTTP ${response.status}`;
    throw configurationError(`Die Übersetzung konnte nicht erstellt werden: ${detail}`, response.status === 429 ? 429 : 502);
  }
  const translation = body.translations?.[0]?.text;
  if (!translation) throw configurationError("Der Übersetzungsdienst hat keinen Text zurückgegeben.", 502);
  return { text: translation, provider: "DeepL" };
}
