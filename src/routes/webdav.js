const path = require("path");
const webdav = require("webdav-server").v2;
const bcrypt = require("bcrypt");
const { PROJECT_ROOT } = require("../config");
const { log } = require("../utils");
const { users, authEnabled } = require("../auth");

const publicDir = path.join(PROJECT_ROOT, "public");

module.exports = function registerWebDAVRoutes(app) {
  // HTTP Basic auth for WebDAV clients (file managers don't support cookie auth)
  const userManager = new webdav.SimpleUserManager();
  const privilegeManager = new webdav.SimplePathPrivilegeManager();

  // Build user list from the same env-based users as the main app
  const webdavUsers = {};
  if (authEnabled) {
    for (const [username, userData] of Object.entries(users)) {
      const user = userManager.addUser(username, "", false);
      webdavUsers[username] = {
        user,
        hash: userData.passwordHash,
        role: userData.role,
      };

      if (userData.role === "admin") {
        privilegeManager.setRights(user, "/", ["all"]);
      } else {
        privilegeManager.setRights(user, "/", [
          "canRead",
          "canReadLocks",
          "canReadContent",
          "canReadProperties",
          "canReadContentSource",
        ]);
      }
    }
  }

  // Custom HTTP Basic authenticator that verifies against bcrypt hashes
  const httpAuth = new webdav.HTTPBasicAuthentication(
    userManager,
    "secure-file-server",
  );
  const originalGetUser = httpAuth.getUser.bind(httpAuth);

  httpAuth.getUser = function (ctx, callback) {
    const authHeader = ctx.headers.find("Authorization");
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      if (!authEnabled) {
        // No auth configured — allow anonymous with full access
        const defaultUser = userManager.getDefaultUser();
        privilegeManager.setRights(defaultUser, "/", ["all"]);
        return callback(null, defaultUser);
      }
      return callback(webdav.Errors.MissingAuthorisationHeader);
    }

    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx === -1) {
      return callback(webdav.Errors.BadAuthentication);
    }
    const username = decoded.slice(0, colonIdx);
    const password = decoded.slice(colonIdx + 1);

    const entry = webdavUsers[username];
    if (!entry) {
      return callback(webdav.Errors.BadAuthentication);
    }

    bcrypt.compare(password, entry.hash, (err, match) => {
      if (err || !match) {
        return callback(webdav.Errors.BadAuthentication);
      }
      callback(null, entry.user);
    });
  };

  const server = new webdav.WebDAVServer({
    httpAuthentication: httpAuth,
    privilegeManager,
    rootFileSystem: new webdav.PhysicalFileSystem(publicDir),
  });

  // Mount WebDAV under /webdav/
  app.use(webdav.extensions.express("/webdav", server));

  log.info(`WebDAV endpoint mounted at /webdav/ → ${publicDir}`);
};
