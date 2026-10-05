import Tesseract from "tesseract.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const { createWorker, OEM, PSM } = Tesseract;
const languageDataPath = resolve(dirname(fileURLToPath(import.meta.url)), "ocr-data");
let workerPromise = null;
let recognitionQueue = Promise.resolve();

function normalizeOcrText(value) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 10_000);
}

async function ocrWorker() {
  if (!workerPromise) {
    workerPromise = createWorker(["deu", "ita", "eng"], OEM.LSTM_ONLY, {
      langPath: languageDataPath,
      gzip: false,
      cacheMethod: "none",
      errorHandler: error => console.error("OCR-Engine:", error)
    }).then(async worker => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      return worker;
    }).catch(error => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export function recognizeImageText(image) {
  const run = recognitionQueue.then(async () => {
    const worker = await ocrWorker();
    const result = await worker.recognize(image);
    return {
      text: normalizeOcrText(result.data?.text),
      confidence: Math.max(0, Math.min(100, Math.round(Number(result.data?.confidence) || 0))),
      languages: ["de", "it", "en"]
    };
  });
  recognitionQueue = run.catch(() => undefined);
  return run;
}
