import type { AppConfig, ChatMessage, MemoryRecord, NoteRecord, ReminderRecord } from '../src/types/nova';

export async function generateCloudflareRestReply(params: {
  userMessage: string;
  history: ChatMessage[];
  config: AppConfig;
  memories: MemoryRecord[];
  notes: NoteRecord[];
  reminders: ReminderRecord[];
  systemInstruction: string;
}): Promise<{ text: string; modelUsed: string }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const model =
    process.env.CLOUDFLARE_MODEL?.trim() || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare account ID or API token is not configured.');
  }

  const messages = [
    { role: 'system', content: params.systemInstruction },
    ...params.history.slice(-10).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: params.userMessage },
  ];

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cloudflare AI error (${response.status}): ${errText.slice(0, 220)}`);
  }

  const data = (await response.json()) as {
    success?: boolean;
    result?: { response?: string };
    errors?: Array<{ message?: string }>;
  };

  const reply = data.result?.response?.trim();
  if (!reply) {
    const errMsg = data.errors?.[0]?.message || 'Cloudflare AI returned an empty response.';
    throw new Error(errMsg);
  }

  return { text: reply, modelUsed: model };
}
