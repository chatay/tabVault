import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, savesInWindow, triggeredAt } = await req.json();

    const ownerEmail = Deno.env.get('OWNER_EMAIL');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!ownerEmail || !resendApiKey) {
      throw new Error('Missing OWNER_EMAIL or RESEND_API_KEY secret');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const dashboardUrl = `${supabaseUrl}/project/default/editor`;

    const emailBody = `
A TabVault user has been permanently blocked for abuse.

Details:
- User ID: ${userId}
- Saves in 2 minutes: ${savesInWindow}
- Blocked at: ${triggeredAt}

Review in Supabase:
${dashboardUrl}

To unblock this user if it was a mistake:
UPDATE profiles SET ai_blocked = false WHERE id = '${userId}';

If you have questions from the user they will contact: support@tabvault.com
    `.trim();

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'TabVault Alerts <alerts@tabvault.com>',
        to: ownerEmail,
        subject: `🚨 User Blocked — ${savesInWindow} saves in 2 minutes`,
        text: emailBody,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend API error: ${response.status}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    // Log but never crash — blocking still happened even if email fails
    console.error('notify-owner-blocked-user failed:', error);

    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
