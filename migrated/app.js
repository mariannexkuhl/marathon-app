import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const form = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const characterCount = document.querySelector("#character-count");
const formStatus = document.querySelector("#form-status");
const sendButton = document.querySelector("#send-button");
const messageList = document.querySelector("#message-list");
const messageCount = document.querySelector("#message-count");
const emptyState = document.querySelector("#empty-state");
const flowSteps = [...document.querySelectorAll(".flow-step")];
const flowPlaintext = document.querySelector("#flow-plaintext");
const flowCiphertext = document.querySelector("#flow-ciphertext");
const flowRecovered = document.querySelector("#flow-recovered");
const flowStatus = document.querySelector("#flow-status");
const MAX_MESSAGE_BYTES = 1000;
const encoder = new TextEncoder();
const HKDF_INFO = encoder.encode("marathon-ml-kem-aes-gcm-v1");
let kemKeyPair;
let messagesSent = 0;

const keyReady = initializeKeys();

messageInput.addEventListener("input", () => {
  characterCount.textContent = `${encoder.encode(messageInput.value).length} / ${MAX_MESSAGE_BYTES} bytes`;
  formStatus.textContent = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();

  if (!message) {
    formStatus.textContent = "Write a message before sending.";
    messageInput.focus();
    return;
  }

  const messageBytes = encoder.encode(message);
  if (messageBytes.length > MAX_MESSAGE_BYTES) {
    formStatus.textContent = `ML-KEM + AES-256-GCM allows up to ${MAX_MESSAGE_BYTES} UTF-8 bytes per message.`;
    return;
  }

  if (!kemKeyPair) {
    await keyReady;
  }

  if (!kemKeyPair) {
    return;
  }

  sendButton.disabled = true;
  resetFlow(message);
  formStatus.textContent = "Encrypting with ML-KEM + AES-256-GCM…";

  try {
    setFlowStep(0, "active");
    await pause(450);
    const { cipherText: kemCipherText, sharedSecret } = ml_kem768.encapsulate(kemKeyPair.publicKey);
    const aesKey = await deriveAesKey(sharedSecret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aeadBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, messageBytes);
    const aeadCipherText = new Uint8Array(aeadBuffer);
    const ciphertext = toHex(concatBytes(kemCipherText, iv, aeadCipherText));
    flowCiphertext.textContent = ciphertext;
    setFlowStep(0, "done");
    setFlowStep(1, "active");
    await pause(450);
    const recoveredSharedSecret = ml_kem768.decapsulate(kemCipherText, kemKeyPair.secretKey);
    const recoveredAesKey = await deriveAesKey(recoveredSharedSecret);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, recoveredAesKey, aeadCipherText);
    const recoveredMessage = new TextDecoder().decode(decryptedBuffer);
    flowRecovered.textContent = recoveredMessage;
    setFlowStep(1, "done");
    setFlowStep(2, "done");
    flowStatus.textContent = "Decryption complete. Recovered message matches the original.";
    appendMessage(recoveredMessage, ciphertext);
    form.reset();
    characterCount.textContent = `0 / ${MAX_MESSAGE_BYTES} bytes`;
    formStatus.textContent = "Message encrypted and recovered in the local demo.";
  } catch {
    flowStatus.textContent = "Encryption or decryption failed.";
    formStatus.textContent = "ML-KEM + AES-256-GCM could not process this message. Please try again.";
  } finally {
    sendButton.disabled = false;
  }
});

function appendMessage(message, ciphertext) {
  messagesSent += 1;
  const item = document.createElement("li");
  item.className = "message-item";

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const number = document.createElement("span");
  number.textContent = `MESSAGE ${String(messagesSent).padStart(2, "0")}`;

  const timestamp = document.createElement("time");
  timestamp.dateTime = new Date().toISOString();
  timestamp.textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
  meta.append(number, timestamp);

  const encryptedBlock = document.createElement("div");
  encryptedBlock.className = "cipher-block";
  const encryptedLabel = document.createElement("span");
  encryptedLabel.className = "cipher-label";
  encryptedLabel.textContent = "ML-KEM + AES-256-GCM CIPHERTEXT";
  const encryptedValue = document.createElement("code");
  encryptedValue.className = "cipher-value";
  encryptedValue.textContent = ciphertext;
  encryptedBlock.append(encryptedLabel, encryptedValue);

  const recoveredBlock = document.createElement("p");
  recoveredBlock.className = "message-copy";
  recoveredBlock.textContent = message;
  item.append(meta, encryptedBlock, recoveredBlock);
  messageList.prepend(item);
  emptyState.hidden = true;
  messageCount.textContent = String(messagesSent).padStart(2, "0");
}

function resetFlow(message) {
  flowSteps.forEach((step) => step.classList.remove("active", "done"));
  flowPlaintext.textContent = message;
  flowCiphertext.textContent = "Waiting for encryption";
  flowRecovered.textContent = "Waiting for decryption";
  flowStatus.textContent = "Ready to encrypt.";
}

function setFlowStep(index, state) {
  flowSteps[index].classList.remove("active", "done");
  flowSteps[index].classList.add(state);
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...arrays) {
  const total = arrays.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of arrays) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Binds the derived AES key to this demo's envelope so it cannot be reused for an unrelated HKDF context.
async function deriveAesKey(sharedSecret) {
  const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function pause(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function initializeKeys() {
  if (!globalThis.crypto?.subtle) {
    formStatus.textContent = "ML-KEM is unavailable here. Open this demo on localhost.";
    flowStatus.textContent = "Web Crypto is unavailable.";
    return;
  }

  try {
    kemKeyPair = ml_kem768.keygen();
    sendButton.disabled = false;
    formStatus.textContent = "ML-KEM keypair ready.";
    flowStatus.textContent = "Ready to encrypt.";
  } catch {
    formStatus.textContent = "ML-KEM is unavailable here. Open this demo on localhost.";
    flowStatus.textContent = "ML-KEM keypair could not be created.";
  }
}