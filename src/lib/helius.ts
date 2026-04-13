const HELIUS_API_KEY  = process.env.HELIUS_API_KEY!;
const HELIUS_WEBHOOK_ID = process.env.HELIUS_WEBHOOK_ID!;
const HELIUS_BASE    = 'https://api.helius.xyz/v0';

/**
 * Fetches the current webhook config from Helius so we can read the
 * existing accountAddresses before appending to them.
 */
async function getWebhook() {
  const res = await fetch(
    `${HELIUS_BASE}/webhooks/${HELIUS_WEBHOOK_ID}?api-key=${HELIUS_API_KEY}`,
  );
  if (!res.ok) throw new Error(`Helius GET webhook failed: ${res.status}`);
  return res.json();
}

/**
 * Appends newAddress to the Helius webhook's accountAddresses list.
 * Safe to call multiple times — deduplication is handled here.
 * Called server-side only; HELIUS_API_KEY never reaches the browser.
 */
export async function syncHeliusWebhook(newAddress: string): Promise<void> {
  if (!HELIUS_API_KEY || !HELIUS_WEBHOOK_ID) {
    console.warn('[helius] HELIUS_API_KEY or HELIUS_WEBHOOK_ID not set — skipping sync');
    return;
  }

  const current = await getWebhook();
  const existing: string[] = current.accountAddresses ?? [];

  // Nothing to do if already registered
  if (existing.includes(newAddress)) {
    console.log('[helius] address already registered:', newAddress);
    return;
  }

  const updated = [...existing, newAddress];

  const res = await fetch(
    `${HELIUS_BASE}/webhooks/${HELIUS_WEBHOOK_ID}?api-key=${HELIUS_API_KEY}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...current,          // preserve all existing webhook settings
        accountAddresses: updated,
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Helius PUT webhook failed (${res.status}): ${text}`);
  }

  console.log(`[helius] added address ${newAddress} — total watched: ${updated.length}`);
}
