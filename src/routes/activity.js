// TODO #14: Transfer History / Activity Log
const { log } = require("../utils");

const MAX_ACTIVITY_ENTRIES = Number(process.env.ACTIVITY_LOG_MAX) || 500;
const activityLog = [];

function recordActivity(action, details) {
  activityLog.push({
    action,
    ...details,
    timestamp: new Date().toISOString(),
  });
  while (activityLog.length > MAX_ACTIVITY_ENTRIES) {
    activityLog.shift();
  }
}

module.exports = function registerActivityRoutes(app, { auth }) {
  const { requireRole } = auth;

  // Get recent activity
  app.get("/activity", requireRole("admin"), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, MAX_ACTIVITY_ENTRIES);
    const recent = activityLog.slice(-limit).reverse();
    res.json({ entries: recent, total: activityLog.length });
  });
};

module.exports.recordActivity = recordActivity;
