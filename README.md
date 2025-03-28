# 🟣 Multi-Network Faucet & Token Sender Bot

Bot ini digunakan untuk:
- ✅ **Claim Faucet** otomatis (multi-wallet + proxy + retry)
- ✅ **Send Token** otomatis (multi-wallet + multi-transaction + delay acak)
- ✅ Support **HTTP** & **SOCKS4/5 Proxy**
- ✅ Fitur **retry** saat faucet gagal
- ✅ CLI interaktif

---

## 📦 Installasi

1. Clone repository
   ```bash
   git clone <repo-url>
   cd <nama-folder>
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Struktur folder yang dibutuhkan:
   ```
   /config
     ├─ network.json
     ├─ wallet.js
     ├─ pk.txt
     └─ proxy.txt
   /utils
     └─ question.js
   index.js
   ```

---

## ⚙️ Konfigurasi

### 1. `config/network.json`

```json
{
  "network": {
    "somnia": {
      "rpc": "https://your-rpc-url",
      "faucetApi": "https://your-faucet-api",
      "symbol": "SMN",
      "explorer": "https://your-explorer.com"
    }
  }
}
```

### 2. `config/pk.txt`

Isi dengan daftar **Private Key** (tanpa `0x`) per baris:

```
aabbccddeeff...
99887766...
```

### 3. `config/proxy.txt`

Isi dengan daftar proxy (support `http://`, `socks4://`, `socks5://`) per baris:

```
http://127.0.0.1:8080
socks5://127.0.0.1:1080
```

---

## 🚀 Cara Menjalankan

```bash
node index.js
```

---

## 📜 Menu Utama

```
1. Claim Faucet       ✅
2. Send Token         💸
3. Keluar             🚪
```

---

## 🟢 Fitur Tambahan
- Random Delay
- Retry saat proxy gagal (EAI_AGAIN)
- Proxy rotator otomatis
- Multi-wallet support
- Cek saldo sebelum kirim token
- User-Agent custom

---

## 📝 Catatan
- Wajib isi `pk.txt` dengan private key wallet kamu
- Wajib isi `network.json` dengan data faucet & RPC yang valid
- Proxy opsional (jika kosong, tetap bisa berjalan tanpa proxy)

- I recode this code from https://github.com/airdropinsiders/MultiNetwork-Auto-Tx 