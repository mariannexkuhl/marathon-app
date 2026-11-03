### Marathon App

- A browser-only message encryption demo that uses RSA-OAEP as its cryptographic scheme.
- The app encrypts a short plaintext with an RSA public key, decrypts it with the matching private key, and displays the ciphertext and recovered message.
- RSA is quantum-unsafe: a sufficiently capable quantum computer could break the public-key scheme.
- RSA-OAEP with a 2048-bit key and SHA-256 OAEP hash accepts at most 190 bytes of plaintext.
- The generated keypair and messages exist only in page memory and disappear on reload. No backend, account system, or third-party dependencies.
- Run on localhost so the browser's Web Crypto API is available in a secure context.
