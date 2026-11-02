const { redis, json, KEY, NS } = require("./_lib");

// GET /api/health -> safe Upstash connection check for Naka Sky Hop.
module.exports = async (req, res) => {
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });
  const out = {
    game: "Naka Sky Hop",
    leaderboardKey: KEY,
    envVarNamesFound: Object.keys(process.env).filter((k) =>
      /REST|KV_|UPSTASH|REDIS/i.test(k)
    ),
  };
  try {
    out.ping = await redis(["PING"]);
    await redis(["SET", NS + ":health", "ok", "EX", 60]);
    out.writeAndRead = await redis(["GET", NS + ":health"]);
    out.hoppersOnBoard = await redis(["ZCARD", KEY]);
    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.reason = String(e.message || e).slice(0, 160);
  }
  json(res, out.ok ? 200 : 503, out);
};
