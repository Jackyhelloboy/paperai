// Dedicated vLLM recipe: https://recipes.vllm.ai/baidu/Unlimited-OCR
// Images stay on the server-to-server path; credentials never reach the browser.
export const UNLIMITED_MODEL = 'baidu/Unlimited-OCR';

export function getOCRProvider(env) {
  return String(env.OCR_PROVIDER || (env.UNLIMITED_OCR_BASE_URL ? 'unlimited-ocr' : 'cloudflare-ai')).trim();
}

function providerError(message, code) {
  return Object.assign(new Error(message), { code });
}

export function cleanUnlimitedOutput(raw) {
  return String(raw || '')
    // Both the type+bbox and ref-type/bbox variants are emitted by this model.
    .replace(/<\|ref\|>(text|title|table|image|equation|header|footer|caption|list)\s*<\|\/ref\|>\s*(?=<\|det\|>)/gi, '')
    .replace(/<\|det\|>[\s\S]*?<\|\/det\|>/g, '')
    .replace(/<\|\/?ref\|>/g, '')
    .replace(/<\|(?:endoftext|eos|im_end|im_start)\|>/g, '')
    .replace(/^\s*```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```\s*$/i, '$1')
    .trim();
}

export async function runUnlimitedOCR(base64Image, mimeType, env, fetchImpl = fetch) {
  let endpoint;
  try {
    endpoint = new URL(String(env.UNLIMITED_OCR_BASE_URL || ''));
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
    endpoint.pathname = endpoint.pathname.replace(/\/$/, '') + '/chat/completions';
  } catch (_) {
    throw providerError('Unlimited-OCR needs an HTTPS API base URL ending in /v1.', 'UNLIMITED_OCR_CONFIGURATION');
  }
  if (!endpoint.pathname.endsWith('/v1/chat/completions') || !env.UNLIMITED_OCR_API_KEY) {
    throw providerError('Configure Unlimited-OCR /v1 base URL and API key in Worker secrets.', 'UNLIMITED_OCR_CONFIGURATION');
  }
  if (!/^image\/(?:jpeg|png|webp)$/.test(mimeType)) {
    throw providerError('Unlimited-OCR expects a JPEG, PNG or WebP page image. Render scanned PDFs to images first.', 'UNLIMITED_OCR_IMAGE_REQUIRED');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 170000);
  try {
    const response = await fetchImpl(endpoint.href, {
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + env.UNLIMITED_OCR_API_KEY,
      },
      body: JSON.stringify({
        model: UNLIMITED_MODEL,
        messages: [{ role: 'user', content: [
          { type: 'text', text: '<image>document parsing.' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ] }],
        temperature: 0,
        max_tokens: 8192,
        stream: false,
        skip_special_tokens: false,
        vllm_xargs: { ngram_size: 35, window_size: 128 },
      }),
    });
    if (!response.ok) {
      // Do not expose upstream HTML, request payloads or credentials in errors.
      throw providerError('Unlimited-OCR server returned HTTP ' + response.status + '. Check the model server.', 'UNLIMITED_OCR_UPSTREAM');
    }
    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw providerError('Unlimited-OCR reached its output limit. This page needs a longer model-server output budget.', 'UNLIMITED_OCR_TRUNCATED');
    }
    const text = cleanUnlimitedOutput(choice?.message?.content);
    if (!text) {
      throw providerError('Unlimited-OCR returned no text. Check the required prompt and logits processor on the model server.', 'UNLIMITED_OCR_EMPTY');
    }
    return { text, raw: text, model: UNLIMITED_MODEL, provider: 'unlimited-ocr', usage: data.usage || null, scanMode: 'unlimited-ocr-full-page', rescued: false };
  } catch (error) {
    if (controller.signal.aborted) throw providerError('Unlimited-OCR timed out. Retry this page with the same model.', 'UNLIMITED_OCR_TIMEOUT');
    if (error.code?.startsWith('UNLIMITED_OCR_')) throw error;
    throw providerError('Unlimited-OCR server is unreachable or returned an invalid response.', 'UNLIMITED_OCR_UPSTREAM');
  } finally {
    clearTimeout(timeout);
  }
}
