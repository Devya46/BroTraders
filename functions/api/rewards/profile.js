// POST /api/rewards/profile  body: { display_name }
//
// Updates the user's display name and, if profile_complete was not yet marked,
// awards the profile-completion bonus.

import {
  jsonResponse,
  jsonError,
  verifySupabaseToken,
  rateFor,
  postLedger,
  getUserRow,
} from "./_lib.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) return jsonError("D1 binding missing", 500);

  const user = await verifySupabaseToken(request, env);
  if (!user) return jsonError("unauthorized", 401);

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return jsonError("invalid_json", 400);
  }
  const displayName = (body.display_name || "").trim();
  if (!displayName || displayName.length > 60) return jsonError("invalid_display_name", 400);

  let row = await getUserRow(env, user.id);
  if (!row) return jsonError("user_not_synced", 404);

  await env.DB
    .prepare(`UPDATE users SET display_name = ? WHERE id = ?`)
    .bind(displayName, user.id)
    .run();

  let awarded = false;
  if (!row.profile_complete) {
    await env.DB
      .prepare(`UPDATE users SET profile_complete = 1 WHERE id = ?`)
      .bind(user.id)
      .run();
    await postLedger(env, {
      user_id: user.id,
      amount: rateFor("profile_complete", !!row.is_pro_bro),
      reason: "profile_complete",
      note: "Profile completion bonus",
    });
    awarded = true;
  }

  const updated = await getUserRow(env, user.id);
  return jsonResponse({
    ok: true,
    awarded,
    points_balance: updated.points_balance,
    display_name: updated.display_name,
  });
}
