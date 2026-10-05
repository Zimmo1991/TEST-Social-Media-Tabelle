import { spellCheckDocument } from "cspell-lib";

const supportedLanguages = new Set(["de", "it", "en", "auto"]);

const cspellLanguages = {
  de: { locale: "de-DE", imports: ["@cspell/dict-de-de/cspell-ext.json"], dictionaries: ["de-de"] },
  it: { locale: "it-IT", imports: ["@cspell/dict-it-it/cspell-ext.json"], dictionaries: ["it-it"] },
  en: { locale: "en-US", imports: ["@cspell/dict-en_us/cspell-ext.json"], dictionaries: ["en_us"] },
  auto: {
    locale: "de-DE,it-IT,en-US",
    imports: ["@cspell/dict-de-de/cspell-ext.json", "@cspell/dict-it-it/cspell-ext.json", "@cspell/dict-en_us/cspell-ext.json"],
    dictionaries: ["de-de", "it-it", "en_us"]
  }
};

const commonTypos = {
  de: new Map([
    ["wier", "wir"], ["vieleicht", "vielleicht"], ["warscheinlich", "wahrscheinlich"],
    ["nähmlich", "nämlich"], ["standart", "Standard"], ["seidher", "seither"],
    ["willkomen", "willkommen"], ["interresant", "interessant"]
  ]),
  it: new Map([
    ["perche", "perché"], ["qual'e", "qual è"], ["qual’è", "qual è"],
    ["un'altro", "un altro"], ["un’altro", "un altro"], ["pultroppo", "purtroppo"],
    ["sopratutto", "soprattutto"], ["aereoporto", "aeroporto"]
  ]),
  en: new Map([
    ["teh", "the"], ["recieve", "receive"], ["definately", "definitely"],
    ["seperate", "separate"], ["adress", "address"], ["occured", "occurred"],
    ["wich", "which"], ["untill", "until"], ["begining", "beginning"]
  ])
};

function normalizeLanguage(language) {
  const value = String(language || "auto").toLowerCase().split("-")[0];
  return supportedLanguages.has(value) ? value : "auto";
}

function normalizeIssues(text, issues) {
  const normalized = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const candidate = String(issue.text || "");
    let offset = Number(issue.offset);
    let length = Number(issue.length) || candidate.length;
    if (!Number.isInteger(offset) || offset < 0 || offset + length > text.length || (candidate && text.slice(offset, offset + length) !== candidate)) {
      offset = candidate ? text.toLocaleLowerCase().indexOf(candidate.toLocaleLowerCase()) : -1;
      length = candidate.length;
    }
    if (offset < 0 || !length || offset + length > text.length) continue;
    if (normalized.some(existing => offset < existing.offset + existing.length && existing.offset < offset + length)) continue;
    normalized.push({
      offset,
      length,
      text: text.slice(offset, offset + length),
      message: String(issue.message || "Möglicher Schreibfehler"),
      suggestion: String(issue.suggestion || "")
    });
  }
  return normalized.sort((a, b) => a.offset - b.offset).slice(0, 30);
}

