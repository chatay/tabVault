import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WEBHOOK_SECRET = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET')!;

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('x-signature');
  const body = await req.text();

  // Verify webhook signature using HMAC SHA-256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expectedSignature = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (signature !== expectedSignature) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);
  const eventName = event.meta.event_name;
  const email = event.data.attributes.user_email;

  if (eventName === 'subscription_created' || eventName === 'subscription_resumed') {
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'cloud_paid' })
      .eq('email', email);
  }

  if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
    await supabase
      .from('profiles')
      .update({ subscription_tier: 'cloud_free' })
      .eq('email', email);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
