/** Keep the test fixture isolated from development servers in other projects. */
export const TEST_PORT = Number(process.env.SUKOON_TEST_PORT ?? 43173);
if (!Number.isInteger(TEST_PORT) || TEST_PORT < 1 || TEST_PORT > 65535) {
  throw new Error('SUKOON_TEST_PORT must be an integer between 1 and 65535');
}
export const TEST_PAGE = `http://127.0.0.1:${TEST_PORT}/`;
