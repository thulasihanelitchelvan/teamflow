// Tests must target a dedicated test database, never the developer database.
if (!process.env.MONGODB_TEST_URI) {
  throw new Error("Set MONGODB_TEST_URI to a dedicated MongoDB replica-set database before running tests.");
}
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
process.env.SESSION_SECRET = "test-only-session-secret-that-is-long-enough";
process.env.SESSION_COOKIE_NAME = "teamflow.test.sid";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.NODE_ENV = "test";
