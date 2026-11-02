const { top, json } = require("./_lib");

// GET /api/hop-leaderboard -> { top: [{ handle, score }, ...] }
module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });
  try {
    json(res, 200, { top: await top(10) });
  } catch (e) {
    json(res, 503, {
      error: "Sky Hop leaderboard unavailable",
      reason: String(e.message || e).slice(0, 160),
    });
  }
};
