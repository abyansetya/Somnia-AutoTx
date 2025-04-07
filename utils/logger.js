const SYMBOLS = {
  info: "📌",
  success: "✅",
  error: "❌",
  warning: "⚠️",
  processing: "🔄",
  wallet: "👛",
  upload: "📤",
  download: "📥",
  network: "🌐",
  divider: "═════════════════════════════════════════",
};

const logger = {
  info: (message) => console.log(`${SYMBOLS.info} ${message}`),
  success: (message) => console.log(`${SYMBOLS.success} ${message}`),
  error: (message) => console.log(`${SYMBOLS.error} ${message}`),
  warning: (message) => console.log(`${SYMBOLS.warning} ${message}`),
  processing: (message) => console.log(`${SYMBOLS.processing} ${message}`),
  wallet: (message) => console.log(`${SYMBOLS.wallet} ${message}`),
  upload: (message) => console.log(`${SYMBOLS.upload} ${message}`),
  download: (message) => console.log(`${SYMBOLS.download} ${message}`),
  network: (message) => console.log(`${SYMBOLS.network} ${message}`),
  divider: () => console.log(SYMBOLS.divider),
  result: (key, value) => console.log(`   ${key.padEnd(15)}: ${value}`),
};

// 👉 Kamu bisa pakai salah satu dari dua export ini, sesuai kebutuhan:

// Option 1: Named export
module.exports = { SYMBOLS, logger };
// Option 2: Default export sebagai satu objek
// export default { SYMBOLS, logger };