function normalizeAllowedWords(words) {
  return [...new Set((Array.isArray(words) ? words : [])
    .map(word => String(word || "").trim())
    .filter(word => /^[\p{L}\p{M}][\p{L}\p{M}'’.-]{1,79}$/u.test(word)))]
    .slice(0, 500);
}

function suggestionFor(issue) {
  const suggestions = Array.isArray(issue.suggestions) ? issue.suggestions : [];
  const startsUppercase = issue.text[0] === issue.text[0]?.toLocaleUpperCase();
  return suggestions.find(suggestion => Boolean(suggestion[0] === suggestion[0]?.toLocaleUpperCase()) === startsUppercase)
    || suggestions[0]
    || "";
}

async function cspellProofread(text, language, allowedWords) {
  const configuration = cspellLanguages[language] || cspellLanguages.auto;
  const result = await spellCheckDocument(
    { uri: "planyoursocials-text.txt", text, languageId: "plaintext", locale: configuration.locale },
    { generateSuggestions: true, noConfigSearch: true },
    {
      import: configuration.imports,
      dictionaries: configuration.dictionaries,
      words: normalizeAllowedWords(allowedWords),
      suggestionsTimeout: 1_500,
      ignoreRegExpList: ["/https?:\\/\\/\\S+/g", "/[#@][\\p{L}\\p{N}_]+/gu"]
    }
  );
  return normalizeIssues(text, result.issues.map(issue => ({
    offset: issue.offset,
    length: issue.length,
    text: issue.text,
    message: "Möglicher Schreibfehler",
    suggestion: suggestionFor(issue)
  })));
}

export function localProofread(text, language = "auto") {
  const source = String(text || "");
  const selected = normalizeLanguage(language);
  const languages = selected === "auto" ? ["de", "it", "en"] : [selected];
  const issues = [];
  const wordPattern = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu;
  for (const match of source.matchAll(wordPattern)) {
    const key = match[0].toLocaleLowerCase();
    for (const languageKey of languages) {
      const suggestion = commonTypos[languageKey]?.get(key);
      if (!suggestion) continue;
      issues.push({ offset: match.index, length: match[0].length, text: match[0], message: "Möglicher Schreibfehler", suggestion });
      break;
    }
  }
  const repeatedWord = /\b([\p{L}\p{M}]{2,})\s+\1\b/giu;
  for (const match of source.matchAll(repeatedWord)) {
    const relativeOffset = match[0].toLocaleLowerCase().lastIndexOf(match[1].toLocaleLowerCase());
    issues.push({ offset: match.index + relativeOffset, length: match[1].length, text: match[1], message: "Wort versehentlich wiederholt", suggestion: "entfernen" });
  }
  return normalizeIssues(source, issues);
}

function outputText(responseBody) {
  if (typeof responseBody.output_text === "string") return responseBody.output_text;
  return (responseBody.output || []).flatMap(item => item.content || []).find(item => item.type === "output_text")?.text || "";
}

async function openAiProofread(text, language) {
  const languageLabel = { de: "Deutsch", it: "Italienisch", en: "Englisch", auto: "Deutsch, Italienisch oder Englisch" }[language];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      store: false,
      input: [{
        role: "user",
        content: [{ type: "input_text", text: [
          `Prüfe den folgenden Social-Media-Text auf eindeutige Rechtschreibfehler in ${languageLabel}.`,
          "Melde keine Stil-, Grammatik- oder Zeichensetzungsfragen. Namen, Ortsnamen, Marken, Hashtags, URLs und fremdsprachige Eigennamen sind korrekt zu behandeln.",
          "offset ist der nullbasierte Unicode-JavaScript-Stringindex des exakt zurückgegebenen fehlerhaften Textteils.",
          `TEXT:\n${text}`
        ].join("\n\n") }]
      }],
      text: {
        format: {
          type: "json_schema",
          name: "proofreading_result",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              issues: {
                type: "array",
                maxItems: 30,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    offset: { type: "integer", minimum: 0 },
                    length: { type: "integer", minimum: 1 },
                    text: { type: "string" },
                    message: { type: "string" },
                    suggestion: { type: "string" }
                  },
                  required: ["offset", "length", "text", "message", "suggestion"]
                }
              }
            },
            required: ["issues"]
          }
        }
      }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || "Rechtschreibprüfung nicht verfügbar");
  return normalizeIssues(text, JSON.parse(outputText(body)).issues);
}

export async function proofreadText(text, language = "auto", allowedWords = []) {
  const source = String(text || "").slice(0, 10_000);
  const selected = normalizeLanguage(language);
  if (!source.trim()) return { issues: [], provider: "local" };
  try {
    return { issues: await cspellProofread(source, selected, allowedWords), provider: "cspell" };
  } catch {
    if (process.env.OPENAI_API_KEY) {
      try { return { issues: await openAiProofread(source, selected), provider: "openai" }; }
      catch { /* Bei einem vorübergehenden Dienstfehler bleibt die einfache lokale Prüfung verfügbar. */ }
    }
    return { issues: localProofread(source, selected), provider: "local" };
  }
}
