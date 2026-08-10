import "server-only";
import { randomInt } from "node:crypto";

const temporaryPasswordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateTemporaryPassword(length = 16) {
  const safeLength = Math.max(12, Math.min(length, 72));
  let password = "";
  for (let index = 0; index < safeLength; index += 1) {
    password += temporaryPasswordAlphabet[randomInt(temporaryPasswordAlphabet.length)];
  }
  return password;
}

