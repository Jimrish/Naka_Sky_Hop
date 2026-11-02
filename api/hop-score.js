const { redis, sign, json, top, KEY, NS } = require("./_lib");

// POST /api/hop-score
// Body: { handle, score, gems, time, t, token }
// score = metres climbed (points) + 50 per rainbow gem; time = seconds actually played.
module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" });
  let b = req.body;
  if (typeof b === "string") {
    try {
      b = JSON.parse(b);
    } catch (_) {
      b = null;
    }
  }
  if (!b || typeof b !== "object" || Array.isArray(b))
    return json(res, 400, { error: "Bad request" });

  const handle = String(b.handle || "").replace(/^@/, "");
  const score = Math.floor(Number(b.score));
  const gems = Math.floor(Number(b.gems));
  const time = Number(b.time);
  const t = Number(b.t);
  const [ts, nonce, sig] = String(b.token || "").split(".");

  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle))
    return json(res, 400, { error: "Invalid X handle" });
  if (
    !Number.isFinite(score) ||
    score < 0 ||
    score > 200000 ||
    !Number.isInteger(gems) ||
    gems < 0 ||
    gems > 2000 ||
    !Number.isFinite(time) ||
    time < 0 ||
    time > 7200 ||
    !Number.isFinite(t) ||
    t < 0 ||
    t > 7200
  ) {
    return json(res, 400, { error: "Invalid Sky Hop result" });
  }
  if (!ts || !nonce || !sig || sign(ts + "." + nonce) !== sig) {
    return json(res, 403, { error: "Invalid token" });
  }
  const age = (Date.now() - Number(ts)) / 1000;
  if (!Number.isFinite(age) || age < 0 || age > 7200 || t > age + 5) {
    return json(res, 403, { error: "Timing check failed" });
  }

  // Plausibility. In the game a normal bounce climbs ~200 px/s and a spring ~330 px/s at best,
  // so 600 px/s is a deliberately generous ceiling. Gems sit on at most ~22% of platforms,
  // which are at least 70 px apart, so the gem count is bounded by the height climbed.
  const climb = score - gems * 50;
  if (climb < 0)
    return json(res, 400, { error: "Sky Hop score not plausible" });
  if (climb > time * 600 + 300)
    return json(res, 400, { error: "Sky Hop score not plausible" });
  if (gems > Math.ceil(climb / 150) + 3)
    return json(res, 400, { error: "Sky Hop score not plausible" });

  try {
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    const rateKey = NS + ":rate:" + ip;
    const count = await redis(["INCR", rateKey]);
    if (count === 1) await redis(["EXPIRE", rateKey, 600]);
    if (count > 30)
      return json(res, 429, { error: "Too many submissions, try again later" });

    const fresh = await redis([
      "SET",
      NS + ":used:" + nonce,
      "1",
      "NX",
      "EX",
      7200,
    ]);
    if (fresh !== "OK") return json(res, 403, { error: "Token already used" });

    const member = handle.toLowerCase();
    await redis(["ZADD", KEY, "GT", score, member]);
    const rank = await redis(["ZREVRANK", KEY, member]);
    json(res, 200, { ok: true, rank: rank + 1, top: await top(10) });
  } catch (e) {
    json(res, 503, {
      error: "Sky Hop leaderboard unavailable",
      reason: String(e.message || e).slice(0, 160),
    });
  }
};
