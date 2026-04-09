/**
 * Production Request Confirmation
 * Previews request body and prompts for user confirmation before
 * sending write requests (POST/PUT/PATCH/DELETE) in production.
 */

import readline from "readline";

/**
 * Prompt the user to confirm a production write request.
 * Prints a preview of the method, endpoint, and body, then waits for y/n.
 *
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {object|string} [body] - Request body
 * @returns {Promise<boolean>} true if confirmed, false if rejected
 */
export async function confirmProductionRequest(method, path, body) {
  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  ⚠  PRODUCTION REQUEST PREVIEW                       ║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(`║  ${method.toUpperCase()} ${path}`);
  console.log("╠════════════════════════════════════════════════════════╣");

  if (body) {
    const formatted =
      typeof body === "string" ? body : JSON.stringify(body, null, 2);
    console.log("║  Body:");
    for (const line of formatted.split("\n")) {
      console.log(`║    ${line}`);
    }
  } else {
    console.log("║  Body: (none)");
  }

  console.log("╚════════════════════════════════════════════════════════╝");

  const answer = await askQuestion("Send this request to PRODUCTION? (y/n): ");
  return answer.trim().toLowerCase() === "y";
}

/**
 * Read a single line from stdin
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function askQuestion(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
